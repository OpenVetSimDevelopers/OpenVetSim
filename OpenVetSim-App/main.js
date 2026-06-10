'use strict';

const {
  app, BrowserWindow, WebContentsView,
  ipcMain, Menu, shell, dialog, clipboard,
} = require('electron');
const path   = require('path');
const { spawn, execSync } = require('child_process');
const http   = require('http');
const fs     = require('fs');

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT_STATUS = 40845;
const PORT_PHP    = 8081;
const PHP_URL     = `http://127.0.0.1:${PORT_PHP}/sim-ii/ii.php`;
const STATUS_URL  = `http://127.0.0.1:${PORT_STATUS}/cgi-bin/simstatus.cgi?check=1`;

const WIN_W = 1280;
const WIN_H = 900;

// Poll settings: wait up to 30 s for the binary to become ready
const POLL_INTERVAL = 500;
const POLL_MAX      = 60;

// ─── Binary path resolution ───────────────────────────────────────────────────
function getBinaryPath() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', 'WinVetSim' + ext);
  }
  // Development: OpenVetSim-App/ sits next to OpenVetSim/
  return path.join(__dirname, '..', 'OpenVetSim', 'build', 'bin', 'WinVetSim' + ext);
}

// ─── HTML/web root path resolution ────────────────────────────────────────────
// This is the directory the binary uses as its working root: it cd's here to
// launch the PHP server (sim-ii/router.php) and looks for scenarios/ and simlogs/.
//
//   Packaged Mac:     ~/Library/Application Support/OpenVetSim/
//                     (writable; populated from bundle by initUserData() on each launch)
//   Packaged Windows: %PUBLIC%\OpenVetSim (C:\Users\Public\OpenVetSim — shared across
//                     all users on the machine; the NSIS installer copies web files here)
//   Development:      repo root (parent of OpenVetSim-App/) — sim-ii, sim-mgr etc. live there
//
function getHtmlPath() {
  if (app.isPackaged) {
    if (process.platform === 'win32') {
      // %PUBLIC% is C:\Users\Public — shared, accessible to all Windows users.
      // The NSIS installer is responsible for populating OpenVetSim\ here.
      return path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'OpenVetSim');
    }
    // macOS: Application Support is writable, so users can add scenarios and
    // simlogs (including video files) can grow freely.
    return path.join(app.getPath('appData'), 'OpenVetSim');
  }
  // __dirname is OpenVetSim-App/; one level up is the repo root
  return path.join(__dirname, '..');
}

// ─── Windows read-only attribute helper ──────────────────────────────────────
// The NSIS xcopy runs as admin and may copy FILE_ATTRIBUTE_READONLY from the
// bundle resources to ProgramData.  A non-admin Electron process then can't
// delete or overwrite those files (EPERM).  Walk the tree and clear the flag
// before any rm/cp so subsequent writes succeed.
async function stripReadOnly(dirPath) {
  if (process.platform !== 'win32') return;
  let entries;
  try { entries = await fs.promises.readdir(dirPath, { withFileTypes: true }); }
  catch { return; }   // directory doesn't exist yet — nothing to do
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await stripReadOnly(full);
    } else {
      try {
        const st = await fs.promises.stat(full);
        if (!(st.mode & 0o200)) {            // write bit not set → read-only
          await fs.promises.chmod(full, st.mode | 0o222);
        }
      } catch { /* best-effort; leave file alone if we can't stat/chmod it */ }
    }
  }
}

// ─── Sync bundled content to user/shared data directory (all platforms) ───────
// Called once on every launch before the binary starts.
//
//   Web app dirs (sim-ii etc.) — always overwritten so they stay current when
//     the app is updated via a new DMG/installer.
//   scenarios/                 — copied only if absent, so user-added scenarios
//     are never clobbered by an app update.
//   simlogs/video/             — created if missing; never touched otherwise.
//
// macOS:   ~/Library/Application Support/OpenVetSim/
// Windows: C:\Users\Public\OpenVetSim\  (the NSIS installer also xcopy's these
//          files there, but we do it here too so launches always succeed even
//          if the installer's xcopy failed silently on a particular machine).
//
const WEB_DIRS = ['sim-ii', 'sim-mgr', 'sim-ctl', 'sim-player'];

