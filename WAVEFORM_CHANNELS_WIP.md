# Patient Monitor Waveform Channels — Work In Progress

Branch `beat-timing-fixes`, on top of `1026115` (v2.6.5). Supersedes
`ARTERIAL_LINE_WIP.md`, which predates the 16:9 canvas, the plethysmograph and
the PA catheter.

**Status: five channels built and rendering. Nothing is committed. The C++
engine must be rebuilt before the new selectors work end to end.**

---

## What has been built

Five waveform channels on the patient monitor, on a shared channel manager and a
fixed 1280×720 design canvas that scales to whatever space it is given:

| channel | strip | added | notes |
|---|---|---|---|
| ECG | `vs-trace-1` | pre-existing | migrated onto the channel manager |
| Capnograph | `vs-trace-2` | v2.6.5 | gained a zero line and a 0/25/50 scale |
| Plethysmograph | `vs-trace-4` | this work | normal / poor perfusion / artifact |
| Arterial pressure | `vs-trace-3` | this work | five morphologies, continuous SAP/DAP/MAP |
| PA catheter | `vs-trace-5` | this work | five tip positions, appears only when placed |

---

## Nothing is committed yet

```
 M OpenVetSim/VetSim.cpp                        engine fields
 M OpenVetSim/sim-parse.cpp                     engine fields
 M OpenVetSim/simstatus.cpp                     engine fields
 M OpenVetSim/vetsim.h                          engine fields
 M sim-ii/js/chart.js                           channel manager, design canvas, ABP, pleth, PAC
 M sim-ii/js/controls.js                        controls.abp, controls.pac, beat hooks
 M sim-ii/js/simmgr.js                          status reads
 M sim-ii/js/modal.js                           instructor dialogs
 M sim-ii/includes/classes/controls.class.php   dropdowns
 M sim-ii/ii.php                                canvases, readout blocks, init calls
 M sim-ii/vitals.php                            canvases, readout blocks, init calls
 M sim-ii/css/common.css                        #vsm-frame, design canvas, fullscreen body
 M sim-ii/css/controls.css                      scaled readout typography
 M sim-ii/css/modal.css                         auto-height blocks, numeric field rows
 M sim-remote/index.php                         remote selectors
 M sim-remote/js/remote.js                      remote selectors
?? sim-ii/ajax/ajaxGetABPWaveformContent.php    NEW - needs explicit git add
?? sim-ii/ajax/ajaxGetPlethWaveformContent.php  NEW - needs explicit git add
?? sim-ii/ajax/ajaxGetPACContent.php            NEW - needs explicit git add
```

In the tree but **not** part of this work and not to be committed:

- `winvetsim.ini` — runtime config the app rewrote. `git checkout -- winvetsim.ini`.
- `_to_delete/` — leftover `index.lock` files from a stale git lock. Safe to `rm -rf`.

### The engine must be rebuilt

`vetsim.h` gained nine fields (`respiration.spo2_waveform` and eight `cardiac.pac_*`).
Until the binary is rebuilt, the plethysmograph and PA catheter selectors will
appear to work and then revert on reopen — that reversion is the reliable tell
for "engine not rebuilt".

```bash
cd ~/Documents/Claude\ OVS/OpenVetSim/build && make -j$(sysctl -n hw.logicalcpu)
cd ~/Documents/Claude\ OVS/OpenVetSim-App && npm start
```

`npm start` serves `sim-ii/` straight from the repo (`getHtmlPath()` returns
`__dirname/..` when not packaged, and `initUserData()` returns early in dev), so
PHP/JS/CSS edits are live without a rebuild — only the engine needs `make`.

---

## Architecture

### The waveform channel manager

`chart.channels` is an ordered registry in `chart.js`. Each entry carries a strip
key, canvas id, readout element id, an `enabled` flag, a `visible()` predicate, a
`blank()` action and an optional reference `scale`. `chart.applyLayout()` divides
a fixed **552px waveform area** among whichever channels are enabled *and* present
in the page markup, then for each one sets:

- the strip's `height` and `top`, and the canvas backing store
- `ampScale = height / REFERENCE_STRIP_HEIGHT` (125)
- the paired readout block's `top`, `height` and `--vs-scale` CSS property

It also hides the canvas and readout of any channel that is switched off, so a
disabled strip cannot linger where it was last drawn.

