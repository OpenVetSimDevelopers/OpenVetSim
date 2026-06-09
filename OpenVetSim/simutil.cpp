/*
 * simutil.cpp
 *
 * Common functions for the various SimMgr processes
 *
 * This file is part of the sim-mgr distribution
 * TODO: Add link to GitHub for WinVetSim
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

using namespace std;

#define SIMUTIL	1

extern char msg_buf[];

struct simmgr_shm* simmgr_shm;	// Pointer to the shared memory / global struct

/*
 * FUNCTION: initSHM
 *
 * Open the shared memory space.
 * On Windows the shared memory is a global struct inherited in-process.
 * On POSIX the same approach is used (single-process model).
 *
 * Parameters: none
 * Returns: 0 for success
 */
int
initSHM(void)
{
	extern struct simmgr_shm shmSpace;
	simmgr_shm = &shmSpace;

	// Initialise the mutex handles that live inside the struct
	simmgr_shm->instructor.sema = sim_create_mutex();
	simmgr_shm->logfile.sema    = sim_create_mutex();

	return (0);
}

/*
 * Function: getTimeStr
 *
 * Get the current timestamp for logging.
 *
 * Parameters: pointer to buffer to receive the timestamp
 * Returns:    pointer to the same buffer
 */
char*
getTimeStr(char* timeStr)
{
	time_t timer;
	struct tm tm_info;

	timer = time(NULL);
	localtime_s(&tm_info, &timer);   // platform.h maps this to localtime_r on POSIX
	strftime(timeStr, 26, "%Y-%m-%d %H:%M:%S", &tm_info);
	return timeStr;
}

/*
 * Function: log_message_init
 *
 * Create the mutex for the common log file and write a startup message.
 *
 * Parameters: none
 * Returns:    none
 */

#include <filesystem>
namespace fs = std::filesystem;

char log_dir[512]          = { 0, };
char default_log_file[512] = { 0, };

// Cross-platform mutex protecting log-file writes
static SIM_MUTEX log_sema = nullptr;

void
log_message_init(void)
{
	sprintf_s(log_dir, 512, "%s/simlogs", localConfig.html_path);
	printf("log_dir is %s\n", log_dir);
	sprintf_s(default_log_file, 512, "%s/simlogs/vetsim.log", localConfig.html_path);

	// Create log directory if it doesn't exist
	if (!sim_dir_exists(log_dir))
	{
		sim_mkdir(log_dir);
	}

	log_sema = sim_create_mutex();
	if (!log_sema)
	{
		printf("CreateMutex error: %d\n", GetLastError());
		exit(203);
	}

	log_message("", "Log Started");
}

// Windows-only: append text to the edit control in the GUI window (async via PostMessage)
#ifdef _WIN32
#ifdef NDEBUG
extern HWND hEdit;
extern HWND mainWindow;

void append_text_to_edit(const wchar_t* newText)
{
	if (!mainWindow || !newText) return;

	// Heap-copy so the UI thread owns it and will free() it after processing
	wchar_t* copy = _wcsdup(newText);
	if (!copy) return;

	if (!PostMessageW(mainWindow, WM_APP_LOG, 0, (LPARAM)copy))
		free(copy);
}

void append_text_to_edit(char* buffer)
{
	if (!buffer) return;

	size_t convertedChars = 0;
	wchar_t wcstring[LOG_BUF_SIZE];
	errno_t err = mbstowcs_s(&convertedChars, wcstring, LOG_BUF_SIZE, buffer, _TRUNCATE);
	if (!err)
		append_text_to_edit(wcstring);
}
#endif // NDEBUG
#endif // _WIN32

/*
 * Function: log_message
 *
 * Log a message to the common log file or to a named file.
 * Thread-safe via the cross-platform log_sema mutex.
 *
 * Parameters:
 *   filename - filename to open for appending; empty string uses the default log
 *   message  - NULL-terminated message string
 */
void
log_message(const char* filename, const char* message)
{
	FILE*   logfile = nullptr;
	errno_t err;
	char    timeBuf[32];

	if (log_sema == nullptr)
	{
		// Mutex not yet created — just write to stdout during early init
		printf("%s\n", message);
		return;
	}

	sim_lock_mutex(log_sema);

	if (strlen(filename) > 0)
		err = fopen_s(&logfile, filename, "a");
	else
		err = fopen_s(&logfile, default_log_file, "a");

	if (err != 0)
	{
		char errstr[256];
		strerror_s(errstr, sizeof(errstr), err);
		fprintf(stderr, "log_message: fopen_s(%s) failed: %s\n", default_log_file, errstr);
	}
	else if (logfile)
	{
		(void)getTimeStr(timeBuf);
		fprintf(logfile, "%s: %s\n", timeBuf, message);
		fclose(logfile);
	}

	// Also print to stdout for console visibility
	printf("%s\n", message);

#ifdef _WIN32
#ifdef NDEBUG
	// On Windows GUI build: push message asynchronously to the edit control
	append_text_to_edit(const_cast<char*>(message));
#endif // NDEBUG
#endif // _WIN32

	sim_unlock_mutex(log_sema);
}

