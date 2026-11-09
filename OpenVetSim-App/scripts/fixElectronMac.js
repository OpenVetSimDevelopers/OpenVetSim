'use strict';

/*
 * fixElectronMac.js — prepares the development Electron for `npm start` on macOS
 *
 * Runs after `npm install` (postinstall) and before every `npm start`
 * (prestart). It affects ONLY the development Electron in node_modules. The
 * shipped application is signed with the Developer ID and notarized by
 * electron-builder, and is unaffected by any of this.
 *
 * PROBLEM 1 — quarantine
 * ----------------------
 * npm downloads Electron as a zip, so the extracted Electron.app carries the
 * com.apple.quarantine extended attribute. On macOS Sequoia and later,
 * Gatekeeper refuses to run it:
 *
 *     "Electron.app" has been blocked because it may reduce your privacy and
 *     lower the security of your Mac.
 *
 * PROBLEM 2 — "contains malware"
 * ------------------------------
 * In 2026 macOS's built-in malware check (XProtect) blocks the stock
 * Electron 31.7.7 binaries, and may move them to the Trash:
 *
 *     Malware Blocked. "Electron.app" was not opened because it contains
 *     malware. This action did not harm your Mac.
 *
 * The download is genuine (it matches Electron's published checksums). The
 * block appears to key on the code hash of the stock executables, presumably
 * because malware has shipped inside unmodified Electron builds. An ad-hoc
 * re-sign with Electron's own identifiers reproduces that same hash, so it
 * is not enough; signing each piece under our own identifier gives it a new
 * hash. (Reported by other Electron projects, e.g. onyxdevs/subzilla#23.)
 *
 * FIX
 * ---
 * 1. Clear the quarantine attributes.
 * 2. Ad-hoc sign every executable, helper app and framework, innermost
 *    first, under an OpenVetSim development identifier, then the app itself.
 *
 * The signing takes a few seconds, so it is skipped when the app already
 * carries our identifier. If macOS has already removed the app, this says
 * how to reinstall it.
 *
 * The lasting fix is to move to a supported Electron release (31 reached end
 * of life in 2025).
 *
 * Silent and harmless on Windows and Linux, and non-fatal if anything fails —
 * a failure here should never block an install.
 */

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ID_PREFIX = 'edu.cornell.vetsim.openvetsim.dev';
const DRY_RUN   = process.env.OVS_SIGN_DRY_RUN === '1';	// print, don't sign (testing)

if (process.platform !== 'darwin' && !DRY_RUN) {
  process.exit(0);
}

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
const appPath     = path.join(electronDir, 'dist', 'Electron.app');
const mainExe     = path.join(appPath, 'Contents', 'MacOS', 'Electron');

const REINSTALL =
  '  To reinstall it, run these in the OpenVetSim-App folder:\n' +
  '    rm -rf node_modules/electron\n' +
  '    npm install\n';

if (!fs.existsSync(electronDir)) {
  // Electron not installed (or a different layout) — nothing to do.
  process.exit(0);
}

if (!fs.existsSync(mainExe)) {
  console.log(
    'fixElectronMac: the development Electron is missing or incomplete.\n' +
    '  macOS may have moved it to the Trash as "malware" (see this script).\n' +
    REINSTALL);
  process.exit(0);
}

function run(cmd, args) {
  if (DRY_RUN) {
    console.log('  ' + cmd + ' ' + args.map(a => /\s/.test(a) ? JSON.stringify(a) : a).join(' '));
    return true;
  }
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// The identifier the app is currently signed with, or '' if unknown.
function currentIdentifier() {
  try {
    // codesign -d writes its report to stderr
    const out = execFileSync('codesign', ['-d', '-v', appPath],
                             { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    const m = /Identifier=(\S+)/.exec(out);
    return m ? m[1] : '';
  } catch (e) {
    const m = /Identifier=(\S+)/.exec(String(e.stderr || ''));
    return m ? m[1] : '';
  }
}

if (!DRY_RUN && currentIdentifier() === ID_PREFIX) {
  process.exit(0);	// already prepared
}

// ---- find everything that needs a signature ---------------------------------

function isMachO(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(4);
    if (fs.readSync(fd, b, 0, 4, 0) < 4) { return false; }
    const m = b.readUInt32BE(0);
    return m === 0xcafebabe ||					// universal
           m === 0xcffaedfe || m === 0xcefaedfe ||	// 64/32-bit, little-endian
           m === 0xfeedfacf || m === 0xfeedface;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { fs.closeSync(fd); }
  }
}

const bundles = [];		// nested .app and .framework directories
const loose   = [];		// Mach-O files that are not a bundle's own executable
const bundleMains = new Set();

function walk(dir, depth) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) { continue; }		// framework Versions/Current links
    if (entry.isDirectory()) {
      if (/\.(app|framework)$/.test(entry.name)) {
        bundles.push({ path: full, depth: depth });
        const name = entry.name.replace(/\.(app|framework)$/, '');
        bundleMains.add(entry.name.endsWith('.app')
          ? path.join(full, 'Contents', 'MacOS', name)
          : path.join(full, 'Versions', 'A', name));
      }
      walk(full, depth + 1);
    } else if (entry.isFile() && isMachO(full)) {
      loose.push(full);
    }
  }
}

walk(path.join(appPath, 'Contents'), 0);

// An identifier from a name: "Electron Helper (GPU).app" -> "electron-helper-gpu"
function idFor(name) {
  return ID_PREFIX + '.' +
    name.replace(/\.(app|framework|dylib)$/, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---- sign, innermost first ---------------------------------------------------

let ok = run('xattr', ['-cr', appPath]);

for (const file of loose) {
  if (bundleMains.has(file) || file === mainExe) { continue; }	// signed with its bundle
  ok = run('codesign', ['--force', '--sign', '-', '--identifier', idFor(path.basename(file)), file]) && ok;
}

bundles.sort((a, b) => b.depth - a.depth);
for (const b of bundles) {
  ok = run('codesign', ['--force', '--sign', '-', '--identifier', idFor(path.basename(b.path)), b.path]) && ok;
}

ok = run('codesign', ['--force', '--sign', '-', '--identifier', ID_PREFIX, appPath]) && ok;

if (ok) {
  console.log('fixElectronMac: cleared quarantine and re-signed the dev Electron as ' + ID_PREFIX);
} else {
  console.log(
    'fixElectronMac: could not fully prepare the dev Electron.\n' +
    '  If `npm start` is blocked by macOS, delete the Electron download and\n' +
    '  reinstall it, which runs this script again:\n' + REINSTALL);
}
