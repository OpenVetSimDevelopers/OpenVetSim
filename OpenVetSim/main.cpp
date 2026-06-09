/*
 * main.cpp
 *
 * SimMgr application entry point
 *
 * This file is part of the sim-mgr distribution.
 *
 * Copyright (c) 2019-2021 VetSim, Cornell University College of Veterinary Medicine Ithaca, NY
 * Copyright (c) 2022-2025 ITown Design, Ithaca, NY
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
#ifdef _WIN32
#include <comdef.h>     // _bstr_t used in checkProcessRunning()
#endif

// Version string shown in window title and console
char WVSversion[STR_SIZE];

/*
 * getBuildDate
 *
 * Encode the compiler __DATE__ / __TIME__ macros into a compact integer
 * (YYYYMMDDHH) so a version bump is automatic on every build.
 */
static int64_t
getBuildDate(void)
{
	char date[] = __DATE__; // "Mmm dd yyyy"
	char time[] = __TIME__; // "hh:mm:ss"
	uint64_t dcode;
	uint64_t month = 0;

	printf("Build Date %s %s  ", date, time);

	uint64_t year = (uint64_t)atoi(&date[7]);

	if      (strncmp(&date[0], "Jan", 3) == 0) month = 1;
	else if (strncmp(&date[0], "Feb", 3) == 0) month = 2;
	else if (strncmp(&date[0], "Mar", 3) == 0) month = 3;
	else if (strncmp(&date[0], "Apr", 3) == 0) month = 4;
	else if (strncmp(&date[0], "May", 3) == 0) month = 5;
	else if (strncmp(&date[0], "Jun", 3) == 0) month = 6;
	else if (strncmp(&date[0], "Jul", 3) == 0) month = 7;
	else if (strncmp(&date[0], "Aug", 3) == 0) month = 8;
	else if (strncmp(&date[0], "Sep", 3) == 0) month = 9;
	else if (strncmp(&date[0], "Oct", 3) == 0) month = 10;
	else if (strncmp(&date[0], "Nov", 3) == 0) month = 11;
	else if (strncmp(&date[0], "Dec", 3) == 0) month = 12;

	date[6] = 0;
	uint64_t day  = (uint64_t)atoi(&date[4]);
	time[2] = 0;
	uint64_t hour = (uint64_t)atoi(time);

	// Use portable %" PRIu64 " — or just cast to unsigned long long for printf
	printf("%" PRIu64 " %" PRIu64 " %" PRIu64 " %" PRIu64 "\n", year, month, day, hour);

	dcode  = year  * 1000000ULL;
	dcode += month *   10000ULL;
	dcode += day   *     100ULL;
	dcode += hour;

	return (int64_t)dcode;
}

void
setWVSVersion(void)
{
	sprintf_s(WVSversion, STR_SIZE, "%d.%d.%" PRId64,
		SIMMGR_VERSION_MAJ, SIMMGR_VERSION_MIN, getBuildDate());
}

/*
 * checkProcessRunning
 *
 * Returns the number of WinVetSim processes currently running (including
 * this one).  The caller expects:
 *   1  → first/only instance   (OK to continue)
 *  >1  → duplicate instance    (abort)
 *   0  → process not found     (shouldn't happen; abort)
 *
 * On Windows: uses the Toolhelp32 snapshot API.
 * On POSIX:   uses a lock-file in /tmp so a second launch is detected.
 */
int checkProcessRunning(void)
{
#ifdef _WIN32
	PROCESSENTRY32 entry;
	entry.dwSize = sizeof(PROCESSENTRY32);
	int count = 0;

	HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, NULL);
	if (Process32First(snapshot, &entry) == TRUE)
	{
		while (Process32Next(snapshot, &entry) == TRUE)
		{
			_bstr_t b(entry.szExeFile);
			const char* c = b;
			if (_stricmp(c, "WinVetSim.exe") == 0)
				count++;
		}
	}
	CloseHandle(snapshot);
	return count;

#else
	// POSIX: use a lock file
	const char* lockPath = "/tmp/wvetsim.lock";
	int fd = open(lockPath, O_CREAT | O_RDWR, 0666);
	if (fd < 0) return 1; // can't open → assume first instance

	struct flock fl;
	fl.l_type   = F_WRLCK;
	fl.l_whence = SEEK_SET;
	fl.l_start  = 0;
	fl.l_len    = 0;

	if (fcntl(fd, F_SETLK, &fl) == -1)
	{
		// Lock held by another process → duplicate
		close(fd);
		return 2;
	}
	// Lock acquired — keep fd open for the life of this process
	// (kernel releases the lock when the process exits)
	return 1;