/*
 * do_command_read
 *
 * Issue a shell command and read the first line of output.
 */
char*
do_command_read(const char* cmd_str, char* buffer, int max_len)
{
	FILE* fp;
	char* cp;
	char* token1 = nullptr;

	fp = _popen(cmd_str, "r");
	if (fp == nullptr)
	{
		cp = nullptr;
	}
	else
	{
		cp = fgets(buffer, max_len, fp);
		if (cp != nullptr)
		{
			(void)strtok_s(buffer, "\n", &token1); // strip newline
		}
		_pclose(fp);
	}
	return cp;
}

/*
 * get_date
 *
 * Fill buffer with a human-readable timestamp.
 */
void
get_date(char* buffer, int maxLen)
{
	time_t    long_time;
	struct tm newtime;
	char      timebuf[64];
	char*     ptr;

	_time64(&long_time);                          // platform.h maps to time() on POSIX
	_localtime64_s(&newtime, &long_time);          // platform.h maps to localtime_r on POSIX
	asctime_s(timebuf, sizeof(timebuf), &newtime); // platform.h maps to asctime_r on POSIX

	// Strip trailing newline that asctime adds
	ptr = timebuf;
	while (*ptr)
	{
		if (*ptr == '\n') { *ptr = 0; break; }
		ptr++;
	}
	sprintf_s(buffer, maxLen, "%s", timebuf);
}

/*
 * IP address helpers
 */
char eth0_ip[512] = { 0, };
char wifi_ip[512] = { 0, };
char ipAddr[512]  = { 0, };

char* get_IP(const char* /*iface*/)
{
	// Network interface enumeration is platform-specific.
	// Currently returns an empty string; extend per-platform as needed.
	return ipAddr;
}

char*
getETH0_IP()
{
	sprintf_s(eth0_ip, sizeof(eth0_ip), "");
	return eth0_ip;
}

char*
getWIFI_IP()
{
	char* addr = get_IP("wlp58s0");
	sprintf_s(wifi_ip, sizeof(wifi_ip), "%s", addr);
	return wifi_ip;
}

/*
 * cleanString
 *
 * Remove leading/trailing spaces; collapse internal runs to a single space;
 * remove tabs, newlines, and CRs.
 */
#define WHERE_START		0
#define WHERE_TEXT		1
#define WHERE_SPACE		2

void
cleanString(char* strIn)
{
	char* in  = strIn;
	char* out = strIn;
	int   where = WHERE_START;

	while (*in)
	{
		if (isspace((unsigned char)*in))
		{
			if (where == WHERE_TEXT)
			{
				*out++ = ' ';
				where = WHERE_SPACE;
			}
			// WHERE_START and WHERE_SPACE: skip
		}
		else
		{
			where = WHERE_TEXT;
			*out++ = *in;
		}
		in++;
	}
	// Remove trailing space if any
	if (out > strIn && *(out - 1) == ' ')
		out--;
	*out = '\0';
}

/*
 * takeInstructorLock / releaseInstructorLock
 *
 * Wrapper around the cross-platform SIM_MUTEX embedded in simmgr_shm.
 */
int
takeInstructorLock()
{
#ifdef _WIN32
	DWORD sts = WaitForSingleObject(simmgr_shm->instructor.sema, 1000);
	if (sts == WAIT_OBJECT_0)
		return (0);
	printf("WaitForSingleObject failed: %lu\n", GetLastError());
	return (-1);
#else
	sim_lock_mutex(simmgr_shm->instructor.sema);
	return (0);
#endif
}

void
releaseInstructorLock()
{
	sim_unlock_mutex(simmgr_shm->instructor.sema);
}

/*
 * addEvent / addComment / lockAndComment
 */
void
addEvent(char* str)
{
	int eventNext = simmgr_shm->eventListNextWrite;

	sprintf_s(simmgr_shm->eventList[eventNext].eventName, STR_SIZE, "%s", str);

	snprintf(msg_buf, 2048, "Event %d: %s", eventNext, str);
	log_message("", msg_buf);

	eventNext += 1;
	if (eventNext >= EVENT_LIST_SIZE)
		eventNext = 0;
	simmgr_shm->eventListNextWrite = eventNext;

	if (strcmp(str, "aed") == 0)
		simmgr_shm->instructor.defibrillation.shock = 1;
}

void
addComment(char* str)
{
	int commentNext = simmgr_shm->commentListNext;

	if (strlen(str) >= COMMENT_SIZE)
		str[COMMENT_SIZE - 1] = 0;

	sprintf_s(simmgr_shm->commentList[commentNext].comment, COMMENT_SIZE, "%s", str);

	commentNext += 1;
	if (commentNext >= COMMENT_LIST_SIZE)
		commentNext = 0;
	simmgr_shm->commentListNext = commentNext;
}

void
lockAndComment(char* str)
{
	if (takeInstructorLock() == 0)
	{
		addComment(str);
		releaseInstructorLock();
	}
}