async function initUserData() {
  if (!app.isPackaged) return;

  const userDir   = getHtmlPath();        // platform-specific data root
  const bundleDir = process.resourcesPath; // Contents/Resources (Mac) or resources/ (Win)

  // Ensure the data root exists (the NSIS installer creates it on Windows, but
  // this acts as a safety net for edge cases where the installer step failed).
  await fs.promises.mkdir(userDir, { recursive: true });

  // Always refresh PHP web app files so app updates take effect immediately.
  // Use async fs ops so the main process stays responsive while files are copied.
  for (const dir of WEB_DIRS) {
    const src  = path.join(bundleDir, dir);
    const dest = path.join(userDir, dir);
    if (!fs.existsSync(src)) continue;   // not bundled for this build, skip

    // Clear any read-only attributes on existing destination files before we
    // attempt deletion — NSIS xcopy (admin) can preserve FILE_ATTRIBUTE_READONLY
    // from bundle resources, causing EPERM for subsequent non-admin rm/cp.
    await stripReadOnly(dest);

    // Remove old copy first so stale files from previous versions are cleaned up.
    try {
      await fs.promises.rm(dest, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[initUserData] rm ${dir}: ${e.message}`);
    }

    // Copy fresh from the bundle.  Wrapped per-directory so one failure doesn't
    // abort the remaining dirs.
    try {
      await fs.promises.cp(src, dest, { recursive: true });
    } catch (e) {
      console.warn(`[initUserData] cp ${dir}: ${e.message}`);
    }
  }

  // Seed scenarios on first run only — preserve any user-added scenarios
  const scenariosSrc  = path.join(bundleDir, 'scenarios');
  const scenariosDest = path.join(userDir, 'scenarios');
  if (fs.existsSync(scenariosSrc) && !fs.existsSync(scenariosDest)) {
    await fs.promises.cp(scenariosSrc, scenariosDest, { recursive: true });
  }

  // Ensure writable log directories exist
  await fs.promises.mkdir(path.join(userDir, 'simlogs', 'video'), { recursive: true });

  // Create a Desktop symlink to the scenarios folder (macOS only).
  // On Windows the NSIS installer already places a .lnk shortcut on the desktop.
  if (process.platform === 'darwin') {
    const desktopLink = path.join(app.getPath('desktop'), 'OpenVetSim Scenarios');
    try {
      fs.lstatSync(desktopLink);   // throws if nothing exists at this path
    } catch (e) {
      // Nothing there — create the symlink
      try {
        fs.symlinkSync(scenariosDest, desktopLink);
      } catch (symlinkErr) {
        console.warn('Could not create Desktop shortcut:', symlinkErr.message);
      }
    }
  }
}

// ─── Globals ──────────────────────────────────────────────────────────────────
let mainWin    = null;   // BrowserWindow
let phpView    = null;   // WebContentsView showing the PHP UI
let simProcess = null;   // ChildProcess handle
let simState   = 'stopped';

// ─── Notify toolbar renderer of state changes ─────────────────────────────────
function notifyState(state, extra = {}) {
  simState = state;
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('sim-state', { state, ...extra });
  }
}

// ─── Poll the HTTP status endpoint until the binary is ready ──────────────────
function pollReady(attemptsLeft, resolve, reject) {
  if (attemptsLeft <= 0) { reject(new Error('Timed out waiting for simulator')); return; }
  const req = http.get(STATUS_URL, (res) => {
    if (res.statusCode === 200) { resolve(); return; }
    setTimeout(() => pollReady(attemptsLeft - 1, resolve, reject), POLL_INTERVAL);
  });
  req.on('error', () => {
    setTimeout(() => pollReady(attemptsLeft - 1, resolve, reject), POLL_INTERVAL);
  });
  req.setTimeout(400, () => req.destroy());
}

function waitForBinary() {
  return new Promise((resolve, reject) => pollReady(POLL_MAX, resolve, reject));
}

// ─── Poll the PHP server until it is accepting connections ────────────────────
// The binary launches PHP as a background process after its own init, so PHP
// can lag behind the status port by a second or two.  Any HTTP response (even
// a 404) means PHP is listening; only ECONNREFUSED means it isn't ready yet.
function pollPHP(attemptsLeft, resolve, reject) {
  if (attemptsLeft <= 0) { reject(new Error('Timed out waiting for PHP server')); return; }
  const req = http.get(`http://127.0.0.1:${PORT_PHP}/`, (res) => {
    res.resume(); // drain the response so the socket is freed
    resolve();    // any response means PHP is up
  });
  req.on('error', () => {
    setTimeout(() => pollPHP(attemptsLeft - 1, resolve, reject), POLL_INTERVAL);
  });
  req.setTimeout(400, () => req.destroy());
}

function waitForPHP() {
  return new Promise((resolve, reject) => pollPHP(POLL_MAX, resolve, reject));
}

// ─── Kill any orphaned PHP server left from a previous session ───────────────
function killOrphanedPHP() {
  try {
    if (process.platform === 'win32') {
      // PHP now runs as a hidden DETACHED_PROCESS (no window title to match),
      // so kill by image name instead.
      execSync('taskkill /F /IM php.exe /T', { stdio: 'ignore' });
    } else {
      // Matches the exact command the binary launches: php -S ... router.php
      execSync("pkill -9 -f 'php.*router\\.php'", { stdio: 'ignore' });
    }
  } catch (e) {
    // No PHP process running — that's fine
  }
}

// ─── Kill any orphaned binary left from a previous session ───────────────────
function killExistingBinary() {
  let killed = false;

  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM WinVetSim.exe', { stdio: 'ignore' });
      killed = true;
    } catch (e) { /* nothing running */ }
  } else {
    // 1. Kill by exact binary path — avoids matching Electron's own helper
    //    processes which also have "OpenVetSim" in their argv (the app folder name).
    const binPath = getBinaryPath();
    try {
      execSync(`pkill -9 -f "${binPath}"`, { stdio: 'ignore' });
      killed = true;
    } catch (e) { /* nothing matched */ }

    // 2. Kill whatever is holding the pulse UDP port (40844) as a safety net.
    //    UDP has no TIME_WAIT so anything on this port is a live orphaned binary.
    //    NOTE: Do NOT do the same for TCP port 40845 — Electron's own network
    //    service holds TIME_WAIT connections there after polling, and killing those
    //    PIDs crashes Electron's HTTP stack.
    try {
      const pids = execSync('lsof -ti udp:40844', { encoding: 'utf8' }).trim();
      if (pids) {
        execSync(`kill -9 ${pids.split('\n').join(' ')}`, { stdio: 'ignore' });
        killed = true;
      }
    } catch (e) { /* port not in use */ }
  }

  // Also clean up any PHP server the binary left behind
  killOrphanedPHP();
  return killed;
}