#endif
}

/*
 * initializeConfiguration
 *
 * Set all configurable parameters to their compiled-in defaults, then
 * override from the registry (Windows) or environment + INI file (POSIX).
 */
void
initializeConfiguration(void)
{
	localConfig.port_pulse      = DEFAULT_PORT_PULSE;
	localConfig.port_status     = DEFAULT_PORT_STATUS;
	localConfig.php_server_port = DEFAULT_PHP_SERVER_PORT;
	sprintf_s(localConfig.php_server_addr, sizeof(localConfig.php_server_addr),
		"%s", DEFAULT_PHP_SERVER_ADDRESS);
	sprintf_s(localConfig.log_name, sizeof(localConfig.log_name),
		"%s", DEFAULT_LOG_NAME);

#ifdef _WIN32
	// On Windows: honour OPENVETSIM_HTML_PATH if set (injected by the Electron
	// launcher — points to %PROGRAMDATA%\OpenVetSim in a packaged install, or
	// the repo root in development).  Fall back to %PROGRAMDATA%\OpenVetSim,
	// then %PUBLIC%\WinVetSim\html for legacy compatibility.
	{
		char* envHtmlPath = nullptr;
		size_t envLen = 0;
		if (_dupenv_s(&envHtmlPath, &envLen, "OPENVETSIM_HTML_PATH") == 0 && envHtmlPath)
		{
			sprintf_s(localConfig.html_path, sizeof(localConfig.html_path),
				"%s", envHtmlPath);
			free(envHtmlPath);
		}
		else
		{
			// Fall back: %PROGRAMDATA%\OpenVetSim (shared, writable by all users)
			char* progData = nullptr;
			size_t pdLen = 0;
			if (_dupenv_s(&progData, &pdLen, "PROGRAMDATA") == 0 && progData)
			{
				sprintf_s(localConfig.html_path, sizeof(localConfig.html_path),
					"%s\\OpenVetSim", progData);
				free(progData);
			}
			else
			{
				sprintf_s(localConfig.html_path, sizeof(localConfig.html_path),
					".\\%s", DEFAULT_HTML_PATH);
			}
		}
	}
#else
	// On POSIX: honour OPENVETSIM_HTML_PATH if set (injected by the Electron
	// launcher so the binary always finds the web files whether running in dev
	// mode or from a packaged .app bundle).  Fall back to ./html if not set.
	const char* envHtmlPath = getenv("OPENVETSIM_HTML_PATH");
	if (envHtmlPath)
		sprintf_s(localConfig.html_path, sizeof(localConfig.html_path),
			"%s", envHtmlPath);
	else
		sprintf_s(localConfig.html_path, sizeof(localConfig.html_path),
			"./html");
#endif

	printf("Default html path is %s\n", localConfig.html_path);

	// Allow parameters to be overridden from registry / INI file
	getKeys();
}

// ================================================================
//  WINDOWS RELEASE BUILD — Win32 GUI entry point
// ================================================================
#if defined(_WIN32) && defined(NDEBUG)

#include <strsafe.h>
#include <shellapi.h>

#ifdef _UNICODE
typedef wchar_t TCHAR;
#else
typedef char TCHAR;
#endif

#define MAX_LOADSTRING 100

HINSTANCE hInst;
static TCHAR szWindowClass[] = _T("DesktopApp");
static TCHAR szTitle[]       = _T("WinVetSim");
static HINSTANCE ghInstance  = NULL;

LRESULT CALLBACK WndProc(HWND, UINT, WPARAM, LPARAM);
INT_PTR CALLBACK About(HWND, UINT, WPARAM, LPARAM);
void ErrorExit(LPCTSTR lpszFunction);

HWND mainWindow;

