/*
 * WebSrv.cpp
 *
 * Manage the embedded PHP web server for WinVetSim / OpenVetSim.
 *
 * Responsibilities:
 *   - Locate the php executable (bundled or system-installed)
 *   - Launch  "php -S <addr>:<port> sim-ii/router.php"
 *   - Poll until the server responds to HTTP (health-check)
 *   - Provide a stop function for clean shutdown
 *
 * This file is part of the sim-mgr distribution.
 *
 * Copyright (c) 2021 VetSim, Cornell University College of Veterinary Medicine Ithaca, NY
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
*/

#include "vetsim.h"
#include <filesystem>

namespace fs = std::filesystem;

using namespace std;

// Forward declaration
static int checkURL(const string& host, const string& port, const string& page);

// ----------------------------------------------------------------
// isServerRunning
// ----------------------------------------------------------------
int isServerRunning(void)
{
	// Health-check over loopback, NOT over PHP_SERVER_ADDR.
	//
	// PHP_SERVER_ADDR is a BIND address and is "0.0.0.0" so that phones on the
	// LAN can reach sim-remote.  "0.0.0.0" means "all interfaces" when binding,
	// but it is not a valid destination to CONNECT to: Windows rejects it with
	// WSAEADDRNOTAVAIL.  macOS and Linux happen to treat it as loopback, which
	// is why using it here worked there and failed on Windows with a misleading
	// "Could not start PHP Server" -- PHP had in fact started correctly, and it
	// was this check that could not reach it.
	//
	// Binding to 0.0.0.0 always includes loopback, so 127.0.0.1 is the correct
	// and portable way to ask "is my own PHP server up?".
	string host = "127.0.0.1";
	string port = to_string(PHP_SERVER_PORT);
	string page = "sim-ii/hostCheck.php";
	return checkURL(host, port, page);
}

// ----------------------------------------------------------------
// stopPHPServer
//
// Send a platform-appropriate signal / command to terminate the
// PHP server process that was started by startPHPServer().
// ----------------------------------------------------------------
void
stopPHPServer(void)
{
#ifdef _WIN32
	// Kill the php.exe process launched by startPHPServer().
	system("taskkill /F /IM php.exe /T");
#else
	// POSIX: kill by matching command-line pattern
	// "pkill -f" sends SIGTERM to all processes whose argv matches the pattern.
	system("pkill -f 'php.*router.php'");
#endif
}

// ----------------------------------------------------------------
// findPhpPath
//
// Search well-known locations for a php executable.
// Fills phpPath[] and returns 1 on success, 0 if not found.
//
// Search order (both platforms):
//   1. Bundled copy next to this binary   ./PHP8.0/
//   2. Platform-specific system locations
// ----------------------------------------------------------------
char phpPath[FILENAME_MAX] = { 0, };

// Settings passed to every PHP server we start.
//   session.upload_progress.enabled=0  The session upload-progress feature is
//       the route CVE-2026-109619 uses, and CVE-2026-115560 (Oct 2026, not yet
//       fixed in a release) is in the same code. OpenVetSim never uses it, so
//       it is switched off rather than left as attack surface.
//   expose_php=0  Don't advertise the PHP version in every response header.
// These harden PHP; they are not a substitute for a fixed release (see
// scripts/download-php.sh and download-php.ps1).
#define PHP_HARDEN_OPTS "-d session.upload_progress.enabled=0 -d expose_php=0"

// A PHP found outside the bundle may be any age - old WinVetSim installs
// carry PHP 8.0, which has no security fixes at all. Say so in the log.
static void
warnUnbundledPhp(const char* dir)
{
	char msg[FILENAME_MAX + 200];
	sprintf_s(msg, sizeof(msg),
		"WARNING: using PHP from %s, not the copy bundled with OpenVetSim. "
		"It may be an old release with known security flaws.", dir);
	printf("%s\n", msg);
	log_message("", msg);
}