| channels | strip height | `--vs-scale` |
|---|---|---|
| 2 | 272px | 2.18 |
| 3 | 178px | 1.42 |
| 4 (no catheter) | 132px | 1.06 |
| 5 (catheter placed) | 104px | 0.83 |

**Waveform arrays were not rewritten.** Every amplitude in `chart.js` is authored
in pixels for a 125px strip; `ampScale` scales them at draw time and is exactly
1.0 at the reference height. Verified: ECG and ETCO₂ render byte-identical to the
pre-refactor build at 125px.

**To add a waveform:** append a `chart.channels` entry, add a strip object and a
draw function, add the canvas and a `vs-readout-*` div to `ii.php` and
`vitals.php`. No CSS or layout changes needed.

`chart.setChannelEnabled(key, on)` switches a channel at runtime and re-divides
the area. Only the PA catheter uses it so far.

### The 1280×720 design canvas

The student monitor runs fullscreen on an external display in another room, so it
is laid out once at 1280×720 logical pixels and then scaled:

- `fitToFrame()` computes `s = min(vw/1280, vh/720)` for the viewport, or
  `frame.clientWidth / 1280` for the instructor's slot, and applies
  `transform: scale(s)` to `#vsm`, sizing `#vsm-frame` to the scaled footprint.
- Canvases stay at native resolution under that transform:
  `render = s × devicePixelRatio`, backing store `= design px × render`, and
  `ctx.setTransform(render,0,0,render,0,0)` so all drawing code keeps working in
  design pixels without blurring.
- Every readout font size is `calc(<size> * var(--vs-scale))`, set per-channel by
  `applyLayout`, with `overflow: hidden` clamping each block to its strip.

Layout constants live in `chart.layout`: waveform area `top 48, height 552`,
strips `0..900`, readouts `912..1272`, bottom numbers row `top 604, height 112`.

---

## Design decisions worth not re-litigating

### Arterial pressure

**Pressures come from `cardiac.bps_sys` / `bps_dia`** — the same values the NIBP
dialog sets. The arterial line displays them continuously with a calculated mean;
NIBP still only reports on a cuff cycle.

**MAP = `DAP + (SAP − DAP)/3`**, computed from the *displayed* pressures. The
clinical estimate, not the area under the curve, chosen for predictability when
authoring scenarios. `chart.abp.waveformRange[type].mean` carries the integral if
the physiologically correct number is ever wanted.

**Physiological states vs measurement artifacts** — structural, via the
`artifacts` map in `chart.initAbpWaveforms()`:

- `normal`, `poor`, `cpr` — the patient genuinely has that pressure, so the
  monitor reports what was set. These waveforms are auto-normalised at generation
  to span exactly 0..1, so a poorly perfused patient set to 70/40 reads **70/40**.
- `overdamped`, `underdamped` — the transducer misreports, and that deviation *is*
  the artifact. Displayed values come from the min/max of the drawn array, so the
  readout can never disagree with the trace.

| morphology | min | max | 120/80 displays as |
|---|---|---|---|
| normal | 0.00 | 1.00 | 120/80 (93) |
| overdamped | 0.14 | 0.76 | 110/86 (94) |
| underdamped | −0.06 | 1.41 | 136/78 (97) |
| poor | 0.00 | 1.00 | 120/80 (93) |
| cpr | 0.00 | 1.00 | unchanged |

Those multipliers are measured from the generated waveforms, not hand-maintained.

**CPR does not auto-engage.** Instructor-selected only, free-running at
`ABP_CPR_RATE` (110/min). `controls.cpr.inProgress` derives from the controller's
`cpr.compression` flag, which the accelerometer raises on any large X/Y excursion
including simply moving the manikin.

### Plethysmograph

Unitless, so amplitude is a gain choice rather than a measurement:
`PLETH_AMPLITUDE = { normal: 0.80, poor: 0.26, artifact: 0.34 }`. `artifact`
means no usable signal — no detectable pulse, or a probe placement that cannot
read — and is non-pulsatile by design, wandering rather than beating.
`PLETH_TRANSIT_MSEC` is 240 against the arterial line's 150, so the pleth
upstroke visibly trails the pressure upstroke.

### PA catheter