int APIENTRY wWinMain(_In_ HINSTANCE hInstance,
	_In_opt_ HINSTANCE /*hPrevInstance*/,
	_In_ LPWSTR    /*lpCmdLine*/,
	_In_ int       nCmdShow)
{
	MSG  msg;
	BOOL bRet;
	WNDCLASS wc;

	int sts = checkProcessRunning();
	if (sts == 0)
	{
		MessageBox(0, L"WinVetSim process not found", L"Error!", MB_ICONSTOP | MB_OK);
		exit(-1);
	}
	if (sts != 1)
	{
		MessageBox(0, L"An instance of WinVetSim is already running.", L"Error!", MB_ICONSTOP | MB_OK);
		exit(-1);
	}

	setWVSVersion();
	initializeConfiguration();

	wc.style         = 0;
	wc.lpfnWndProc   = (WNDPROC)WndProc;
	wc.cbClsExtra    = 0;
	wc.cbWndExtra    = 0;
	wc.hInstance     = hInstance;
	wc.hIcon         = LoadIcon((HINSTANCE)NULL, IDI_APPLICATION);
	wc.hCursor       = LoadCursor((HINSTANCE)NULL, IDC_ARROW);
	wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
	wc.lpszMenuName  = L"MainMenu";
	wc.lpszClassName = L"MainWndClass";

	if (!RegisterClass(&wc))
		return FALSE;

	ghInstance = hInstance;

	WNDCLASSEX wcex;
	memset((void*)&wcex, 0, sizeof(WNDCLASSEX));
	wcex.cbSize        = sizeof(WNDCLASSEX);
	wcex.style         = CS_HREDRAW | CS_VREDRAW;
	wcex.lpfnWndProc   = WndProc;
	wcex.hInstance     = hInstance;
	wcex.hIcon         = LoadIcon(hInstance, IDI_APPLICATION);
	wcex.hIconSm       = LoadIcon(hInstance, IDI_APPLICATION);
	wcex.hCursor       = LoadCursor(NULL, IDC_ARROW);
	wcex.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
	wcex.lpszMenuName  = L"WinVetSim Menu";
	wcex.lpszClassName = szWindowClass;

	if (!RegisterClassEx(&wcex))
	{
		MessageBox(0, L"Window Registration Failed!", L"Error!", MB_ICONSTOP | MB_OK);
		return 1;
	}

	HWND hWnd = CreateWindowEx(
		WS_EX_CLIENTEDGE, szWindowClass, szTitle,
		WS_OVERLAPPEDWINDOW,
		CW_USEDEFAULT, CW_USEDEFAULT, 700, 500,
		NULL, NULL, hInstance, NULL);

	if (!hWnd)
	{
		MessageBox(0, L"Window Creation Failed!", L"Error!", MB_ICONSTOP | MB_OK);
		return 1;
	}

	ShowWindow(hWnd, nCmdShow);
	UpdateWindow(hWnd);
	mainWindow = hWnd;

	(void)start_task("VetSim", vetsim);

	while ((bRet = GetMessage(&msg, NULL, 0, 0)) != 0)
	{
		if (bRet == -1)
		{
			// handle error
		}
		else
		{
			TranslateMessage(&msg);
			DispatchMessage(&msg);
		}
	}
	return (int)msg.wParam;
}

HWND hButton, hCombo, hEdit, hList, hScroll, hStatic;
static HFONT hLogFont;

LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam)
{
	PAINTSTRUCT ps;
	HDC    hdc;
	TCHAR  greeting[] = _T("Open VetSim Simulator System");
	TCHAR  buffer[128] = { 0, };

	switch (message)
	{
	case WM_CREATE:
	{
		RECT rc;
		GetClientRect(hWnd, &rc);
		hEdit = CreateWindowExW(0, L"EDIT", NULL,
			WS_CHILD | WS_VISIBLE | WS_VSCROLL | WS_HSCROLL |
			ES_MULTILINE | ES_AUTOVSCROLL | ES_AUTOHSCROLL | ES_READONLY,
			0, 70, rc.right, rc.bottom - 70,
			hWnd, NULL, (HINSTANCE)GetWindowLongPtrW(hWnd, GWLP_HINSTANCE), NULL);

		hLogFont = CreateFontW(
			-14, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
			DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
			DEFAULT_QUALITY, FIXED_PITCH | FF_MODERN, L"Consolas");
		if (hLogFont)
			SendMessageW(hEdit, WM_SETFONT, (WPARAM)hLogFont, TRUE);
		break;
	}

	case WM_SIZE:
	{
		RECT rc;
		GetClientRect(hWnd, &rc);
		if (hEdit)
			MoveWindow(hEdit, 0, 70, rc.right, rc.bottom - 70, TRUE);
		break;
	}

	case WM_APP_LOG:
	{
		wchar_t* line = reinterpret_cast<wchar_t*>(lParam);
		if (hEdit && line)
		{
			// Append line (O(1): move caret to end, replace selection)
			int len = GetWindowTextLengthW(hEdit);
			SendMessageW(hEdit, EM_SETSEL, (WPARAM)len, (LPARAM)len);
			SendMessageW(hEdit, EM_REPLACESEL, FALSE, (LPARAM)line);
			SendMessageW(hEdit, EM_REPLACESEL, FALSE, (LPARAM)L"\r\n");
			SendMessageW(hEdit, EM_SCROLLCARET, 0, 0);

			// Cap line count to prevent unbounded growth
			int lineCount = (int)SendMessageW(hEdit, EM_GETLINECOUNT, 0, 0);
			if (lineCount > LOG_WINDOW_MAX_LINES)
			{
				int trimEnd = (int)SendMessageW(hEdit, EM_LINEINDEX, LOG_WINDOW_TRIM_LINES, 0);
				SendMessageW(hEdit, EM_SETSEL, 0, (LPARAM)trimEnd);
				SendMessageW(hEdit, EM_REPLACESEL, FALSE, (LPARAM)L"");
			}
		}
		free(line);
		return 0;
	}

	case WM_PAINT:
		hdc = BeginPaint(hWnd, &ps);
		TextOut(hdc, 10, 10, greeting, (int)_tcslen(greeting));
		swprintf_s(buffer, sizeof(buffer)/sizeof(buffer[0]),
			L"SimMgr Version %hs\n", WVSversion);
		TextOut(hdc, 10, 30, buffer, (int)_tcslen(buffer));
		if (PHP_SERVER_PORT == 80)
			swprintf_s(buffer, sizeof(buffer)/sizeof(buffer[0]),
				L"Control URL: http://%hs/sim-ii/ii.php\n", PHP_SERVER_ADDR);
		else
			swprintf_s(buffer, sizeof(buffer)/sizeof(buffer[0]),
				L"Control URL: http://%hs:%d/sim-ii/ii.php\n", PHP_SERVER_ADDR, PHP_SERVER_PORT);
		TextOut(hdc, 10, 50, buffer, (int)_tcslen(buffer));
		EndPaint(hWnd, &ps);
		break;

	case WM_DESTROY:
		if (hLogFont)
		{
			DeleteObject(hLogFont);
			hLogFont = NULL;
		}
		stopPHPServer();
		PostQuitMessage(0);
		break;

	case WM_CLOSE:
		DestroyWindow(hWnd);
		break;

	default:
		return DefWindowProc(hWnd, message, wParam, lParam);
	}
	return 0;
}

