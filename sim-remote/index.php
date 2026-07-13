<?php require_once('init.php'); ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>OpenVetSim Remote</title>
<link rel="stylesheet" href="css/remote.css">
</head>
<body>

<!-- ── Header ── -->
<div id="header">
  <h1>OpenVetSim Remote</h1>
  <div id="connection-status">
    <span id="status-dot" class="disconnected"></span>
    <span id="status-label">Connecting…</span>
  </div>
</div>

<!-- ── Main content ── -->
<div id="content">

  <!-- ════════════════ VITALS TAB ════════════════ -->
  <div id="tab-vitals" class="tab-panel active">
    <div class="grid-2">

      <!-- Cardiac card -->
      <div class="card cardiac">
        <div class="card-title">❤ Cardiac</div>

        <div class="vital-row">
          <span class="vital-label">Heart Rate</span>
          <div class="vital-controls">
            <button class="step-btn" onclick="remote.step('set:cardiac:rate', -5, 0, 300)">−</button>
            <span class="vital-value" id="val-hr">--</span>
            <button class="step-btn" onclick="remote.step('set:cardiac:rate', +5, 0, 300)">+</button>
            <span class="vital-unit">bpm</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="select-row">
          <div class="select-label">ECG Rhythm</div>
          <select class="remote-select" id="sel-rhythm" onchange="remote.send({'set:cardiac:rhythm': this.value})">
            <option value="sinus">Sinus Rhythm</option>
            <option value="afib">Atrial Fibrillation</option>
            <option value="vtach1">V-Tach 1</option>
            <option value="vtach2">V-Tach 2</option>
            <option value="vtach3">R on T</option>
            <option value="vfib">Ventricular Fibrillation</option>
            <option value="asystole">Asystole</option>
          </select>
        </div>

        <div class="divider"></div>

        <div class="vital-row">
          <span class="vital-label">Systolic BP</span>
          <div class="vital-controls">
            <button class="step-btn" onclick="remote.step('set:cardiac:bps_sys', -5, 0, 300)">−</button>
            <span class="vital-value" id="val-sys">--</span>
            <button class="step-btn" onclick="remote.step('set:cardiac:bps_sys', +5, 0, 300)">+</button>
            <span class="vital-unit">mmHg</span>
          </div>
        </div>

        <div class="vital-row">
          <span class="vital-label">Diastolic BP</span>
          <div class="vital-controls">
            <button class="step-btn" onclick="remote.step('set:cardiac:bps_dia', -5, 0, 200)">−</button>
            <span class="vital-value" id="val-dia">--</span>
            <button class="step-btn" onclick="remote.step('set:cardiac:bps_dia', +5, 0, 200)">+</button>
            <span class="vital-unit">mmHg</span>
          </div>
        </div>
      </div>

      <!-- Respiratory card -->
      <div class="card resp">
        <div class="card-title">🌬 Respiratory</div>

        <div class="vital-row">
          <span class="vital-label">SpO₂</span>
          <div class="vital-controls">
            <button class="step-btn" onclick="remote.step('set:respiration:spo2', -1, 0, 100)">−</button>
            <span class="vital-value" id="val-spo2">--</span>
            <button class="step-btn" onclick="remote.step('set:respiration:spo2', +1, 0, 100)">+</button>
            <span class="vital-unit">%</span>
          </div>
        </div>

        <div class="vital-row">
          <span class="vital-label">Resp Rate</span>
          <div class="vital-controls">
            <button class="step-btn" onclick="remote.step('set:respiration:rate', -2, 0, 60)">−</button>
            <span class="vital-value" id="val-rr">--</span>
            <button class="step-btn" onclick="remote.step('set:respiration:rate', +2, 0, 60)">+</button>
            <span class="vital-unit">bpm</span>
          </div>
        </div>

        <div class="vital-row">
          <span class="vital-label">ETCO₂</span>
          <div class="vital-controls">
            <button class="step-btn" onclick="remote.step('set:respiration:etco2', -1, 0, 100)">−</button>
            <span class="vital-value" id="val-etco2">--</span>
            <button class="step-btn" onclick="remote.step('set:respiration:etco2', +1, 0, 100)">+</button>
            <span class="vital-unit">mmHg</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="select-row">
          <div class="select-label">ETCO₂ Waveform</div>
          <select class="remote-select" id="sel-co2wave" onchange="remote.send({'set:respiration:co2_waveform': this.value})">
            <option value="normal">Normal</option>
            <option value="rebreathing">Rebreathing</option>
            <option value="obstructive">Obstructive (Shark Fin)</option>
            <option value="curare">Curare Cleft</option>
          </select>
        </div>

        <div class="divider"></div>

        <div class="vital-row general">
          <span class="vital-label">Temperature</span>
          <div class="vital-controls">
            <button class="step-btn" onclick="remote.stepTemp(-1)">−</button>
            <span class="vital-value" id="val-temp">--</span>
            <button class="step-btn" onclick="remote.stepTemp(+1)">+</button>
            <span class="vital-unit" id="val-temp-unit">°F</span>
          </div>
        </div>
      </div>

    </div><!-- /grid-2 -->
  </div><!-- /tab-vitals -->


  <!-- ════════════════ SOUNDS TAB ════════════════ -->
  <div id="tab-sounds" class="tab-panel">

    <!-- Heart sounds -->
    <div class="card cardiac">
      <div class="card-title">❤ Heart Sounds</div>

      <div class="select-row">
        <div class="select-label">Heart Sound Type</div>
        <select class="remote-select" id="sel-heart-sound"
                onchange="remote.send({'set:cardiac:heart_sound': this.value})">
          <option value="normal">Normal</option>
          <option value="systolic_murmur">Systolic Murmur</option>
          <option value="pansystolic_murmur" disabled>Pansystolic Murmur</option>
          <option value="holosystolic_murmur" disabled>Holosystolic Murmur</option>
          <option value="continuous_murmur" disabled>Continuous Murmur</option>
          <option value="diastolic_murmur" disabled>Diastolic Murmur</option>
          <option value="gallop" disabled>Gallop</option>
        </select>
      </div>

      <div class="volume-row">
        <label>Volume (<span id="vol-heart-label">5</span>)</label>
        <input type="range" id="vol-heart" min="1" max="10" value="5"
               onchange="remote.send({'set:cardiac:heart_sound_volume': this.value})"
               oninput="document.getElementById('vol-heart-label').textContent = this.value">
      </div>
    </div>

    <!-- Left lung -->
    <div class="card resp">
      <div class="card-title">🌬 Left Lung Sound</div>
      <div class="select-row">
        <select class="remote-select" id="sel-left-lung"
                onchange="remote.send({'set:respiration:left_lung_sound': this.value})">
          <option value="normal">Normal</option>
          <option value="coarse_crackles">Coarse Crackles</option>
          <option value="fine_crackles">Fine Crackles</option>
          <option value="wheezes">Wheezes</option>
          <option value="stridor" disabled>Stridor</option>
          <option value="stertor" disabled>Stertor</option>
        </select>
      </div>
      <div class="volume-row">
        <label>Volume (<span id="vol-left-label">5</span>)</label>
        <input type="range" id="vol-left" min="1" max="10" value="5"
               onchange="remote.send({'set:respiration:left_lung_sound_volume': this.value})"
               oninput="document.getElementById('vol-left-label').textContent = this.value">
      </div>
    </div>

    <!-- Right lung -->
    <div class="card resp">
      <div class="card-title">🌬 Right Lung Sound</div>
      <div class="select-row">
        <select class="remote-select" id="sel-right-lung"
                onchange="remote.send({'set:respiration:right_lung_sound': this.value})">
          <option value="normal">Normal</option>
          <option value="coarse_crackles">Coarse Crackles</option>
          <option value="fine_crackles">Fine Crackles</option>
          <option value="wheezes">Wheezes</option>
          <option value="stridor" disabled>Stridor</option>
          <option value="stertor" disabled>Stertor</option>
        </select>
      </div>
      <div class="volume-row">
        <label>Volume (<span id="vol-right-label">5</span>)</label>
        <input type="range" id="vol-right" min="1" max="10" value="5"
               onchange="remote.send({'set:respiration:right_lung_sound_volume': this.value})"
               oninput="document.getElementById('vol-right-label').textContent = this.value">
      </div>
    </div>

  </div><!-- /tab-sounds -->


  <!-- ════════════════ SCENARIO TAB ════════════════ -->
  <div id="tab-scenario" class="tab-panel">

    <!-- Status bar -->
    <div id="scenario-status-bar">
      <div>
        <div id="scenario-name-display">No scenario loaded</div>
        <div id="scene-info"></div>
      </div>
      <div id="scenario-state-badge" class="stopped">STOPPED</div>
    </div>

    <!-- Scenario picker -->
    <div class="card">
      <div class="card-title">Select Scenario</div>
      <div class="select-row">
        <select class="remote-select" id="sel-scenario" onchange="remote.selectScenario(this.value)">
          <option value="">— Loading scenarios… —</option>
        </select>
      </div>
    </div>

    <!-- Control buttons -->
    <div class="card">
      <div class="card-title">Scenario Control</div>
      <button class="action-btn btn-start" id="btn-run" onclick="remote.toggleRun()">Start</button>
      <button class="action-btn btn-terminate" id="btn-terminate"
              onclick="remote.terminateScenario()" style="display:none">Terminate</button>
    </div>

  </div><!-- /tab-scenario -->


  <!-- ════════════════ LOG TAB ════════════════ -->
  <div id="tab-log" class="tab-panel">
    <div class="card">
      <div class="card-title">Add Comment to Log</div>
      <textarea id="comment-input" placeholder="Enter comment…" rows="3"></textarea>
      <button class="action-btn btn-start" onclick="remote.addComment()">Add to Log</button>
    </div>

    <div class="card">
      <div class="card-title">Scenario Timer</div>
      <div style="font-size:28px; font-weight:700; color:var(--amber); font-variant-numeric:tabular-nums;"
           id="scenario-timer">--:--</div>
    </div>
  </div><!-- /tab-log -->

</div><!-- /content -->


<!-- ── Tab bar ── -->
<nav id="tab-bar">
  <button class="tab-btn active" onclick="remote.switchTab('vitals', this)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    Vitals
  </button>
  <button class="tab-btn" onclick="remote.switchTab('sounds', this)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
    Sounds
  </button>
  <button class="tab-btn" onclick="remote.switchTab('scenario', this)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    Scenario
  </button>
  <button class="tab-btn" onclick="remote.switchTab('log', this)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    Log
  </button>
</nav>

<script src="js/remote.js"></script>
</body>
</html>