**The right heart pressures belong to this catheter.** Nothing else in the
simulator models them, so unlike the arterial line they are set in the catheter
dialog: `pac_ra_mean`, `pac_rv_sys/dia`, `pac_pa_sys/dia`, `pac_wedge_mean`.
Normal dog defaults: RA 5, RV 25/5, PA 25/12, PAWP 9.

**Generated directly in mmHg, not normalised.** The arterial morphologies are
0..1 arrays mapped to pressure at draw time; these cannot be, for two reasons: a
3 mmHg v wave is a 3 mmHg v wave whatever the mean, and the RV trace has to reach
*true zero*, which no normalisation against systolic and diastolic can express.
The arrays are regenerated whenever a pressure changes, detected by comparing
`chart.pacWaveformKey()` — cheap, five arrays of 120 samples.

**The teaching points, and how each is guaranteed:**

- **CVP / RA** — venous a, c and v waves with x and y descents. Centred on their
  own mean before the configured mean is added, so retuning a wave cannot drag
  the reading off the set pressure. CVP is the same waveform damped to 70%: the
  tip is still up in the vena cava.
- **RV** — the tell is *diastole*: pressure collapses to essentially zero between
  beats. The peak lands exactly on RV systolic and the *end*-diastolic value
  exactly on RV diastolic, which is how a ventricular pressure is reported; the
  early-diastolic dip below that is the point of the trace.
- **PA** — same systolic peak as RV (the pulmonic valve is open at peak ejection)
  but diastole now *steps up* and stays there, plus a dicrotic notch at valve
  closure. The diastolic step-up is how you know the valve was crossed, which is
  why RV and PA share one auto-ranged scale.
- **Wedge** — the pulsatile waveform *collapses* to a damped, delayed left atrial
  trace with small a and v waves, no notch, and a mean below PA diastolic.

**The scale auto-ranges.** A right heart runs at a fraction of systemic pressure,
so a fixed 160 mmHg scale would squash every trace into the bottom sixth of the
strip. `chart.pacScaleMax()` picks the smallest of 40/60/80/100 that clears
`max(pa_sys, rv_sys) × 1.15`, and the gridlines are quarters of that — which is
why `scale.lines` may be a function as well as an array (`chart.scaleLines`).

**The strip only exists while a catheter is placed.** Withdrawing it gives the
space back to the other four channels.

**Placement is a probe icon, not a strip click.** The strip is hidden until a
catheter is in, so it cannot be the way in — the instructor places one from a
`pac.png` icon in the Non Vital Controls row, green when placed and red when not,
exactly like the ECG / SpO2 / Temp / CO2 / cuff icons. Clicking the strip or
readout, once visible, opens the same dialog for tip position and pressures.

Those icons are positioned from each scenario's `<controls>` block, so a
`button-pac` entry was added to all six bundled scenarios (top 350, left 165 —
the gap between Temp and ETCO2). A scenario written before this existed has no
entry, so `controls.css` carries a default position for `#button-pac` that the
scenario overrides when it does list one. `pac.png` is a drawn placeholder; drop
a photo in over it to match the other icons' style.

**`PAC_TRANSIT_MSEC` is 60**, against the arterial line's 150: the catheter tip
is inside the chamber generating the pressure.

### Beat synchronisation

**All three pulsatile strips hang off `controls.heartRate.setSynch()`**, not off
`chart.status.cardiac.synch`. This matters: `drawEkgPixel()` only clears that flag
*inside* its "instructor interface or ECG leads connected" branch, so on a student
monitor with the ECG switched off the flag latches true and any edge detector on
it fires exactly once. An arterial line does not stop working because the
electrodes came off. The ECG remains the source of beat timing; each strip's
upstroke follows by its own transit delay. All strips run on the same 15 ms tick
so they advance one pixel per tick and stay visually aligned.

---

## Still to do

**Engine rebuild** — see above. This is the blocker for testing the pleth and PAC
selectors.

**Telesim panels are clipped** by the 16:9 frame: `right: -300px` falls outside
`overflow: hidden`. Needs a decision on where they should live.

**A VPC produces a full-strength pressure pulse.** Before this work it produced
none. Neither is right — a real VPC gives a *weak* pulse. Needs a
reduced-amplitude beat rather than a normal one.