void ErrorExit(LPCTSTR lpszFunction)
{
	LPVOID lpMsgBuf;
	LPVOID lpDisplayBuf;
	DWORD  dw = GetLastError();

	FormatMessage(
		FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
		NULL, dw, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
		(LPTSTR)&lpMsgBuf, 0, NULL);

	lpDisplayBuf = LocalAlloc(LMEM_ZEROINIT,
		(lstrlen((LPCTSTR)lpMsgBuf) + lstrlen((LPCTSTR)lpszFunction) + 40) * sizeof(TCHAR));
	if (lpDisplayBuf)
	{
		StringCchPrintf((LPTSTR)lpDisplayBuf, LocalSize(lpDisplayBuf) / sizeof(TCHAR),
			TEXT("%s failed with error %d: %s"), lpszFunction, dw, lpMsgBuf);
		MessageBox(NULL, (LPCTSTR)lpDisplayBuf, TEXT("Error"), MB_OK);
		LocalFree(lpDisplayBuf);
	}
	LocalFree(lpMsgBuf);
	ExitProcess(dw);
}

#else
// ================================================================
//  ALL OTHER BUILDS — console entry point (Windows debug + POSIX)
// ================================================================

#include "vetsim.h"
using namespace std;

int main(int argc, char* argv[])
{
	int sts = checkProcessRunning();
	if (sts == 0)
	{
		fprintf(stderr, "WinVetSim process not found\n");
		exit(-1);
	}
	if (sts != 1)
	{
		fprintf(stderr, "An instance of WinVetSim is already running.\n");
		exit(-1);
	}

	setWVSVersion();
	initializeConfiguration();

	if (argc > 1)
	{
		for (int i = 1; i < argc; i++)
		{
			if (strncmp(argv[i], "-v",        2) == 0 ||
			    strncmp(argv[i], "-V",        2) == 0 ||
			    strncmp(argv[i], "--version", 9) == 0 ||
			    strncmp(argv[i], "--Version", 9) == 0)
			{
				// Print just the executable name (strip path)
				const char* ptr = argv[0];
				for (size_t c = 0; c < strlen(argv[0]); c++)
				{
					if (argv[0][c] == '/' || argv[0][c] == '\\')
						ptr = &argv[0][c + 1];
				}
				printf("%s: SimMgr %s\n", ptr, WVSversion);
				exit(0);
			}
			else
			{
				fprintf(stderr, "Unrecognized argument: \"%s\"\n", argv[i]);
				exit(-1);
			}
		}
	}

	printf("SimMgr %s\n", WVSversion);
	vetsim();

	return 0;
}

#endif  // _WIN32 && NDEBUG