// ─── Start the C++ binary ─────────────────────────────────────────────────────
function startBinary() {
  if (simProcess) return;

  notifyState('starting');

  // Kill any orphaned binary from a previous Electron session, then wait
  // briefly for its ports to be released before spawning a new instance.
  const wasOrphaned = killExistingBinary();
  const spawnDelay  = wasOrphaned ? 1500 : 0;

  setTimeout(() => {
    const binPath = getBinaryPath();
    if (!fs.existsSync(binPath)) {
      const msg = `Binary not found:\n${binPath}`;
      notifyState('error', { msg });
      dialog.showErrorBox('OpenVetSim — Binary Missing', msg);
      return;
    }

    // ── Windows registry fix ────────────────────────────────────────────────
    // The C++ binary (keys.cpp / readSubKeys) reads HTML_Path from the registry
    // and overwrites localConfig.html_path, which overrides the correct
    // OPENVETSIM_HTML_PATH env var we inject below.  A stale registry entry
    // from a previous WinVetSim installation causes PHP to use the wrong
    // working directory (and fail to find sim-ii/router.php).
    //
    // Fix: write the correct path into the registry BEFORE spawning the binary
    // so that if keys.cpp does read it, it finds the right value.
    // This is a belt-and-suspenders measure; the proper fix is in keys.cpp.
    if (process.platform === 'win32' && app.isPackaged) {
      try {
        const htmlPath = getHtmlPath();
        execSync(
          `reg add "HKCU\\SOFTWARE\\WinVetSim" /v HTML_Path /t REG_SZ /d "${htmlPath}" /f`,
          { stdio: 'ignore', windowsHide: true }
        );
      } catch { /* ignore — registry write failure is non-fatal */ }
    }
    // ── end registry fix ────────────────────────────────────────────────────

  simProcess = spawn(binPath, [], {
    cwd:          path.dirname(binPath),
    stdio:        ['ignore', 'pipe', 'pipe'],
    detached:     false,
    windowsHide:  true,   // prevent console window appearing on Windows
    env: {
      ...process.env,
      OPENVETSIM_HTML_PATH: getHtmlPath(),
    },
  });

  simProcess.stdout.on('data', (chunk) => {
    const line = chunk.toString().trim();
    console.log('[sim]', line);
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sim-log', line);

    // When the scenario subprocess fully exits, write a flag file into simlogs/
    // so the PHP overlay can detect this event by polling an AJAX endpoint.
    // This is more accurate than watching the scenario state in the REST API,
    // which transitions to "Stopped" before the scenario process actually exits.
    if (line.includes('Scenario process is exiting')) {
      const flagPath = path.join(getHtmlPath(), 'simlogs', 'scenario_exited.flag');
      try { fs.writeFileSync(flagPath, String(Date.now())); } catch { /* ignore */ }
    }
  });

  simProcess.stderr.on('data', (chunk) => console.error('[sim:err]', chunk.toString().trim()));

  simProcess.on('error', (err) => {
    console.error('Spawn error:', err);
    simProcess = null;
    notifyState('error', { msg: err.message });
  });

  simProcess.on('exit', (code, signal) => {
    console.log(`[sim] exit code=${code} signal=${signal}`);
    simProcess = null;
    if (simState !== 'stopped') notifyState('stopped');
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('sim-exited', { code, signal });
      hidePhpView();
    }
  });

  // Wait for the C++ binary, then for the PHP server it launches, then show the UI.
  // PHP starts as a background process after the binary's own init, so it can
  // lag behind the status port by a second or two — we poll both in sequence.
  waitForBinary()
    .then(() => waitForPHP())
    .then(() => {
      notifyState('running');
      showPhpView();
    })
    .catch((err) => notifyState('error', { msg: err.message }));

  }, spawnDelay); // end setTimeout for orphan-kill cooldown
}

