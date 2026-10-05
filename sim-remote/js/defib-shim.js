/*
 * defib-shim.js - the environment sim-ii's waveform code expects.
 *
 * The defibrillator draws its ECG with the patient monitor's own chart.js and
 * controls.js, served by the simulator from sim-ii/js/. Those files were
 * written for the PHP instructor and vitals pages, which define a handful of
 * globals and load jQuery first. This file provides just enough of that
 * environment for the ECG path to run unmodified, so the defibrillator can
 * never drift from the monitor: same rhythms, same VPC logic, same artifacts.
 *
 * It must load before controls.js and chart.js.
 */

// ---- constants the PHP pages normally inject (sim-ii/includes/phpDefinesToJs.php)
var BROWSER_IMAGES = '';
var BROWSER_CGI = '/';
var ETCO2_NEW_WAVEFORM_COMPLETED = 3;
var ETCO2_NEW_VALUE_ENTERED = 2;
var ETCO2_NEW_WAVEFORM_IN_PROGRESS = 1;
var ETCO2_OK = 0;

// ---- a minimal jQuery
// controls.js updates its readouts through jQuery - for example
// controls.heartRate.displayValue() writes into '#vs-heartRhythm a.display-rate',
// which the defibrillator screen deliberately carries so the heart rate is
// shown by the monitor's own code. Only the calls those code paths make are
// implemented. Anything that matches no element is a harmless no-op, which is
// exactly how jQuery behaves when the instructor-only elements are absent.
(function() {
	function Wrap(nodes) {
		this.nodes = nodes;
		this.length = nodes.length;
	}
	Wrap.prototype = {
		each: function(fn) {
			for (var i = 0; i < this.nodes.length; i++) { fn.call(this.nodes[i], i, this.nodes[i]); }
			return this;
		},
		html: function(v) {
			if (v === undefined) { return this.nodes[0] ? this.nodes[0].innerHTML : undefined; }
			return this.each(function() { this.innerHTML = String(v); });
		},
		text: function(v) {
			if (v === undefined) { return this.nodes[0] ? this.nodes[0].textContent : undefined; }
			return this.each(function() { this.textContent = String(v); });
		},
		css: function(k, v) {
			if (typeof k === 'string' && v === undefined) {
				return this.nodes[0] ? getComputedStyle(this.nodes[0])[k] : undefined;
			}
			var obj = (typeof k === 'string') ? { [k]: v } : (k || {});
			return this.each(function() {
				for (var p in obj) { this.style[p] = (typeof obj[p] === 'number') ? obj[p] + 'px' : obj[p]; }
			});
		},
		attr: function(k, v) {
			if (v === undefined) { return this.nodes[0] ? this.nodes[0].getAttribute(k) : undefined; }
			return this.each(function() { this.setAttribute(k, v); });
		},
		prop: function(k, v) {
			if (v === undefined) { return this.nodes[0] ? this.nodes[0][k] : undefined; }
			return this.each(function() { this[k] = v; });
		},
		show: function() { return this.each(function() { this.style.display = ''; }); },
		hide: function() { return this.each(function() { this.style.display = 'none'; }); },
		addClass: function(c) { return this.each(function() { this.classList.add.apply(this.classList, c.split(/\s+/).filter(Boolean)); }); },
		removeClass: function(c) { return this.each(function() { this.classList.remove.apply(this.classList, c.split(/\s+/).filter(Boolean)); }); },
		val: function(v) {
			if (v === undefined) { return this.nodes[0] ? this.nodes[0].value : undefined; }
			return this.each(function() { this.value = v; });
		},
		width: function() { return this.nodes[0] ? (this.nodes[0].width || this.nodes[0].clientWidth) : 0; },
		click: function(fn) { return fn ? this.each(function() { this.addEventListener('click', fn); }) : this; },
		slider: function() { return this; }
	};

	window.$ = window.jQuery = function(sel) {
		if (sel && sel.nodeType) { return new Wrap([sel]); }
		if (typeof sel !== 'string') { return new Wrap([]); }
		var nodes;
		try { nodes = Array.prototype.slice.call(document.querySelectorAll(sel)); }
		catch (e) { nodes = []; }
		return new Wrap(nodes);
	};
	// the defibrillator never uses jQuery's ajax - status comes from defib.js
	window.$.ajax = function() {};
	window.$.each = function(obj, fn) {
		for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) { fn.call(obj[k], k, obj[k]); } }
	};
})();

// ---- page objects the waveform code consults
//
// The defibrillator behaves as a student-facing display: the ECG is drawn only
// while the ECG leads are connected (cardiac:ecg_indicator), the heart rate
// blanks with the monitor's own rules, and a paused scenario freezes the trace.
var profile = {
	isVitalsMonitor: true,
	init: function() {}
};

// Values match sim-ii/js/scenario.js. Only PAUSED is ever compared.
var scenario = {
	scenarioState: { STOPPED: 0, PAUSED: 1, RUNNING: 2, TERMINATED: 3 },
	currentScenarioState: 0
};

// The tablet is never the local display, so beats come from the beat timer in
// controls.heartRate.setSynch - the same path a remote student monitor uses -
// rather than from the 40 ms pulse counter, whose timing jitter over Wi-Fi
// would make a regular rhythm look irregular.
var simmgr = {
	cardiacResponse: {},
	respResponse: {},
	isLocalDisplay: function() { return false; },
	isTeleSim: function() { return false; },
	sendChange: function() {}		// the defibrillator never changes vitals
};