int
findPhpPath(void)
{
	// Helper: does <dir>/<name> exist as a regular file?
	auto hasExe = [](const fs::path& dir, const string& name) -> bool
	{
		fs::path candidate = dir / name;
		std::error_code ec;
		return fs::is_regular_file(candidate, ec);
	};

#ifdef _WIN32
	const string phpExe = "php.exe";
#else
	const string phpExe = "php";
#endif

	// ---- 1. Bundled copy (highest priority, same on all platforms) ----
	{
		fs::path bundled("./PHP8.0");
		if (hasExe(bundled, phpExe))
		{
			// Use the absolute path so the launch command still works after
			// cd-ing to html_path (which may be a different directory).
			sprintf_s(phpPath, sizeof(phpPath), "%s", fs::absolute(bundled).string().c_str());
			return 1;
		}
	}

#ifdef _WIN32
	// ---- 2. Windows: Program Files locations ----
	struct { const char* base; const char* sub; } winPaths[] = {
		{ "C:/Program Files/WinVetSim",    "PHP8.0"      },
		{ "C:/Program Files (x86)/PHP",    "v8.0"        },
		{ "C:/Program Files/PHP",          "v8.0"        },
		{ "C:/Program Files/PHP",          "v7.4"        },
		{ "C:/Program Files (x86)/PHP",    "v7.4"        },
		{ "C:/Program Files/PHP",          "v7.3"        },
		{ "C:/Program Files (x86)/PHP",    "v7.3"        },
		{ "C:/Program Files/PHP",          "v7.2"        },
		{ "C:/Program Files (x86)/PHP",    "v7.2"        },
	};
	for (auto& p : winPaths)
	{
		fs::path dir = fs::path(p.base) / p.sub;
		if (hasExe(dir, phpExe))
		{
			sprintf_s(phpPath, sizeof(phpPath), "%s", dir.string().c_str());
			warnUnbundledPhp(phpPath);
			return 1;
		}
	}

#else
	// ---- 2. POSIX: common install locations ----
	const char* posixPaths[] = {
		"/usr/local/bin",    // macOS Homebrew or manual install
		"/opt/homebrew/bin", // macOS Apple-Silicon Homebrew
		"/usr/bin",          // Linux apt/dnf packages
		nullptr
	};
	for (int i = 0; posixPaths[i] != nullptr; i++)
	{
		fs::path dir(posixPaths[i]);
		if (hasExe(dir, phpExe))
		{
			sprintf_s(phpPath, sizeof(phpPath), "%s", dir.string().c_str());
			warnUnbundledPhp(phpPath);
			return 1;
		}
	}
#endif

	printf("findPhpPath: php not found in any known location\n");
	return 0;
}