**Changes document** — `OpenVetSim_ECG_Changes_July2026.docx` stops at change 18.
Still to write, in the existing *file | function* heading style: change 19 (ETCO₂
zero line and scale, shipped in v2.6.5) and change 20 (channel manager, design
canvas, arterial line, plethysmograph, PA catheter).

**CPR compression synchronisation** — deferred deliberately. Findings:

- The BeagleBone already sends per-compression **edges**: `simController.cpp`
  transmits `set:cpr:compression=` only on change, and the engine timestamps each
  rising edge into `status.cpr.last`.
- The obstacle is transport, not the sensor. `cpr.compression` is only in the
  **full** status (500 ms poll); at 110/min compressions are 545 ms apart, so it
  aliases hopelessly. The quick status (40 ms) carries only `cpr.running`.
- The fix is a `cpr.compressionCount` monotonic counter in the quick status,
  mirroring `cardiac.pulseCount` — which is already consumed in `simmgr.js` to
  drive `controls.heartRate.setSynch()`.
- No "is a simulator attached" check is needed: drive from compression events when
  they arrive, free-run at 110/min if none has arrived for ~1.5 s.

---

## Detector issues found while reading, not touched

**`cprScan.cpp` X/Y logic looks inverted.** The commented-out original treated a
large X/Y excursion as *"moving the mannequin rather than possible compression"*
and **excluded** it. The live code `||`s it in, so shifting the manikin registers
*as* a compression. Comment and code now disagree. This is what makes CPR
auto-engage unsafe.

**`CPR_HOLD` is 400 ms, comment says 200 ms.** 20 loops × 20 ms. Harmless for a
rising-edge trigger, but release detection is coarse — compression depth and duty
cycle are not recoverable from this signal, only timing.

**`sim-parse.cpp`, `getValueFromName()` — unrelated latent bug:**

```c
else if (strcmp(param_element, "cpr_time") == 0)
    rval = simmgr_shm->status.cardiac.bp_cuff;
```

`cpr_time` returns the BP cuff state. Almost certainly copy-paste from the line
above. Anything querying `cpr_time` is silently getting the wrong value.

---

## Working practices that came out of this

**Check line endings before every write-back.** `sim-ii/**` is CRLF;
`sim-remote/index.php` and `sim-remote/js/remote.js` are LF. Editing in a Linux
container converts CRLF→LF and makes git report the whole file rewritten. The
`sim-ii/js/*.js` and `sim-ii/ajax/*.php` files are mode 700; everything else is
600, and a write-back resets them to 600.

**Never reuse a staged copy of a file from an earlier task.** Re-stage from disk
immediately before editing. A stale copy once silently reverted a 28-line status
handler, which showed up as "the arterial line works on the instructor interface
and is dead on the student monitor".

**Avoid index-touching git commands over the device bridge.** They can leave a
`.git/index.lock` the bridge cannot delete, which then silently blocks the user's
`git add`. Use `git --no-optional-locks` if a diffstat is needed.

## Testing

The harnesses live in the cloud session and are scratch, not committed. Worth
knowing how they work, because they caught real bugs and one class of bug they
initially missed:

- Load `chart.js` and `controls.js` in headless Chromium with stubbed `$`,
  `profile`, `simmgr`, `controls`, and a **seeded `Math.random`** so two builds
  can be pixel-compared.
- Regression: render pre-change and post-change side by side at 125px strips and
  byte-compare the PNGs. This is what proved the channel manager was inert at the
  reference height.
- Numerics: read the drawn trace back off the canvas, convert pixel rows to mmHg,
  and assert the readout matches within ~2 mmHg (the trace is 2px wide).
- Geometry: render the real `vitals.php` body with stubs, toggle
  `controls.pac.setPlaced()`, and assert every readout's `scrollHeight` still fits
  its `clientHeight` at 4 and 5 channels.
- **Drive beats through `controls.heartRate.setSynch()`, never by setting
  `chart.status.cardiac.synch` directly.** The harnesses originally did the
  latter, which is exactly why they passed while the real app was broken with the
  ECG off.
- **Read canvas bitmaps via `canvas.toDataURL()`**, not Playwright element
  screenshots — those race the canvas and silently produce blank panels, which
  then compare equal to each other.

Ask and these can be rebuilt and committed if a permanent regression harness is
wanted.