// ---- Windows-only error helpers ----
#ifdef _WIN32
void showLastError(LPTSTR lpszFunction)
{
	LPVOID lpp_msg    = nullptr;
	LPVOID lpDisplayBuf = nullptr;
	DWORD  dw = GetLastError();

	FormatMessage(
		FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
		NULL, dw, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
		(LPTSTR)&lpp_msg, 0, NULL);

	printf("%s\n", (char*)lpp_msg);

	lpDisplayBuf = LocalAlloc(LMEM_ZEROINIT,
		(lstrlen((LPCTSTR)lpp_msg) + lstrlen((LPCTSTR)lpszFunction) + 40) * sizeof(TCHAR));
	if (lpDisplayBuf)
	{
		StringCchPrintf((LPTSTR)lpDisplayBuf, LocalSize(lpDisplayBuf) / sizeof(TCHAR),
			TEXT("%s failed with error %d: %s"), lpszFunction, dw, lpp_msg);
		MessageBox(NULL, (LPCTSTR)lpDisplayBuf, TEXT("Error"), MB_OK);
		LocalFree(lpDisplayBuf);
	}
	LocalFree(lpp_msg);
}

std::string GetLastErrorAsString()
{
	DWORD  errorMessageID = ::GetLastError();
	if (errorMessageID == 0)
		return std::string();

	LPSTR  messageBuffer = nullptr;
	size_t size = FormatMessageA(
		FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
		NULL, errorMessageID, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
		(LPSTR)&messageBuffer, 0, NULL);

	std::string message(messageBuffer, size);
	LocalFree(messageBuffer);
	return message;
}
#endif // _WIN32

// ---- Windows-only: process handle cleanup on signal ----
#ifdef _WIN32
STARTUPINFO        php_si;
PROCESS_INFORMATION php_pi;
#endif

void signalHandler(int signum)
{
	printf("Interrupt signal (%d) received.\n", signum);
#ifdef _WIN32
	CloseHandle(php_pi.hProcess);
	CloseHandle(php_pi.hThread);
#endif
	exit(signum);
}

/*
 * clock_gettime — POSIX function, native on macOS/Linux.
 * Implemented here only for Windows.
 */
#ifdef _WIN32
static LARGE_INTEGER
getFILETIMEoffset()
{
	SYSTEMTIME s;
	FILETIME   f;
	LARGE_INTEGER t;

	s.wYear = 1970; s.wMonth = 1; s.wDay = 1;
	s.wHour = 0;    s.wMinute = 0; s.wSecond = 0; s.wMilliseconds = 0;
	SystemTimeToFileTime(&s, &f);
	t.QuadPart  = f.dwHighDateTime;
	t.QuadPart <<= 32;
	t.QuadPart |= f.dwLowDateTime;
	return t;
}

int
clock_gettime(int /*X*/, struct timeval* tv)
{
	LARGE_INTEGER           t;
	FILETIME                f;
	LONGLONG                microseconds;
	static LARGE_INTEGER    offset;
	static LONGLONG         frequencyToMicroseconds = 10;
	static int              initialized = 0;
	static BOOL             usePerformanceCounter = 0;

	if (!initialized)
	{
		LARGE_INTEGER performanceFrequency;
		initialized = 1;
		usePerformanceCounter = QueryPerformanceFrequency(&performanceFrequency);
		if (usePerformanceCounter)
		{
			QueryPerformanceCounter(&offset);
			frequencyToMicroseconds = performanceFrequency.QuadPart / 1000000;
		}
		else
		{
			offset = getFILETIMEoffset();
			frequencyToMicroseconds = 10;
		}
	}
	if (usePerformanceCounter)
		QueryPerformanceCounter(&t);
	else
	{
		GetSystemTimeAsFileTime(&f);
		t.QuadPart  = f.dwHighDateTime;
		t.QuadPart <<= 32;
		t.QuadPart |= f.dwLowDateTime;
	}

	t.QuadPart    -= offset.QuadPart;
	microseconds   = t.QuadPart / frequencyToMicroseconds;
	t.QuadPart     = microseconds;
	tv->tv_sec     = (long)(t.QuadPart / 1000000);
	tv->tv_usec    = (long)(t.QuadPart % 1000000);
	return 0;
}
#endif // _WIN32

/*
 * getDcode
 *
 * Return a compact date-code: YYYYMMDDHH as a 64-bit integer.
 */
int64_t
getDcode(void)
{
	struct tm  newtime;
	time_t     long_time;
	uint64_t   dcode;

	_time64(&long_time);
	if (_localtime64_s(&newtime, &long_time) != 0)
	{
		dcode = 0;
	}
	else
	{
		uint64_t year  = (uint64_t)(newtime.tm_year + 1900);
		uint64_t month = (uint64_t)(newtime.tm_mon  + 1);
		uint64_t day   = (uint64_t)newtime.tm_mday;
		uint64_t hour  = (uint64_t)newtime.tm_hour;

		dcode  = year  * 1000000ULL;
		dcode += month *   10000ULL;
		dcode += day   *     100ULL;
		dcode += hour;
	}
	return (int64_t)dcode;
}