// ─── Stop the binary ──────────────────────────────────────────────────────────
// Returns a Promise that resolves when the process has actually exited.
function stopBinary() {
  return new Promise((resolve) => {
    if (!simProcess) { resolve(); return; }
    notifyState('stopped');

    // Resolve as soon as the process exits, then clean up PHP
    simProcess.once('exit', () => { killOrphanedPHP(); resolve(); });

    // Graceful shutdown via the HTTP close command
    const req = http.get(
      `http://127.0.0.1:${PORT_STATUS}/cgi-bin/simstatus.cgi?close=565`,
      () => {}
    );
    req.on('error', () => {});
    req.setTimeout(2000, () => req.destroy());

    // Escalating kill: SIGTERM after 3 s, SIGKILL after 5 s
    setTimeout(() => {
      if (simProcess) {
        simProcess.kill('SIGTERM');
        setTimeout(() => { if (simProcess) simProcess.kill('SIGKILL'); }, 2000);
      }
    }, 3000);
  });
}

// ─── Restart ──────────────────────────────────────────────────────────────────
function restartBinary() {
  if (simProcess) {
    simProcess.once('exit', () => { simProcess = null; startBinary(); });
    stopBinary();
  } else {
    startBinary();
  }
}

// ─── Show / hide the PHP BrowserView ──────────────────────────────────────────
function showPhpView() {
  if (!mainWin || mainWin.isDestroyed() || !phpView) return;
  phpView.webContents.loadURL(PHP_URL).catch(console.error);
  resizePhpView();
}

function hidePhpView() {
  if (!mainWin || mainWin.isDestroyed() || !phpView) return;
  phpView.webContents.loadURL('about:blank').catch(() => {});
}

