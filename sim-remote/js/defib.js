/*
 * defib.js - OpenVetSim manual defibrillator for a tablet.
 *
 * Served by the simulator at http://<computer>:40845/sim-remote/defib.html and
 * opened from the "Connect Defibrillator…" QR code in the app's Simulation menu.
 *
 *   ECG     drawn by the patient monitor's own chart.js and controls.js, fed
 *           from the simulator's status. Shown only while the ECG leads are
 *           connected on the monitor (cardiac:ecg_indicator).
 *   Shock   sends the same "aed" event as the instructor's shock control, so
 *           the instructor log, any scenario trigger on the aed event, and the
 *           defibrillation artifact on every ECG all respond exactly as they do
 *           today. The energy delivered is logged alongside it as a comment.
 *
 * Charge cycle (times are the constants below):
 *
 *   CHARGE ─9 s─▶ CHARGED ─30 s─▶ WARNING ─20 s─▶ internal discharge
 *                     │               │
 *                     └── SHOCK ──────┴──▶ shock delivered
 *
 * The defibrillator never changes a vital sign itself. Whether a shock
 * converts the rhythm is up to the scenario, exactly as for the existing
 * shock control.
 */
var defib = {
	// ---- timing (milliseconds) ----------------------------------------------
	CHARGE_MS: 9000,			// charge time - also sets the length of the charging
								// sound's rising sweep and of the progress bar
	READY_TO_WARNING_MS: 30000,	// fully charged -> warning tone
	WARNING_TO_DISARM_MS: 20000,	// warning tone -> internal discharge
	MESSAGE_MS: 3500,			// how long a one-off status message stays up
	BOOT_MS: 1400,				// power-on self test
	POLL_MS: 500,				// simulator status poll, as sim-remote uses

	// ---- energy -------------------------------------------------------------
	// The manual biphasic ladder used by common clinical units. The low steps
	// suit small veterinary patients.
	ENERGIES: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30, 50, 70, 85, 100, 120, 150, 200],
	DEFAULT_ENERGY: 50,

	// ---- state --------------------------------------------------------------
	state: 'off',				// off | boot | idle | charging | ready | warning
	energyIndex: 0,
	shocks: 0,
	timers: {},
	poweredAt: 0,
	messageTimer: 0,
	wakeLock: null,

	// status-adapter state
	engineDefibLast: 0,			// defibrillation.last as last reported
	localShockUntil: 0,			// suppress the artifact exit while our own shock lands
	pollFailures: 0,

	// =========================================================================
	// Start-up
	// =========================================================================
	init: function() {
		defib.energyIndex = Math.max(0, defib.ENERGIES.indexOf(defib.DEFAULT_ENERGY));

		defib.initEcg();

		defib.bind('btn-power', defib.togglePower);
		defib.bind('btn-energy-up', function() { defib.stepEnergy(+1); });
		defib.bind('btn-energy-down', function() { defib.stepEnergy(-1); });
		defib.bind('btn-charge', defib.charge);
		defib.bind('btn-shock', defib.shock);

		document.addEventListener('visibilitychange', function() {
			if (document.visibilityState === 'visible' && defib.isOn()) {
				defib.requestWakeLock();
			}
		});

		setInterval(defib.tickElapsed, 1000);
		defib.render();
		defib.poll();
	},

	bind: function(id, fn) {
		var el = document.getElementById(id);
		el.addEventListener('click', function(e) {
			e.preventDefault();
			fn();
		});
		// stop a long press from bringing up the tablet's text-selection callout
		el.addEventListener('contextmenu', function(e) { e.preventDefault(); });
	},

	// The ECG strip: the patient monitor's chart.js, laid out on a design canvas
	// sized for this screen rather than the monitor's 1280x720 one.
	initEcg: function() {
		// 600 px at the monitor's 15 ms per pixel puts about 9 s on screen, close
		// to a defibrillator's 25 mm/s sweep, and the 2:1 shape fills this screen.
		chart.layout.designWidth = 600;
		chart.layout.designHeight = 300;
		chart.layout.areaTop = 0;
		chart.layout.areaHeight = 300;
		chart.layout.gap = 0;
		chart.layout.stripLeft = 0;
		chart.layout.stripWidth = 600;
		chart.layout.readoutLeft = 600;
		chart.layout.readoutWidth = 0;
		chart.layout.bottomTop = 300;
		chart.layout.bottomHeight = 0;

		// chart.init() always builds the capnograph strip; switching its channel
		// off gives the ECG the whole screen and keeps the capnograph hidden.
		var resp = chart.channelFor('resp');
		if (resp) { resp.enabled = false; }

		chart.ekg.color = '#3dff74';
		chart.init();
		controls.heartRate.init();
	},

	// =========================================================================
	// Controls
	// =========================================================================
	isOn: function() { return defib.state !== 'off'; },
	isCharged: function() { return defib.state === 'ready' || defib.state === 'warning'; },
	energy: function() { return defib.ENERGIES[defib.energyIndex]; },

	togglePower: function() {
		if (defib.isOn()) {
			defib.powerOff();
		} else {
			defib.powerOn();
		}
	},

	powerOn: function() {
		// first touch: this is the gesture that lets the tablet make sound
		defibAudio.unlock();
		defibAudio.boot();
		defib.requestWakeLock();

		defib.shocks = 0;
		defib.energyIndex = Math.max(0, defib.ENERGIES.indexOf(defib.DEFAULT_ENERGY));
		defib.poweredAt = Date.now();

		// start the sweep fresh from the left, as a monitor does when it comes on
		if (chart.ekg.ctx) {
			chart.ekg.ctx.clearRect(0, 0, chart.layout.stripWidth + 10, chart.ekg.height + 10);
			chart.ekg.xPos = chart.ekg.xOffsetLeft;
		}

		defib.setState('boot');
		document.getElementById('boot-result').textContent = '…';
		defib.timers.boot = setTimeout(function() {
			document.getElementById('boot-result').textContent = 'PASSED';
			defib.timers.boot = setTimeout(function() {
				defib.setState('idle');
				defib.message('SELECT ENERGY');
			}, 500);
		}, defib.BOOT_MS - 500);
	},

	powerOff: function() {
		// a charge held at power-off is dumped internally - silently, and it is
		// not a shock, so nothing is logged
		defib.clearTimers();
		defibAudio.silence();
		defib.releaseWakeLock();
		defib.setState('off');
	},

	stepEnergy: function(dir) {
		if (!defib.isOn() || defib.state === 'boot') { return; }
		var i = Math.min(defib.ENERGIES.length - 1, Math.max(0, defib.energyIndex + dir));
		if (i === defib.energyIndex) { return; }
		defibAudio.key();

		// Changing the energy removes any charge in progress or held - the
		// capacitor holds the old energy - and the operator has to charge again.
		var hadCharge = (defib.state === 'charging' || defib.isCharged());
		defib.energyIndex = i;
		if (hadCharge) {
			defib.disarm('ENERGY CHANGED · CHARGE REMOVED');
		} else {
			defib.render();
			defib.message('ENERGY ' + defib.energy() + ' J · PRESS CHARGE');
		}
	},

	charge: function() {
		if (defib.state !== 'idle') { return; }
		defib.clearTimers();
		defib.setState('charging');
		defib.status('CHARGING ' + defib.energy() + ' J');
		defibAudio.charging(defib.CHARGE_MS);

		// the bar fills over exactly the charge time
		var fill = document.getElementById('charge-fill');
		fill.style.transition = 'none';
		fill.style.width = '0%';
		void fill.offsetWidth;
		fill.style.transition = 'width ' + defib.CHARGE_MS + 'ms linear';
		fill.style.width = '100%';

		defib.timers.charge = setTimeout(defib.charged, defib.CHARGE_MS);
	},

	charged: function() {
		defib.setState('ready');
		defib.status('CHARGED ' + defib.energy() + ' J · PRESS SHOCK');
		defibAudio.charged();
		defib.timers.warn = setTimeout(defib.warning, defib.READY_TO_WARNING_MS);
	},

	warning: function() {
		defib.setState('warning');
		defib.status('SHOCK OR CHARGE WILL BE REMOVED');
		defibAudio.warning();
		defib.timers.disarm = setTimeout(function() {
			defib.disarm('CHARGE REMOVED');
		}, defib.WARNING_TO_DISARM_MS);
	},

	// Internal discharge: the energy goes into the defibrillator's own load,
	// not the patient. Not logged - no shock was delivered.
	disarm: function(text) {
		defib.clearTimers();
		defibAudio.disarm();
		defib.setState('idle');
		defib.message(text || 'CHARGE REMOVED', 'msg-alert');
	},

	shock: function() {
		if (!defib.isCharged()) { return; }
		var joules = defib.energy();

		defib.clearTimers();
		defibAudio.shock();
		defib.shocks++;
		defib.setState('idle');
		defib.message('SHOCK DELIVERED ' + joules + ' J', 'msg-done');

		// Show the shock on this ECG straight away rather than waiting for the
		// next status poll to report it.
		defib.showShockArtifact();

		// One request, two commands, processed in order: the aed event (logged,
		// fires scene triggers, draws the artifact on every ECG) and the energy.
		defib.send({
			'set:event:event_id': 'aed',
			'set:event:comment': 'Defibrillation ' + joules + ' J'
		});
	},

	clearTimers: function() {
		for (var k in defib.timers) { clearTimeout(defib.timers[k]); }
		defib.timers = {};
		var fill = document.getElementById('charge-fill');
		fill.style.transition = 'none';
		fill.style.width = '0%';
	},

	// =========================================================================
	// Screen
	// =========================================================================
	setState: function(s) {
		defib.state = s;
		defib.render();
	},

	render: function() {
		var dev = document.getElementById('device');
		dev.setAttribute('data-state', defib.state);
		document.getElementById('energy').textContent = defib.energy();
		document.getElementById('shocks').textContent = defib.shocks;

		var on = defib.isOn() && defib.state !== 'boot';
		defib.enable('btn-energy-up', on);
		defib.enable('btn-energy-down', on);
		defib.enable('btn-charge', on && defib.state === 'idle');
		defib.enable('btn-shock', defib.isCharged());
		defib.tickElapsed();
	},

	enable: function(id, on) {
		document.getElementById(id).setAttribute('aria-disabled', on ? 'false' : 'true');
	},

	// A status line that stays until the state changes.
	status: function(text, cls) {
		clearTimeout(defib.messageTimer);
		var st = document.getElementById('status');
		st.classList.remove('msg-done', 'msg-alert');
		if (cls) { st.classList.add(cls); }
		document.getElementById('status-text').textContent = text;
	},

	// A one-off message that reverts to the idle prompt.
	message: function(text, cls) {
		defib.status(text, cls);
		defib.messageTimer = setTimeout(function() {
			if (defib.state === 'idle') { defib.status('SELECT ENERGY · PRESS CHARGE'); }
		}, defib.MESSAGE_MS);
	},

	tickElapsed: function() {
		var el = document.getElementById('elapsed');
		if (!defib.isOn()) { el.textContent = '00:00'; return; }
		var s = Math.floor((Date.now() - defib.poweredAt) / 1000);
		var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
		var pad = function(n) { return (n < 10 ? '0' : '') + n; };
		el.textContent = (h > 0 ? h + ':' : '') + pad(m) + ':' + pad(sec);
	},

	showShockArtifact: function() {
		// mirrors the defibrillation block of simmgr.getStatus()
		controls.defib.shock = 1;
		controls.defib.last = defib.engineDefibLast + 1;	// what the simulator will report
		chart.ekg.length = chart.ekg.rhythm['defib'].length;
		chart.ekg.patternIndex = 0;
		chart.ekg.rhythmIndex = 'defib';
		defib.localShockUntil = Date.now() + 2300;		// the simulator holds it for 2 s
	},

	// =========================================================================
	// Simulator link
	// =========================================================================
	send: function(params) {
		var qs = new URLSearchParams(params).toString();
		return fetch('/simstatus.cgi?' + qs, { cache: 'no-store' }).catch(function() {
			defib.setLink(false);
		});
	},

	poll: function() {
		fetch('/simstatus.cgi?status=1', { cache: 'no-store' })
			.then(function(r) { return r.json(); })
			.then(function(response) {
				defib.pollFailures = 0;
				defib.setLink(true);
				defib.applyStatus(response);
			})
			.catch(function() {
				defib.pollFailures++;
				if (defib.pollFailures >= 3) { defib.setLink(false); }
			})
			.then(function() {
				setTimeout(defib.poll, defib.POLL_MS);
			});
	},

	setLink: function(ok) {
		var el = document.getElementById('link');
		el.classList.toggle('down', !ok);
		document.getElementById('link-label').textContent = ok ? 'SIM LINK' : 'NO SIM LINK';
	},

	// Apply the simulator status to the waveform code.
	//
	// Each block below mirrors the matching block of simmgr.getStatus() /
	// getQuickStatus() in sim-ii/js/simmgr.js, minus the instructor-only DOM
	// work and minus anything that would send a command - the defibrillator is
	// a display, it never changes a vital sign. If one of those blocks changes,
	// change it here too.
	applyStatus: function(response) {
		var c = response.cardiac || {};
		var cpr = response.cpr || {};
		var dfb = response.defibrillation || {};
		var sc = response.scenario || {};

		// ---- scenario state: a paused scenario freezes the trace
		if (typeof sc.state === 'string') {
			var st = sc.state.toUpperCase();
			scenario.currentScenarioState =
				(st === 'PAUSED')  ? scenario.scenarioState.PAUSED :
				(st === 'RUNNING') ? scenario.scenarioState.RUNNING :
				(st === 'TERMINATE' || st === 'TERMINATED') ? scenario.scenarioState.TERMINATED :
				scenario.scenarioState.STOPPED;
		}

		// ---- cardiac rate
		if (typeof c.rate !== 'undefined' && c.rate != controls.heartRate.value && controls.cpr.inProgress == false) {
			simmgr.cardiacResponse = c;
			chart.ekg.periodCount = Math.round(((60 / c.rate) * 1000) / chart.ekg.drawInterval);
			if (controls.heartRate.value == 0) {
				chart.updateCardiacRate();
			}
		} else {
			chart.ekg.periodCount = 0;
		}

		// ---- averaged rate, which is what the HR readout shows
		if (typeof c.avg_rate !== 'undefined' && c.avg_rate != controls.heartRate.avg_rate) {
			controls.heartRate.avg_rate = c.avg_rate;
			controls.heartRate.displayValue();
		}

		// ---- ECG leads: the defibrillator shows the ECG only while they are on
		if (typeof c.ecg_indicator !== 'undefined') {
			var changed = false;
			if (c.ecg_indicator == 1) {
				if (controls.ekg.leadsConnected == false) {
					changed = true;
					chart.initStrip('ekg');
				}
				controls.ekg.leadsConnected = true;
			} else {
				if (controls.ekg.leadsConnected == true) {
					changed = true;
					chart.initStrip('ekg');
					chart.ekg.ctx.clearRect(0, 0, chart.ekg.width + 10, chart.ekg.height);
				}
				controls.ekg.leadsConnected = false;
			}
			if (changed) {
				controls.heartRate.displayValue();
			}
			document.getElementById('device').classList.toggle('no-ecg', !controls.ekg.leadsConnected);
		}

		// ---- rhythm
		if (typeof c.rhythm !== 'undefined' && controls.heartRhythm.currentRhythm != c.rhythm) {
			controls.heartRhythm.currentRhythm = c.rhythm;
			// Unconditional, as on the monitor: a rhythm that changes because a
			// shock converted it replaces the shock artifact immediately, so the
			// defibrillator and the monitor show the conversion at the same point.
			chart.ekg.rhythmIndex = c.rhythm;
			chart.updateCardiac(c);
			controls.heartRate.displayValue();

			if (c.rhythm == 'vtach3') {
				controls.heartRate.minValue = controls.heartRate.rOnTMinValue;
			} else {
				controls.heartRate.minValue = controls.heartRate.normalMinValue;
			}

			if (c.rhythm == 'afib') {
				chart.afib.delay = [];
				for (var i = 0; i <= chart.afib.delayCount; i++) {
					chart.afib.delay[i] = parseFloat((0.8 + Math.random() * 0.4).toFixed(2));
				}
			} else if (c.rhythm == 'vtach3') {
				chart.initVtach3();
				chart.updateCardiac(c);
			}
		}

		// ---- PEA / arrest
		if (typeof c.pea !== 'undefined') {
			controls.heartRhythm.pea = (c.pea == 1);
		}
		if (typeof c.arrest !== 'undefined') {
			controls.heartRhythm.arrest = (c.arrest == 1);
		}

		// ---- VPCs
		if (typeof c.vpc !== 'undefined' && c.vpc != controls.heartRhythm.vpcResponse) {
			controls.heartRhythm.vpcResponse = c.vpc;
			if (c.vpc != 'none') {
				var parts = c.vpc.split('-');
				controls.heartRhythm.vpcCount = parts[1];		// remote display
				controls.heartRhythm.vpc = (parts[0] == 1) ? 'vpc1' : 'vpc2';
				chart.updateCardiac(c);
			} else {
				controls.heartRhythm.vpcCount = 0;
			}
		}

		// ---- ventricular fibrillation amplitude
		if (typeof c.vfib_amplitude !== 'undefined') {
			controls.heartRhythm.vfibAmplitude = c.vfib_amplitude;
			switch (c.vfib_amplitude) {
				case 'low':    chart.fibDivide = 4;   break;
				case 'med':
				case 'medium': chart.fibDivide = 2.5; break;
				default:       chart.fibDivide = 1;   break;
			}
		}

		// ---- VPC frequency
		if (typeof c.vpc_freq !== 'undefined' && controls.heartRhythm.vpcFrequency != c.vpc_freq) {
			controls.heartRhythm.vpcFrequency = c.vpc_freq;
			controls.heartRhythm.calculateVPCFreq();
		}

		// ---- CPR: compressions replace the ECG with compression artifact
		if (typeof cpr.compression !== 'undefined' && cpr.compression != controls.cpr.inProgress) {
			if (cpr.compression == 0) {
				controls.cpr.inProgress = false;
				if (typeof c.rate !== 'undefined') {
					controls.heartRate.setHeartRateValue(c.rate);
					if (c.rhythm == 'vtach3') { chart.initVtach3(); }
				}
				controls.heartRate.updateCPRDisplay();
			} else {
				controls.cpr.inProgress = true;
				controls.heartRate.updateCPRDisplay();
				controls.heartRate.blankHR();
			}
			chart.updateCardiac(c);
		}
		if (typeof cpr.running !== 'undefined' && cpr.running != controls.cpr.running) {
			controls.cpr.running = cpr.running;
		}

		// ---- defibrillation: a shock from anywhere draws the artifact here too
		if (typeof dfb.last !== 'undefined') {
			defib.engineDefibLast = parseInt(dfb.last, 10) || 0;
		}
		if (typeof dfb.shock !== 'undefined' && dfb.last != controls.defib.last) {
			if (dfb.last == 0) {
				controls.defib.last = 0;
			} else {
				controls.defib.shock = dfb.shock;
				if (controls.defib.shock == 1) {
					controls.defib.last = dfb.last;
					chart.ekg.length = chart.ekg.rhythm['defib'].length;
					chart.ekg.patternIndex = 0;
					chart.ekg.rhythmIndex = 'defib';
				}
			}
		}
		// ...and the artifact ends when the simulator's 2 s shock window closes.
		//
		// Keyed on the shock flag, not on the artifact still being on screen: a
		// shock that converts the rhythm changes it inside that window, and a flag
		// left set stalls drawEkgPixel on a flat line for good. Same fix as the
		// quick-status block in simmgr.js.
		if (typeof dfb.shock !== 'undefined' && controls.defib.shock == 1 &&
				dfb.shock == 0 && Date.now() > defib.localShockUntil) {
			controls.defib.shock = 0;
			if (chart.ekg.rhythmIndex == 'defib') {
				chart.ekg.rhythmIndex = controls.heartRhythm.currentRhythm || 'asystole';
				chart.updateEkgWaveform(chart.ekg.rhythmIndex, chart.heartRate);
			}
		}
	},

	// =========================================================================
	// Keep the screen on while the defibrillator is on
	//
	// Browsers only offer the Wake Lock API to secure (https or localhost)
	// pages, and the simulator serves plain http, so on the tablet this is
	// normally a no-op: set the tablet's Auto-Lock to Never instead. It is kept
	// because it costs nothing and works if the page is ever served securely.
	// =========================================================================
	requestWakeLock: function() {
		if (!('wakeLock' in navigator)) { return; }
		navigator.wakeLock.request('screen').then(function(lock) {
			defib.wakeLock = lock;
		}).catch(function() {});
	},

	releaseWakeLock: function() {
		if (defib.wakeLock) {
			defib.wakeLock.release().catch(function() {});
			defib.wakeLock = null;
		}
	}
};

document.addEventListener('DOMContentLoaded', defib.init);
