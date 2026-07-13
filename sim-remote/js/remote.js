/*
 * sim-remote/js/remote.js
 * Vanilla-JS controller for the OpenVetSim mobile remote interface.
 *
 * Architecture
 * ────────────
 * • Polls /simstatus.cgi?status=1 on port 40845 every 500 ms.
 *   The C++ daemon serves this page directly, so no PHP proxy is needed.
 * • Status values are stored in remote.state and reflected into the DOM.
 * • User interactions call remote.send() which GETs /simstatus.cgi?<params>,
 *   sending set: commands directly to the C++ daemon.
 * • Stepper buttons call remote.step(), which reads the current state value,
 *   clamps, and calls remote.send().
 * • Scenario list comes from /scenarios.cgi, a lightweight C++ endpoint that
 *   lists the scenarios/ directory.
 */

'use strict';

const remote = {

    // ── Internal state ─────────────────────────────────────────────────────
    state: {
        cardiac:     {},
        respiration: {},
        general:     {},
        scenario:    {},
    },

    // Stepper values — kept locally so we can increment without waiting for
    // the next poll cycle to confirm (avoids sluggish feel).
    local: {
        'set:cardiac:rate':          null,
        'set:cardiac:bps_sys':       null,
        'set:cardiac:bps_dia':       null,
        'set:respiration:spo2':      null,
        'set:respiration:rate':      null,
        'set:respiration:etco2':     null,
        'set:general:temperature':   null,   // stored ×10 internally
    },

    pollTimer:        null,
    pollInterval:     500,   // ms
    connected:        false,
    scenarioState:    'STOPPED',  // STOPPED | RUNNING | PAUSED
    tempUnit:         'f',        // 'f' or 'c'
    loadedScenario:   null,       // name of scenario whose events are loaded

    // "Apply" pattern: vitals are staged locally until the Apply button is pressed.
    // When dirty, setVal shows the staged value and updates a live indicator instead.
    cardiacDirty:     false,      // true when user has unstaged cardiac changes
    respirationDirty: false,      // true when user has unstaged respiration changes

    cprActive:        false,      // true when chest compressions are currently running

    // ── Bootstrap ──────────────────────────────────────────────────────────
    init() {
        this.loadScenarios();
        this.schedulePolL();
    },

    schedulePolL() {
        clearTimeout(this.pollTimer);
        this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
    },

    // ── Status poll ────────────────────────────────────────────────────────
    async poll() {
        try {
            const resp = await fetch('/simstatus.cgi?status=1', { cache: 'no-store' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            if (data.error) throw new Error(data.error);

            this.setConnected(true);
            this.applyStatus(data);
        } catch (e) {
            this.setConnected(false);
        } finally {
            this.schedulePolL();
        }
    },

    setConnected(ok) {
        if (this.connected === ok) return;
        this.connected = ok;
        const dot   = document.getElementById('status-dot');
        const label = document.getElementById('status-label');
        dot.className   = ok ? 'connected' : 'disconnected';
        label.textContent = ok ? 'Connected' : 'No connection';
    },

    // ── Apply status to DOM ────────────────────────────────────────────────
    applyStatus(data) {
        const c = data.cardiac     || {};
        const r = data.respiration || {};
        const g = data.general     || {};
        const s = data.scenario    || {};

        // ---- cardiac ----
        if (c.rate      !== undefined) this.setVal('hr',  c.rate,     'set:cardiac:rate');
        if (c.bps_sys   !== undefined) this.setVal('sys', c.bps_sys,  'set:cardiac:bps_sys');
        if (c.bps_dia   !== undefined) this.setVal('dia', c.bps_dia,  'set:cardiac:bps_dia');
        if (c.rhythm    !== undefined) this.setSelect('sel-rhythm',     c.rhythm);
        if (c.heart_sound !== undefined)       this.setSelect('sel-heart-sound', c.heart_sound);
        if (c.heart_sound_volume !== undefined) {
            const el = document.getElementById('vol-heart');
            if (el) { el.value = c.heart_sound_volume; document.getElementById('vol-heart-label').textContent = c.heart_sound_volume; }
        }

        // ---- respiration ----
        if (r.spo2  !== undefined) this.setVal('spo2',  r.spo2,  'set:respiration:spo2');
        if (r.rate  !== undefined) this.setVal('rr',    r.rate,  'set:respiration:rate');
        if (r.etco2 !== undefined) this.setVal('etco2', r.etco2, 'set:respiration:etco2');
        if (r.co2_waveform !== undefined && r.co2_waveform !== '')
            this.setSelect('sel-co2wave', r.co2_waveform);
        if (r.left_lung_sound  !== undefined) this.setSelect('sel-left-lung',  r.left_lung_sound);
        if (r.right_lung_sound !== undefined) this.setSelect('sel-right-lung', r.right_lung_sound);
        if (r.left_lung_sound_volume !== undefined) {
            const el = document.getElementById('vol-left');
            if (el) { el.value = r.left_lung_sound_volume; document.getElementById('vol-left-label').textContent = r.left_lung_sound_volume; }
        }
        if (r.right_lung_sound_volume !== undefined) {
            const el = document.getElementById('vol-right');
            if (el) { el.value = r.right_lung_sound_volume; document.getElementById('vol-right-label').textContent = r.right_lung_sound_volume; }
        }

        // ---- general (temperature) ----
        if (g.temperature !== undefined) {
            // Stored ×10 in C++; display one decimal place
            const raw = g.temperature;
            this.local['set:general:temperature'] = raw;
            const display = (raw / 10).toFixed(1);
            const el = document.getElementById('val-temp');
            if (el) el.textContent = display;
        }
        if (g.temperature_units !== undefined) {
            this.tempUnit = g.temperature_units;
            const unitEl = document.getElementById('val-temp-unit');
            if (unitEl) unitEl.textContent = this.tempUnit === 'c' ? '°C' : '°F';
        }

        // ---- scenario ----
        if (s.state !== undefined) {
            const newState = s.state.toUpperCase();
            if (newState !== this.scenarioState) {
                this.scenarioState = newState;
                this.updateScenarioUI();
            }
        }
        if (s.active !== undefined) {
            // Update scenario dropdown selection if changed externally
            const sel = document.getElementById('sel-scenario');
            if (sel && sel.value !== s.active) {
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value === s.active) { sel.selectedIndex = i; break; }
                }
            }
            // Load events whenever the active scenario changes
            if (s.active && s.active !== this.loadedScenario) {
                this.loadEvents(s.active);
            }
        }
        if (s.active !== undefined || s.state !== undefined) {
            const nameEl = document.getElementById('scenario-name-display');
            if (nameEl && s.active) {
                // Use the friendly name from our loaded list, or fall back to dir name
                const opt = document.querySelector(`#sel-scenario option[value="${s.active}"]`);
                nameEl.textContent = opt ? opt.textContent : (s.active || 'No scenario loaded');
            }
        }
        if (s.scene_name !== undefined) {
            const infoEl = document.getElementById('scene-info');
            if (infoEl) infoEl.textContent = s.scene_name || '';
        }

        // ---- CPR ----
        const cpr = data.cpr || {};
        if (cpr.compression !== undefined) {
            const active = cpr.compression !== 0 && cpr.compression !== '0';
            if (active !== this.cprActive) {
                this.cprActive = active;
                this.updateCprButton();
            }
        }
        if (s.runtimeScenario !== undefined) {
            const timerEl = document.getElementById('scenario-timer');
            if (timerEl) timerEl.textContent = s.runtimeScenario || '--:--';
        }
    },

    // Set a numeric display value.
    // When the card is dirty (staged changes pending): keep showing the staged
    // value and instead update the small live indicator below it.
    // When clean: update the main display and local tracker from the server.
    setVal(elId, serverVal, localKey) {
        const isDirty = (localKey.startsWith('set:cardiac:')     && this.cardiacDirty) ||
                        (localKey.startsWith('set:respiration:') && this.respirationDirty);

        const liveEl = document.getElementById('live-' + elId);

        if (isDirty) {
            // Keep staged value visible; show server value in the live indicator
            if (this.local[localKey] === null) this.local[localKey] = serverVal;
            if (liveEl) liveEl.textContent = '↓' + serverVal;
        } else {
            // No pending changes — display tracks server
            const el = document.getElementById('val-' + elId);
            if (el) el.textContent = serverVal;
            this.local[localKey] = serverVal;
            if (liveEl) liveEl.textContent = '';
        }
    },

    setSelect(elId, value) {
        // Don't override a pending selection while the card is dirty
        if (elId === 'sel-rhythm'  && this.cardiacDirty)     return;
        if (elId === 'sel-co2wave' && this.respirationDirty) return;

        const el = document.getElementById(elId);
        if (!el) return;
        for (let i = 0; i < el.options.length; i++) {
            if (el.options[i].value === String(value)) { el.selectedIndex = i; return; }
        }
    },

    // ── Stepper ────────────────────────────────────────────────────────────
    // Cardiac and respiratory steppers stage changes locally.
    // Nothing is sent to the server until the Apply button is pressed.
    step(param, delta, min, max) {
        let current = this.local[param];
        if (current === null || current === undefined) return;
        current = Number(current);
        let next = Math.max(min, Math.min(max, current + delta));
        this.local[param] = next;

        // Mark the relevant card as having pending (un-applied) changes
        if (param.startsWith('set:cardiac:')) {
            this.cardiacDirty = true;
            document.getElementById('card-cardiac')?.classList.add('has-pending');
        } else if (param.startsWith('set:respiration:')) {
            this.respirationDirty = true;
            document.getElementById('card-resp')?.classList.add('has-pending');
        }

        // Map param key → display element id
        const displayMap = {
            'set:cardiac:rate':     'hr',
            'set:cardiac:bps_sys':  'sys',
            'set:cardiac:bps_dia':  'dia',
            'set:respiration:spo2': 'spo2',
            'set:respiration:rate': 'rr',
            'set:respiration:etco2':'etco2',
        };
        const elId = displayMap[param];
        if (elId) {
            const el = document.getElementById('val-' + elId);
            if (el) el.textContent = next;
        }

        // NOTE: send() is intentionally NOT called here.
        // Values are staged until the Apply button is pressed.
    },

    // ── Mark dirty (called by select onchange) ─────────────────────────────
    markCardiacDirty() {
        this.cardiacDirty = true;
        document.getElementById('card-cardiac')?.classList.add('has-pending');
    },

    markRespirationDirty() {
        this.respirationDirty = true;
        document.getElementById('card-resp')?.classList.add('has-pending');
    },

    // ── Apply staged cardiac values ─────────────────────────────────────────
    // Sends all staged cardiac values plus the selected transfer time in one
    // request, then resets dirty state so the display resumes tracking the server.
    applyCardiac() {
        const time   = document.getElementById('sel-cardiac-time')?.value ?? '0';
        const params = {};

        if (this.local['set:cardiac:rate']    !== null) params['set:cardiac:rate']    = this.local['set:cardiac:rate'];
        if (this.local['set:cardiac:bps_sys'] !== null) params['set:cardiac:bps_sys'] = this.local['set:cardiac:bps_sys'];
        if (this.local['set:cardiac:bps_dia'] !== null) params['set:cardiac:bps_dia'] = this.local['set:cardiac:bps_dia'];

        const rhythm = document.getElementById('sel-rhythm')?.value;
        if (rhythm) params['set:cardiac:rhythm'] = rhythm;

        params['set:cardiac:transfer_time'] = time;
        this.send(params);

        // Clear dirty state — display will resume tracking server on next poll
        this.cardiacDirty = false;
        document.getElementById('card-cardiac')?.classList.remove('has-pending');
        this.local['set:cardiac:rate']    = null;
        this.local['set:cardiac:bps_sys'] = null;
        this.local['set:cardiac:bps_dia'] = null;
        ['hr', 'sys', 'dia'].forEach(id => {
            const el = document.getElementById('live-' + id);
            if (el) el.textContent = '';
        });
    },

    // ── Apply staged respiratory values ────────────────────────────────────
    applyRespiration() {
        const time   = document.getElementById('sel-resp-time')?.value ?? '0';
        const params = {};

        if (this.local['set:respiration:etco2'] !== null) params['set:respiration:etco2'] = this.local['set:respiration:etco2'];
        if (this.local['set:respiration:rate']  !== null) params['set:respiration:rate']  = this.local['set:respiration:rate'];
        if (this.local['set:respiration:spo2']  !== null) params['set:respiration:spo2']  = this.local['set:respiration:spo2'];

        const co2wave = document.getElementById('sel-co2wave')?.value;
        if (co2wave) params['set:respiration:co2_waveform'] = co2wave;

        params['set:respiration:transfer_time'] = time;
        this.send(params);

        // Clear dirty state
        this.respirationDirty = false;
        document.getElementById('card-resp')?.classList.remove('has-pending');
        this.local['set:respiration:etco2'] = null;
        this.local['set:respiration:rate']  = null;
        this.local['set:respiration:spo2']  = null;
        ['etco2', 'rr', 'spo2'].forEach(id => {
            const el = document.getElementById('live-' + id);
            if (el) el.textContent = '';
        });
    },

    // ── Value editor (tap-to-enter) ────────────────────────────────────────
    // Tapping a value display opens a modal with a large number input.
    // scale: display = internal / scale; confirm multiplies back (default 1).
    // Temperature uses scale=10 because it's stored ×10 internally.

    valueEditorParam:    null,
    valueEditorMin:      0,
    valueEditorMax:      999,
    valueEditorScale:    1,
    valueEditorDecimals: false,  // true for params that allow decimal entry (temperature)
    keypadFirstPress:    true,   // first digit clears the pre-filled hint value

    openValueEditor(param, internalMin, internalMax, label, unit, scale = 1) {
        const current = this.local[param];
        if (current === null || current === undefined) return;

        this.valueEditorParam    = param;
        this.valueEditorMin      = internalMin;
        this.valueEditorMax      = internalMax;
        this.valueEditorScale    = scale;
        this.valueEditorDecimals = scale > 1;
        this.keypadFirstPress    = true;

        document.getElementById('value-editor-label').textContent = label;
        document.getElementById('value-editor-unit').textContent  = unit;

        // Show the decimal key only for params that need it (temperature)
        const dotBtn = document.getElementById('key-dot-btn');
        if (dotBtn) dotBtn.classList.toggle('active', this.valueEditorDecimals);

        // Pre-fill with the current staged value as a dimmed hint
        const input = document.getElementById('value-editor-input');
        input.value = scale > 1 ? (current / scale).toFixed(1) : String(current);
        input.classList.add('hint');

        document.getElementById('value-editor-overlay').classList.add('open');
        // No focus() call — the custom keypad handles all input; no native keyboard needed
    },

    // ── Custom keypad ────────────────────────────────────────────────────────
    keypadPress(key) {
        const input = document.getElementById('value-editor-input');
        if (!input) return;

        // Clear hint styling on first interaction
        if (this.keypadFirstPress && key !== 'C') {
            input.classList.remove('hint');
            if (key === '⌫') { input.value = ''; this.keypadFirstPress = false; return; }
            if (key === '.')  {
                if (!this.valueEditorDecimals) return;
                input.value = '0.'; this.keypadFirstPress = false; return;
            }
            // First digit: replace hint entirely
            input.value = key;
            this.keypadFirstPress = false;
            return;
        }

        let val = input.value;

        if (key === 'C') {
            input.value = '';
            input.classList.remove('hint');
            this.keypadFirstPress = false;
            return;
        }
        if (key === '⌫') {
            input.value = val.slice(0, -1);
            return;
        }
        if (key === '.') {
            if (!this.valueEditorDecimals || val.includes('.')) return;
            input.value = (val || '0') + '.';
            return;
        }

        // Digit: allow up to 4 significant digits
        const digitCount = val.replace('.', '').length;
        if (digitCount >= 4) return;
        input.value = val + key;
    },

    openTempEditor() {
        const unit = this.tempUnit === 'c' ? '°C' : '°F';
        this.openValueEditor('set:general:temperature', 320, 1120, 'Temperature', unit, 10);
    },

    confirmValueEditor() {
        const param = this.valueEditorParam;
        if (!param) return;

        const input = document.getElementById('value-editor-input');
        input.classList.remove('hint');
        const displayVal = parseFloat(input.value);
        if (isNaN(displayVal) || input.value.trim() === '') { this.closeValueEditor(); return; }

        // Convert display value → internal units; clamp to valid range
        let internalVal = Math.round(displayVal * this.valueEditorScale);
        internalVal = Math.max(this.valueEditorMin, Math.min(this.valueEditorMax, internalVal));
        this.local[param] = internalVal;

        // Mark dirty for staged-apply params
        if (param.startsWith('set:cardiac:')) {
            this.cardiacDirty = true;
            document.getElementById('card-cardiac')?.classList.add('has-pending');
        } else if (param.startsWith('set:respiration:')) {
            this.respirationDirty = true;
            document.getElementById('card-resp')?.classList.add('has-pending');
        }

        // Update the value display
        const displayMap = {
            'set:cardiac:rate':          'hr',
            'set:cardiac:bps_sys':       'sys',
            'set:cardiac:bps_dia':       'dia',
            'set:respiration:spo2':      'spo2',
            'set:respiration:rate':      'rr',
            'set:respiration:etco2':     'etco2',
            'set:general:temperature':   'temp',
        };
        const elId = displayMap[param];
        if (elId) {
            const el = document.getElementById('val-' + elId);
            if (el) el.textContent = this.valueEditorScale > 1
                ? (internalVal / this.valueEditorScale).toFixed(1)
                : internalVal;
        }

        // Temperature sends immediately (no Apply step)
        if (param === 'set:general:temperature') {
            this.send({ 'set:general:temperature': internalVal });
        }

        this.closeValueEditor();
    },

    closeValueEditor() {
        document.getElementById('value-editor-overlay').classList.remove('open');
        document.getElementById('value-editor-input')?.classList.remove('hint');
        this.valueEditorParam = null;
        this.keypadFirstPress = true;
    },

    stepTemp(delta) {
        // delta is in tenths of a degree as stored internally (±1 = ±0.1°)
        // Present as: delta ±10 (= ±1.0 degree) for a reasonable step size
        const bigDelta = delta * 10;  // ±10 = ±1.0°
        let current = this.local['set:general:temperature'];
        if (current === null || current === undefined) return;
        current = Number(current);
        // Clamp: 32–1120 (×10) = 3.2°C – 112.0°F … wide enough for any sim scenario
        let next = Math.max(320, Math.min(1120, current + bigDelta));
        this.local['set:general:temperature'] = next;
        const el = document.getElementById('val-temp');
        if (el) el.textContent = (next / 10).toFixed(1);
        this.send({ 'set:general:temperature': next });
    },

    // ── Send command ────────────────────────────────────────────────────────
    // Sends a set: command directly to the C++ daemon as a GET query string.
    // URLSearchParams encodes colons as %3A which the C++ server decodes.
    async send(params) {
        try {
            const qs = new URLSearchParams(params).toString();
            await fetch('/simstatus.cgi?' + qs, { cache: 'no-store' });
        } catch (e) {
            // Silent failure — next poll will reveal disconnection
        }
    },

    // ── Tab switching ───────────────────────────────────────────────────────
    switchTab(name, btn) {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const panel = document.getElementById('tab-' + name);
        if (panel) panel.classList.add('active');
        if (btn)   btn.classList.add('active');
    },

    // ── Scenario list ───────────────────────────────────────────────────────
    // Fetches from /scenarios.cgi — a C++ endpoint that returns a JSON array
    // of scenario directory names: ["scenario1", "scenario2", ...].
    async loadScenarios() {
        try {
            const resp = await fetch('/scenarios.cgi', { cache: 'no-store' });
            const dirs = await resp.json();
            if (!Array.isArray(dirs) || dirs.length === 0) return;

            const sel = document.getElementById('sel-scenario');
            sel.innerHTML = '<option value="">— Select a scenario —</option>';
            dirs.forEach(dir => {
                const opt = document.createElement('option');
                opt.value       = dir;
                opt.textContent = dir;
                sel.appendChild(opt);
            });
        } catch (e) {
            // Will retry when user visits the Scenario tab
        }
    },

    selectScenario(dir) {
        if (!dir) return;
        this.send({ 'set:scenario:active': dir });
        // Update name display immediately (optimistic)
        const opt = document.querySelector(`#sel-scenario option[value="${dir}"]`);
        const nameEl = document.getElementById('scenario-name-display');
        if (nameEl && opt) nameEl.textContent = opt.textContent;
    },

    // ── Scenario control ────────────────────────────────────────────────────
    toggleRun() {
        if (this.scenarioState === 'RUNNING') {
            this.send({ 'set:scenario:state': 'Paused' });
        } else {
            // STOPPED or PAUSED → Running
            this.send({ 'set:scenario:state': 'Running' });
        }
    },

    terminateScenario() {
        if (!confirm('Terminate scenario?')) return;
        this.send({ 'set:scenario:state': 'Terminate' });
    },

    updateScenarioUI() {
        const badge     = document.getElementById('scenario-state-badge');
        const btnRun    = document.getElementById('btn-run');
        const btnTerm   = document.getElementById('btn-terminate');
        const picker    = document.getElementById('scenario-picker-card');
        const qaCard    = document.getElementById('quick-action-card');

        // Reset badge classes
        badge.className = '';
        badge.textContent = this.scenarioState;

        const isActive = (this.scenarioState === 'RUNNING' || this.scenarioState === 'PAUSED');

        // Show quick-action card while running/paused; show picker otherwise
        if (picker) picker.style.display = isActive ? 'none' : '';
        if (qaCard) qaCard.style.display = isActive ? ''     : 'none';

        switch (this.scenarioState) {
            case 'RUNNING':
                badge.classList.add('running');
                btnRun.textContent = 'Pause';
                btnRun.className   = 'action-btn btn-pause';
                btnTerm.style.display = '';
                break;
            case 'PAUSED':
                badge.classList.add('paused');
                btnRun.textContent = 'Resume';
                btnRun.className   = 'action-btn btn-start';
                btnTerm.style.display = '';
                break;
            default:  // STOPPED / TERMINATE
                badge.classList.add('stopped');
                btnRun.textContent = 'Start';
                btnRun.className   = 'action-btn btn-start';
                btnTerm.style.display = 'none';
                break;
        }
    },

    // ── Quick action buttons ────────────────────────────────────────────────

    // CC — toggles chest compressions on/off (equivalent to 'c' hotkey)
    pressCC() {
        const next = this.cprActive ? 0 : 1;
        this.send({ 'set:cpr:compression': next });
        // Optimistic update — server will confirm on next poll
        this.cprActive = !this.cprActive;
        this.updateCprButton();
    },

    // Breath — triggers one manual breath (equivalent to 'b' hotkey)
    pressBreath() {
        this.send({ 'set:respiration:manual_breath': 1 });
    },

    // Defib — triggers the AED event (equivalent to 'd' hotkey)
    pressDefib() {
        this.send({ 'set:event:event_id': 'aed' });
    },

    // Keep the CC button appearance in sync with cprActive state
    updateCprButton() {
        const btn = document.getElementById('btn-cc');
        if (!btn) return;
        if (this.cprActive) {
            btn.classList.add('cc-active');
            btn.textContent = 'Stop CC';
        } else {
            btn.classList.remove('cc-active');
            btn.textContent = 'CC';
        }
    },

    // ── Events ──────────────────────────────────────────────────────────────
    // Fetch the scenario XML from /scenarioxml.cgi, parse with DOMParser,
    // and populate the priority and all-events dropdowns.
    async loadEvents(scenarioName) {
        this.loadedScenario = scenarioName;

        const selP = document.getElementById('sel-priority-event');
        const selA = document.getElementById('sel-all-events');
        const card = document.getElementById('events-card');
        if (!selP || !selA) return;

        selP.innerHTML = '<option value="">— Loading… —</option>';
        selA.innerHTML = '<option value="">— Loading… —</option>';

        try {
            const resp = await fetch('/scenarioxml.cgi?scenario=' + encodeURIComponent(scenarioName),
                                     { cache: 'no-store' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const xmlText = await resp.text();
            const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

            const categories = doc.querySelectorAll('events > category');
            if (!categories.length) throw new Error('No events in XML');

            const priorityEvents = [];

            selP.innerHTML = '<option value="">— Select priority event —</option>';
            selA.innerHTML = '<option value="">— Select event —</option>';

            categories.forEach(cat => {
                const catTitle = cat.querySelector(':scope > title')?.textContent?.trim() || '';
                const evEls    = cat.querySelectorAll(':scope > event');
                if (!evEls.length) return;

                const group = document.createElement('optgroup');
                group.label = catTitle;

                evEls.forEach(ev => {
                    const title    = ev.querySelector('title')?.textContent?.trim()    || '';
                    const id       = ev.querySelector('id')?.textContent?.trim()       || '';
                    const priority = ev.querySelector('priority')?.textContent?.trim() || '0';
                    if (!id) return;

                    const opt = document.createElement('option');
                    opt.value       = id;
                    opt.textContent = title;
                    group.appendChild(opt);

                    if (priority === '1') priorityEvents.push({ title, id });
                });

                if (group.children.length) selA.appendChild(group);
            });

            priorityEvents.forEach(ev => {
                const opt = document.createElement('option');
                opt.value       = ev.id;
                opt.textContent = ev.title;
                selP.appendChild(opt);
            });

            if (card) card.style.display = '';
        } catch(e) {
            selP.innerHTML = '<option value="">— No events —</option>';
            selA.innerHTML = '<option value="">— No events —</option>';
        }
    },

    // Send the selected event to the C++ daemon, then reset the dropdown.
    triggerEvent(selId) {
        const sel = document.getElementById(selId);
        if (!sel || !sel.value) return;
        const id = sel.value;
        this.send({ 'set:event:event_id': id });
        sel.selectedIndex = 0;   // reset to placeholder
    },

    // ── Log comment ─────────────────────────────────────────────────────────
    addComment() {
        const input = document.getElementById('comment-input');
        const text  = (input ? input.value : '').trim();
        if (!text) { alert('Please enter a comment.'); return; }
        this.send({ 'set:event:comment': text });
        input.value = '';
    },

};

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', () => remote.init());