function resizePhpView() {
  if (!mainWin || mainWin.isDestroyed() || !phpView) return;
  const [w, h] = mainWin.getContentSize();
  phpView.setBounds({ x: 0, y: 0, width: w, height: h });
}

// ─── Create the main window ───────────────────────────────────────────────────
function createWindow() {
  mainWin = new BrowserWindow({
    width:       WIN_W,
    height:      WIN_H,
    minWidth:    800,
    minHeight:   600,
    title:       'OpenVetSim',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  // PHP UI view (sits below the toolbar)
  phpView = new WebContentsView({
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      false,   // needed to load http:// from the Electron renderer origin
    },
  });
  mainWin.contentView.addChildView(phpView);

  // Load the toolbar/loading page
  mainWin.loadFile(path.join(__dirname, 'loading.html'));

  // Keep the PHP view properly sized when the window resizes
  mainWin.on('resize', resizePhpView);

  mainWin.on('closed', () => {
    mainWin = null;
    phpView = null;
  });

  buildMenu();
}

// ─── Application menu ─────────────────────────────────────────────────────────
function buildMenu() {
  const simMenu = [
    { label: 'Start',   accelerator: 'CmdOrCtrl+Shift+S', click: startBinary },
    { label: 'Stop',    accelerator: 'CmdOrCtrl+Shift+X', click: stopBinary  },
    { label: 'Restart', accelerator: 'CmdOrCtrl+Shift+R', click: restartBinary },
    { type: 'separator' },
    { label: 'Open in Browser', click: () => shell.openExternal(PHP_URL) },
    { type: 'separator' },
    {
      label: 'Copy Video Log Path',
      click: () => {
        const videoPath = path.join(getHtmlPath(), 'simlogs', 'video');
        clipboard.writeText(videoPath);
        dialog.showMessageBox(mainWin, {
          type: 'info',
          title: 'Video Log Path Copied',
          message: 'Video log path copied to clipboard:',
          detail: videoPath,
          buttons: ['OK'],
        });
      },
    },
    { type: 'separator' },
    { role: 'quit' },
  ];

  const template = [
    { label: 'Simulator', submenu: simMenu },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        {
          label: 'Toggle PHP DevTools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => { if (phpView) phpView.webContents.toggleDevTools(); },
        },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
    {
      label: 'Help',
      submenu: [{
        label: 'About OpenVetSim',
        click: () => dialog.showMessageBox(mainWin, {
          type: 'info', title: 'About OpenVetSim',
          message: 'OpenVetSim',
          detail: 'Veterinary Simulation Manager\nCornell University College of Veterinary Medicine',
        }),
      }],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' }, { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.on('sim-start',   startBinary);
ipcMain.on('sim-stop',    stopBinary);
ipcMain.on('sim-restart', restartBinary);

ipcMain.handle('sim-status', () => new Promise((resolve) => {
  const req = http.get(STATUS_URL, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end',  () => {
      try { resolve({ ok: true, data: JSON.parse(body) }); }
      catch { resolve({ ok: true, data: body }); }
    });
  });
  req.on('error', () => resolve({ ok: false }));
  req.setTimeout(1000, () => { req.destroy(); resolve({ ok: false }); });
}));

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Open the window immediately so the user sees the loading screen right away.
  createWindow();

  // Copy bundled web files to the writable data directory (both platforms).
  // This is async so the window stays responsive during the copy, and any
  // errors are caught so a bad copy never prevents the window from appearing.
  try {
    await initUserData();
  } catch (err) {
    console.error('[initUserData] error (non-fatal):', err.message);
  }

  startBinary();   // auto-start; web files are now in place

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      startBinary();
    }
  });
});

app.on('window-all-closed', () => {
  // Wait for the binary to actually exit before quitting Electron so we
  // don't leave orphaned processes that hold ports on the next launch.
  const safetyTimer = setTimeout(() => app.quit(), 8000);
  stopBinary().then(() => {
    clearTimeout(safetyTimer);
    app.quit();
  });
});

// Safety net: if before-quit fires while the binary is still alive, kill it
// and ensure the PHP server it launched is also torn down.
app.on('before-quit', () => {
  if (simProcess) simProcess.kill('SIGKILL');
  killOrphanedPHP();
});