// ----------------------------------------------------------------
// startPHPServer
//
// Launch the PHP built-in web server and wait up to 1 second for
// it to start accepting connections.
// Returns 0 on success, -1 on failure.
// ----------------------------------------------------------------
int
startPHPServer(void)
{
	char commandLine[2048];
	// Must hold the longest message formatted into it below. That includes
	// "starting PHP: <commandLine>" (commandLine is 2048) and the loopback
	// NOTE (~330 bytes). The old size of 300 overflowed on the loopback NOTE,
	// and sprintf_s aborts the process on overflow -- so on any machine whose
	// winvetsim.ini pins serverAddress to 127.0.0.1 (the very case the NOTE
	// warns about), the engine was killed right after logging "starting PHP",
	// blanking the UI. Size generously to cover commandLine plus a prefix.
	char mbuf[2300];
	int  rval = -1;

	if (isServerRunning() != 0)
	{
		sprintf_s(mbuf, sizeof(mbuf), "%s", "isServerRunning() says PHP is Already Running");
		log_message("", mbuf);
		return 0;
	}

	if (findPhpPath() == 0)
	{
		sprintf_s(mbuf, sizeof(mbuf), "%s", "findPhpPath() Fails");
		log_message("", mbuf);
		printf("Cannot find PHP\n");
		return rval;
	}

	printf("Starting PHP Server from %s\n", phpPath);

#ifdef _WIN32
	// Windows: launch PHP via CreateProcess with CREATE_NO_WINDOW so no
	// console or taskbar entry appears.  Output is redirected to the PHP log.
	{
		char phpLog[FILENAME_MAX];
		sprintf_s(phpLog, sizeof(phpLog), "%s\\simlogs\\php.log", localConfig.html_path);

		SECURITY_ATTRIBUTES sa = { sizeof(sa), nullptr, TRUE };
		HANDLE hLog = CreateFileA(phpLog, GENERIC_WRITE,
			FILE_SHARE_READ, &sa,
			OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
		if (hLog != INVALID_HANDLE_VALUE)
			SetFilePointer(hLog, 0, nullptr, FILE_END);

		STARTUPINFOA si = { sizeof(si) };
		si.dwFlags     = STARTF_USESTDHANDLES;
		si.hStdInput   = INVALID_HANDLE_VALUE;
		si.hStdOutput  = (hLog != INVALID_HANDLE_VALUE) ? hLog : INVALID_HANDLE_VALUE;
		si.hStdError   = (hLog != INVALID_HANDLE_VALUE) ? hLog : INVALID_HANDLE_VALUE;

		PROCESS_INFORMATION pi = {};
		char phpCmd[4096];
		sprintf_s(phpCmd, sizeof(phpCmd),
			"\"%s\\php.exe\" " PHP_HARDEN_OPTS " -S %s:%d sim-ii/router.php",
			phpPath, PHP_SERVER_ADDR, PHP_SERVER_PORT);

		if (CreateProcessA(nullptr, phpCmd, nullptr, nullptr,
			TRUE,  // inherit handles so log file is passed through
			CREATE_NO_WINDOW | DETACHED_PROCESS,
			nullptr, localConfig.html_path, &si, &pi))
		{
			CloseHandle(pi.hProcess);
			CloseHandle(pi.hThread);
		}
		if (hLog != INVALID_HANDLE_VALUE)
			CloseHandle(hLog);

		// Record what we launched for the log
		sprintf_s(commandLine, sizeof(commandLine),
			"%s (CreateProcess, no window, log: %s)", phpCmd, phpLog);
	}
#else
	// POSIX: launch as background process, redirect output to a log file.
	sprintf_s(commandLine, sizeof(commandLine),
		"cd \"%s\" && \"%s/php\" " PHP_HARDEN_OPTS " -S %s:%d sim-ii/router.php >simlogs/php.log 2>&1 &",
		localConfig.html_path, phpPath,
		PHP_SERVER_ADDR, PHP_SERVER_PORT);
#endif

	sprintf_s(mbuf, sizeof(mbuf), "starting PHP: %s", commandLine);
	log_message("", mbuf);

	/*
	 * Warn loudly if PHP is bound to loopback only.
	 *
	 * The compiled default is 0.0.0.0 so that phones, tablets and other
	 * computers can reach the interface. But winvetsim.ini, in the HTML data
	 * directory, overrides it -- and that file is created once from whatever
	 * the default was at the time and then never updated by any installer.
	 *
	 * So an installation first set up before the default changed still carries
	 * "serverAddress = 127.0.0.1", which silently defeats sim-remote and the
	 * remote instructor interface on every subsequent upgrade. The failure is
	 * invisible from the machine itself, because the Electron window connects
	 * over 127.0.0.1 and works perfectly; only other devices are refused.
	 *
	 * Not corrected automatically: an administrator may deliberately want
	 * loopback-only. But it must not be silent -- diagnosing this from the far
	 * end costs hours, as it did once already.
	 */
	if (strcmp(PHP_SERVER_ADDR, "127.0.0.1") == 0 ||
		strcmp(PHP_SERVER_ADDR, "localhost") == 0)
	{
		sprintf_s(mbuf, sizeof(mbuf),
			"NOTE: PHP is bound to %s, so only this computer can reach the "
			"interface. Phones, tablets and other computers will NOT connect. "
			"To allow them, set  serverAddress = 0.0.0.0  in %s/winvetsim.ini "
			"and restart. (This value is usually left over from an older "
			"installation; the current default is 0.0.0.0.)",
			PHP_SERVER_ADDR, localConfig.html_path);
		log_message("", mbuf);
	}
#ifndef _WIN32
	system(commandLine);
#endif

	// Poll until the server is up. The loop breaks the instant PHP answers, so
	// a long ceiling costs nothing on a fast machine -- but it MUST be generous,
	// because on some machines PHP takes several seconds to first respond (cold
	// disk, and especially antivirus scanning php.exe on launch). The old 1 s
	// ceiling timed out before PHP was ready on such machines, and the caller
	// then treated that as fatal and exited, killing the whole simulator.
	// Wait up to 30 seconds (3000 * 10 ms).
	for (int checkCount = 3000; checkCount > 0; checkCount--)
	{
		sim_sleep_ms(10);
		if (isServerRunning() != 0)
		{
			rval = 0;
			break;
		}
	}

	return rval;
}

// ----------------------------------------------------------------
// checkURL  (internal helper)
//
// Make a minimal HTTP GET request to host:port/page.
// Returns the number of bytes received in the response body
// (positive = server is responding), or 0 on failure.
//
// Uses only POSIX-compatible BSD sockets via platform.h shims,
// so the same code compiles on Windows (WinSock2) and macOS/Linux.
// ----------------------------------------------------------------
static int
checkURL(const string& host, const string& port, const string& page)
{
	SOCKET     Socket = INVALID_SOCKET;
	int        nDataLength;
	string     website_HTML;
	int        found = 0;

	// Build the HTTP/1.1 GET request
	string get_http =
		"GET /" + page + " HTTP/1.1\r\n"
		"Host: " + host + "\r\n"
		"Connection: close\r\n\r\n";

	WSAData wsaData;
	WSAStartup(0x0202, &wsaData);   // no-op on POSIX via platform.h

	struct addrinfo  hints;
	struct addrinfo* result = nullptr;
	struct addrinfo* ptr    = nullptr;

	ZeroMemory(&hints, sizeof(hints));
	hints.ai_family   = AF_INET;
	hints.ai_socktype = SOCK_STREAM;
	hints.ai_protocol = IPPROTO_TCP;

	int dwRetval = getaddrinfo(host.c_str(), port.c_str(), &hints, &result);
	if (dwRetval != 0)
	{
		// printf("getaddrinfo failed: %d\n", dwRetval);
		WSACleanup();
		return 0;
	}

	for (ptr = result; ptr != nullptr; ptr = ptr->ai_next)
	{
		if (ptr->ai_family == AF_INET) { found = 1; break; }
	}

	if (found)
	{
		Socket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
		if (Socket != INVALID_SOCKET)
		{
			if (connect(Socket, ptr->ai_addr, (int)ptr->ai_addrlen) == 0)
			{
				send(Socket, get_http.c_str(), (int)get_http.size(), 0);

				char buffer[4096];
				int  i = 0;
				while ((nDataLength = recv(Socket, buffer, sizeof(buffer) - 1, 0)) > 0)
				{
					buffer[nDataLength] = '\0';
					website_HTML += buffer;
					i += nDataLength;
				}
			}
			closesocket(Socket);
		}
	}

	freeaddrinfo(result);
	WSACleanup();   // no-op on POSIX

	return (int)website_HTML.length();
}
