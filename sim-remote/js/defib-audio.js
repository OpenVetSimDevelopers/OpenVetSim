/*
 * defib-audio.js - defibrillator sounds, synthesised in the browser.
 *
 * Everything is generated with the Web Audio API rather than played from audio
 * files. The simulator's built-in file server has no audio MIME types, and a
 * synthesised tone can be shaped to the exact length of the charge cycle.
 *
 * Tablets block all sound until the user touches the page. unlock() must be
 * called from inside a touch or click handler - the defibrillator does it from
 * the Power button, which is always the first thing pressed.
 */
var defibAudio = {
	ctx: null,
	master: null,
	loop: null,			// the one sound that repeats (charging, ready, warning)
	silentEl: null,		// keeps older iPads audible with the ring/silent switch on
	volume: 0.9,

	// ---- unlock -------------------------------------------------------------
	unlock: function() {
		var A = window.AudioContext || window.webkitAudioContext;
		if (!A) { return; }
		if (!defibAudio.ctx) {
			defibAudio.ctx = new A();
			defibAudio.master = defibAudio.ctx.createGain();
			defibAudio.master.gain.value = defibAudio.volume;
			// a gentle limiter so overlapping sounds never clip on a small speaker
			var comp = defibAudio.ctx.createDynamicsCompressor();
			comp.threshold.value = -6;
			comp.knee.value = 6;		// the 30 dB default knee squashes everything
			comp.ratio.value = 6;
			defibAudio.master.connect(comp);
			comp.connect(defibAudio.ctx.destination);
		}

		// iPadOS 17+: treat this as media playback, which ignores the silent switch
		try {
			if (navigator.audioSession) { navigator.audioSession.type = 'playback'; }
		} catch (e) {}

		// Older iPadOS: Web Audio follows the silent switch, but a playing media
		// element moves the page into the playback category. A short silent WAV,
		// generated here so no file is needed, does that.
		if (!navigator.audioSession && !defibAudio.silentEl) {
			try {
				defibAudio.silentEl = new Audio(defibAudio.silentWav());
				defibAudio.silentEl.loop = true;
				defibAudio.silentEl.setAttribute('playsinline', '');
				defibAudio.silentEl.play().catch(function() {});
			} catch (e) {}
		}

		if (defibAudio.ctx.state === 'suspended') {
			defibAudio.ctx.resume();
		}
		// a one-sample buffer, played inside the gesture, finishes the unlock on
		// older WebKit
		var b = defibAudio.ctx.createBuffer(1, 1, 22050);
		var s = defibAudio.ctx.createBufferSource();
		s.buffer = b;
		s.connect(defibAudio.ctx.destination);
		s.start(0);
	},

	silentWav: function() {
		// 8 kHz, 8-bit mono, 0.1 s of silence
		var n = 800, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
		var w = function(o, str) { for (var i = 0; i < str.length; i++) { buf[o + i] = str.charCodeAt(i); } };
		w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE');
		w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
		dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
		w(36, 'data'); dv.setUint32(40, n, true);
		for (var i = 0; i < n; i++) { buf[44 + i] = 128; }
		var bin = '';
		for (var j = 0; j < buf.length; j++) { bin += String.fromCharCode(buf[j]); }
		return 'data:audio/wav;base64,' + btoa(bin);
	},

	ready: function() {
		return !!(defibAudio.ctx && defibAudio.ctx.state === 'running');
	},

	// ---- building blocks ----------------------------------------------------

	// A bus for one sound, so it can be faded out and stopped as a unit.
	bus: function(level) {
		var g = defibAudio.ctx.createGain();
		g.gain.value = level;
		g.connect(defibAudio.master);
		return g;
	},

	tone: function(dest, type, freq, t0, dur, level, attack, release) {
		var c = defibAudio.ctx;
		var o = c.createOscillator();
		var g = c.createGain();
		attack = attack || 0.006;
		release = release || 0.02;
		o.type = type;
		o.frequency.setValueAtTime(freq, t0);
		g.gain.setValueAtTime(0, t0);
		g.gain.linearRampToValueAtTime(level, t0 + attack);
		g.gain.setValueAtTime(level, t0 + Math.max(attack, dur - release));
		g.gain.linearRampToValueAtTime(0, t0 + dur);
		o.connect(g);
		g.connect(dest);
		o.start(t0);
		o.stop(t0 + dur + 0.02);
		return o;
	},

	stopLoop: function() {
		var L = defibAudio.loop;
		defibAudio.loop = null;
		if (!L) { return; }
		clearInterval(L.timer);
		var c = defibAudio.ctx;
		try {
			L.bus.gain.cancelScheduledValues(c.currentTime);
			L.bus.gain.setValueAtTime(L.bus.gain.value, c.currentTime);
			L.bus.gain.linearRampToValueAtTime(0, c.currentTime + 0.04);
		} catch (e) {}
		(L.nodes || []).forEach(function(n) { try { n.stop(c.currentTime + 0.06); } catch (e) {} });
		setTimeout(function() { try { L.bus.disconnect(); } catch (e) {} }, 200);
	},

	// Repeat a short pattern of notes until stopped, scheduling a second ahead
	// on the audio clock so the rhythm stays exact even if the page is busy.
	pattern: function(notes, level) {
		defibAudio.stopLoop();
		var c = defibAudio.ctx;
		var bus = defibAudio.bus(level);
		var period = notes.reduce(function(a, n) { return a + n.dur + (n.gap || 0); }, 0);
		var next = c.currentTime + 0.03;
		var L = { bus: bus, nodes: [], timer: 0 };
		var fill = function() {
			while (next < c.currentTime + 1.0) {
				var t = next;
				notes.forEach(function(n) {
					if (n.freq) {
						defibAudio.tone(bus, n.type || 'square', n.freq, t, n.dur, n.level || 1, 0.004, 0.012);
					}
					t += n.dur + (n.gap || 0);
				});
				next += period;
			}
		};
		fill();
		L.timer = setInterval(fill, 250);
		defibAudio.loop = L;
	},

	// ---- the sounds ---------------------------------------------------------

	// Power-on: a short rising two-note chirp.
	boot: function() {
		if (!defibAudio.ready()) { return; }
		var c = defibAudio.ctx, t = c.currentTime + 0.02, b = defibAudio.bus(0.40);
		defibAudio.tone(b, 'square', 880, t, 0.09, 1);
		defibAudio.tone(b, 'square', 1320, t + 0.11, 0.12, 1);
	},

	// Key press feedback.
	key: function() {
		if (!defibAudio.ready()) { return; }
		var c = defibAudio.ctx;
		defibAudio.tone(defibAudio.bus(0.16), 'square', 2200, c.currentTime + 0.005, 0.03, 1, 0.002, 0.01);
	},

	// Charging: the rising whine of the capacitor charging circuit, sweeping up
	// for the whole charge time, with a fast flutter so it reads as electronic
	// rather than musical.
	charging: function(ms) {
		if (!defibAudio.ready()) { return; }
		defibAudio.stopLoop();
		var c = defibAudio.ctx, t = c.currentTime + 0.02, end = t + ms / 1000;
		var bus = defibAudio.bus(0);
		bus.gain.linearRampToValueAtTime(0.34, t + 0.08);

		var o1 = c.createOscillator();
		o1.type = 'triangle';
		o1.frequency.setValueAtTime(420, t);
		o1.frequency.exponentialRampToValueAtTime(1900, end);

		var o2 = c.createOscillator();		// faint upper partial
		o2.type = 'sine';
		o2.frequency.setValueAtTime(840, t);
		o2.frequency.exponentialRampToValueAtTime(3800, end);
		var g2 = c.createGain(); g2.gain.value = 0.25;

		var lfo = c.createOscillator();		// flutter
		lfo.frequency.value = 9;
		var lfoDepth = c.createGain(); lfoDepth.gain.value = 0.35;
		var flutter = c.createGain(); flutter.gain.value = 0.65;
		lfo.connect(lfoDepth); lfoDepth.connect(flutter.gain);

		o1.connect(flutter);
		o2.connect(g2); g2.connect(flutter);
		flutter.connect(bus);

		[o1, o2, lfo].forEach(function(o) { o.start(t); o.stop(end + 0.05); });
		defibAudio.loop = { bus: bus, nodes: [o1, o2, lfo], timer: 0 };
	},

	// Charged: a steady repeating tone, meaning "ready to shock".
	charged: function() {
		if (!defibAudio.ready()) { return; }
		defibAudio.pattern([{ freq: 1047, dur: 0.42, gap: 0.10 }], 0.30);
	},

	// Warning: a faster two-tone alternation - the charge is about to be removed.
	warning: function() {
		if (!defibAudio.ready()) { return; }
		defibAudio.pattern([
			{ freq: 1480, dur: 0.14, gap: 0.03 },
			{ freq: 988,  dur: 0.14, gap: 0.03 }
		], 0.34);
	},

	// Internal discharge: the charge is dumped into the internal load.
	disarm: function() {
		defibAudio.stopLoop();
		if (!defibAudio.ready()) { return; }
		var c = defibAudio.ctx, t = c.currentTime + 0.02;
		var bus = defibAudio.bus(0.40);
		var o = c.createOscillator();
		var g = c.createGain();
		o.type = 'triangle';
		o.frequency.setValueAtTime(1100, t);
		o.frequency.exponentialRampToValueAtTime(140, t + 0.55);
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(1, t + 0.01);
		g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
		o.connect(g); g.connect(bus);
		o.start(t); o.stop(t + 0.65);
		defibAudio.click(bus, t + 0.58, 0.5);
	},

	// Shock: relay clunk, the crack of the discharge and a low thump.
	shock: function() {
		defibAudio.stopLoop();
		if (!defibAudio.ready()) { return; }
		var c = defibAudio.ctx, t = c.currentTime + 0.01;
		var bus = defibAudio.bus(0.95);

		defibAudio.click(bus, t, 1);

		// crack: a burst of filtered noise
		var len = Math.floor(c.sampleRate * 0.18);
		var buf = c.createBuffer(1, len, c.sampleRate);
		var d = buf.getChannelData(0);
		for (var i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
		var n = c.createBufferSource(); n.buffer = buf;
		var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
		var ng = c.createGain(); ng.gain.value = 2.2;	// the band-pass loses most of the energy
		n.connect(bp); bp.connect(ng); ng.connect(bus);
		n.start(t + 0.012);

		// thump - pitched higher than a real one would be, because a tablet
		// speaker reproduces almost nothing below about 150 Hz
		var o = c.createOscillator();
		var g = c.createGain();
		o.type = 'triangle';
		o.frequency.setValueAtTime(190, t);
		o.frequency.exponentialRampToValueAtTime(60, t + 0.25);
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(1, t + 0.008);
		g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
		o.connect(g); g.connect(bus);
		o.start(t); o.stop(t + 0.35);
	},

	click: function(dest, t, level) {
		var c = defibAudio.ctx;
		var len = Math.floor(c.sampleRate * 0.012);
		var buf = c.createBuffer(1, len, c.sampleRate);
		var d = buf.getChannelData(0);
		for (var i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / len); }
		var s = c.createBufferSource(); s.buffer = buf;
		var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
		var g = c.createGain(); g.gain.value = level;
		s.connect(hp); hp.connect(g); g.connect(dest);
		s.start(t);
	},

	silence: function() {
		defibAudio.stopLoop();
	}
};
