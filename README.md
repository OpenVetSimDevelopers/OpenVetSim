# OpenVetSim

Open-source veterinary patient simulation platform developed at Cornell University College of Veterinary Medicine.

OpenVetSim drives a high-fidelity mannequin simulator, providing realistic physiological responses for veterinary clinical training. The system delivers live vital-sign feedback, supports scenario-based exercises, and records sessions for review.

---

## Repository layout

| Directory | Description |
|-----------|-------------|
| `OpenVetSim/` | C++ simulation engine — models physiology, drives hardware I/O |
| `OpenVetSim-App/` | Electron desktop shell — wraps the engine and PHP UI for Mac/Windows |
| `sim-mgr/` | PHP simulation manager — scenario control, vitals, logging |
| `sim-ii/` | PHP instructor interface — real-time control UI |
| `sim-ctl/` | Control panel web interface |
| `sim-player/` | Session playback interface |
| `scenarios/` | Bundled starter scenarios |

---

## Building

### Prerequisites

**macOS**
- Xcode command-line tools (`xcode-select --install`)
- CMake ≥ 3.20
- Node.js ≥ 20 + npm

**Windows**
- Visual Studio 2022 with C++ workload
- CMake ≥ 3.20
- Node.js ≥ 20 + npm

> **PHP is bundled automatically** — you do not need to install PHP separately.
> A self-contained static PHP binary is downloaded by the scripts below and
> bundled into the packaged app so end-users need nothing extra.

### 1 — Build the C++ engine

```bash
cd OpenVetSim
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(sysctl -n hw.ncpu)    # macOS
# or: cmake --build . --config Release   (Windows)
```

The compiled binary lands in `OpenVetSim/build/bin/OpenVetSim` (macOS/Linux) or `OpenVetSim\build\bin\OpenVetSim.exe` (Windows).

### 2 — Run the Electron app in development

```bash
cd OpenVetSim-App
npm install
npm start
```

The app automatically locates the binary at `../OpenVetSim/build/bin/OpenVetSim` relative to the app directory.

### 3 — Download the bundled PHP binary

The packaged app ships with a static PHP CLI binary so end-users don't need PHP installed. Download it once before packaging (or before running in dev mode if you don't have PHP system-wide):

**macOS:**
```bash
chmod +x scripts/download-php.sh
./scripts/download-php.sh
```

**Windows (PowerShell):**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\download-php.ps1
```

This places the binary at `OpenVetSim/build/bin/PHP8.0/php` (macOS) or `PHP8.0\php.exe` (Windows). The `.gitignore` excludes it from version control.

Both scripts refuse anything older than **PHP 8.3.36 / 8.4.27** (21 October 2026), the releases that fix the critical remote-code-execution flaws CVE-2026-109618 and CVE-2026-109619, and they check the downloaded binary's own version before replacing the old one. When a later PHP security release comes out, raise the minimums in `min_patch()` in `download-php.sh` and `MinPatch` in `download-php.ps1`, re-run them and rebuild. Both platforms prefer PHP 8.3 and fall back to a fixed 8.4 (or, on the Mac, 8.5) only if no fixed 8.3 build is published. On the Mac the script reads the static-php CDN's file list (its `common` collection, then `bulk`) rather than guessing file names, and if nothing qualifies it prints what the CDN does offer. The CDN can lag php.net by weeks; when it does, `scripts/build-php-mac.sh` builds the fixed release from php.net's source instead (Xcode Command Line Tools and, on Apple silicon, Rosetta 2 needed; 5-15 minutes). It verifies the source against php.net's checksum, links only libraries that ship with macOS, and installs the universal binary in the same place. The folder is still called `PHP8.0` for historical reasons; the name has nothing to do with the version inside it.

The engine also starts PHP with `session.upload_progress.enabled=0` and `expose_php=0` (see `PHP_HARDEN_OPTS` in `OpenVetSim/WebSrv.cpp`), and logs a warning in `simlogs/vetsim.log` if it has to fall back to a PHP that isn't the bundled one.

### 4 — Package a distributable

```bash
cd OpenVetSim-App
npm run dist:mac   # → dist/OpenVetSim-*.dmg
npm run dist:win   # → dist/OpenVetSim-*-Setup.exe
npm run dist       # both platforms
```

---

## Scenarios

Starter scenarios are in the `scenarios/` directory. Each scenario is a folder containing:

- `main.xml` — physiological parameters and timeline
- `layout.json` — display layout configuration
- `images/`, `media/`, `vocals/` — associated media assets

On a packaged installation the scenarios are bundled inside the app and copied to the appropriate location on first launch.

---

## Architecture overview

```
┌─────────────────────────────┐
│       Electron Shell         │  OpenVetSim-App/main.js
│  (desktop window + menus)    │
└────────────┬────────────────┘
             │ spawns
┌────────────▼────────────────┐
│    C++ Simulation Engine     │  OpenVetSim/
│  • Physiology model          │
│  • Hardware I/O (UDP 40844)  │
│  • HTTP status (TCP 40845)   │
│  • Launches PHP server       │
└────────────┬────────────────┘
             │ HTTP :8081
┌────────────▼────────────────┐
│      PHP Web Layer           │  sim-ii/, sim-mgr/
│  • Instructor interface      │
│  • Scenario management       │
│  • Session recording/replay  │
└─────────────────────────────┘
```

---

## License

See individual component LICENSE files. Core simulation engine — Cornell University College of Veterinary Medicine.
