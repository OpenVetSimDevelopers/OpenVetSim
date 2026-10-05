/*
sim-ii: Copyright (C) 2019  VetSim, Cornell University College of Veterinary Medicine Ithaca, NY

See gpl.html
*/

	// routine to get max of an array
	Array.prototype.max = function () {
		return Math.max.apply(Math, this);
	};
	
	var chart = {
		status: {
			cardiac: {
				heartRate: 0,
				synch: false,
				vpcSynch: false,
			},
			
			resp: {
				synch: false,
				manual: false
			}
		},
		
		displayETCO2: {
			max: 0
		},
		
		// baseline params for introducing sinusoid amplitude into generated waveform
		// params are fixed for no oscillations
		baselineP1: 0,
		baselineP2: 0,
		baselineUnit: 0.1,
		
		// fibrillation parameters
		fibP1: 0,
		fibP2: 0,
		fibP3: 0,
		
		// following params are fixed for high frequency filtering for vfib
		fibUnit1: 12,
		fibUnit2: 12,
		fibP1Constant: 4.3,
		fibP2Constant: 2.7,
		// ------------------
		
		fibP3ListIndex: 0,
//		fibP3List: [ 10, 9, 8, 9, 10, 11, 12, 13, 14,14,15,16,16,15,14,13,12,11, 10, 9, 8, 7, 6, 5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 11, 10, 11, 12, 9, 8, 9 ],
		fibP3List: [ 10, 9, 8, 9, 10, 11, 12, 13, 14,14,15,16,16,15,14,13,12,11],
		fibDivide: 6, // amplitude of ventricular bibrillation
						// 4 = fine
						// 3 - medium
						// 1 - coarse
		
		vfib: {
			base: 0
		},
		
		afib: {
			delay: new Array,
			delayCount: 100,
			delayPtr: 0
		},

		// cpr status constants
		// delay stop in msec
		CPR_DELAY_NONE: 0,			// no delay in progress for cpr display of HR '----' 
		CPR_DELAY_START: 1,			// start delay for cpr display of HR '----' 
		CPR_DELAY_STOP: 2,			// stop delay for cpr display of HR '----' 
		CPR_ACTIVE: 2,				// active cpr display of HR '----'
		CPR_DELAY_IN: 3000,			// delay start in msec
		CPR_DELAY_OUT: 3000,		// delay stop in msec
		cprDelayTimer: 0,			// timer for cpr delay
		
		MANUAL_RESP_IDLE: 0,		// no manual respiration
		MANUAL_RESP_START: 1,		// start of manual respiration cycle
		MANUAL_RESP_DISPLAY_ETCO2: 2,	// display etco2
		MANUAL_RESP_DISPLAY_START_INDEX: 35,	// manual breath index to start display	
		MANUAL_RESP_DISPLAY_END_COUNT: 300,	// duration of display count
		RESP_ETCO2_BLANK_DELAY: 15000,	// delay for blanking ETCO2 on vitals
		
		// ekg strip parameters
		ekg: {
			width: 0,				// width of strip in pixels
			height: 125,			// height of strip in pixles
			id: 'vs-trace-1',		// id of canvas for strip
			interval: 0,			// variable to hold interval instantiation
			color: 'green',			// color of trace (either hex or html color)
			rhythm: new Array,		// array of digitized rhythms
			rhythmRef: {},			// reference waveforms ([0] arrays) used for dynamic resampling
			activeWaveform: [],		// currently rendered waveform, resampled to fit current heart rate
			yOffset: 0,				// yOffset of trace
			yDisplayOffset: 5,		// display y offset
			baselineFraction: 0.68,	// The complex deflects mostly upward, so centring the
									// baseline leaves the lower half of the strip empty.
									// Sitting it lower centres the trace in the strip without
									// touching any waveform amplitude.
			xOffsetLeft: 24,		// left xOffset of trace - matches the resp strip so the
									// two traces start at the same x (the resp strip needs
									// the margin for the ETCO2 scale labels)
			xOffsetRight: 0,		// right xOffset of trace
			rhythmIndex: '',		// index of current rhythm being displayed
			rateIndex: 0,			// index of pattern for current heart rate
			length: 0,				// variable to hold length of pattern
			patternIndex: 0,		// index of currently displayed pixel in pattern
			lastY: 0,				// variable to save last displayed Y coordinate of pattern
			xPos: 0,				// current x position on strip
			drawInterval: 15,		// interval in milli-sec to display pixels
			noiseMax: 2,			// max amplitude of background noise total +/-
			stopFlag: false,			// stop flag 
			beepValue: 0,			// value to beep at
			beepFlag: false,
			pixelCount: 0,			// count in pixel ticks (drawInterval) of current period (incrementing)
			periodCount: 0,			// number of pixel counts in current period
			cprHRDisplayStatus: 0, 	// status of hr display {CPR_DELAY_NONE || CPR_DELAY_START || CPR_DELAY_STOP || CPR_ACTIVE}
			cprwaveformIndex: 0,    // index of the current cpr artifact waveform
			
			// vpc params
			vpcRateIndex: 0,		// index for VPC pattern for current heart rate
			vpcLength: 0,			// length of current vpc pattern
			vpcPatternIndex: 0,		// index of currently displayed pixel in vpc pattern
			vpcCount: 0,			// count of how many vpc's have been generated
			vpcSynchDelayCount: 0,		
									// count of delay added in to synch if VPC is generated
			vpcSynchDelay: 0,		// calculated delay
			vpcAdvanceDelay: 700,	// advance delay of vpc pulse * 1000. (i.e. 700 = 70% of heart rate to advance pulse or 1.4X of base HR).
		},
		
		// respiration strip parameters
		resp: {
			width: 0,				// width of strip in pixels
			height: 125,			// height of strip in pixles
			id: 'vs-trace-2',		// id of canvas for strip
			interval: 0,			// variable to hold interval instantiation
			color: 'white',			// color of trace (either hex or html color)
			rhythm: new Array,		// array of digitized rhythms
			yOffset: 0,				// yOffset of trace
			yDisplayOffset: 5,		// display y offset
			baselineFraction: 0.73,	// A capnogram only rises from zero. With the zero
									// line here and ETCO2_FULL_SCALE_PX below, a normal
									// 35-40 mmHg trace is centred on the strip's midline,
									// level with its readout, and the 50 mmHg gridline
									// and label still clear the top of the strip.
			etco2Scale: 50,			// full-scale mmHg currently shown (see etco2ScaleMax)
			xOffsetLeft: 24,		// left xOffset of trace - also the ETCO2 scale label gutter
			xOffsetRight: 0,		// right xOffset of trace
			rhythmIndex: 'low',		// index of current rhythm being displayed
			length: 10,				// variable to hold length of pattern
			patternIndex: 0,		// index of currently displayed pixel in pattern
			lastY: 0,				// variable to save last Y coordinate of pattern
			lastDisplayedY: 0,		// variable to save last displayed Y coordinate of pattern (with display offsets)
			lastETCO2: 0,			// last ETCO2 used for calculating ETCO2 Max...used for vitals display of ETCO2
			xPos: 0,				// current x position on strip
			drawInterval: 50,		// interval in milli-sec to display pixels
			activeCount: 0,			// Count of updates since sync
			halfCount: 100,			// Count to middle of period, for start of Exhale
			stopFlag: false,		// stop flag
			phaseTimer: 0,			// timer hold,
			ETCO2MaxDuration: 2000,	// max duration of ETCO2 high in msec
			inhalationDuration: 0,	// duration of inhalation in msec
			exhalationDuration: 0,	// duration of exhalation in msec
			patternComplete: false,	// flag for resp pattern complete
			inhalationPatternIndex: 0,	
									// pattern index for resp low to high.
			exhalationPatternIndex: 4,	
									// pattern index for resp high to low.
			pixelCount: 0,			// count in pixel ticks (drawInterval) of current period (incrementing)
			periodCount: 0,			// number of pixel counts in current period
			risePatternIndex: 4,		// index of pattern to use for rise and fall times based on breathing rate
			manualStatus: this.MANUAL_RESP_IDLE,
			manualBreathDisplayCount: 0,			// count of where we are in the display delay for ETCO2
			breathStart: false,		// flag to indicate if a new breating waveform is starting.
			blankTimer: 0,			// timer to blank vitals ETCO2
			rrBlankCount: 2,		// count of breath waveforms before displaying valid awRR
			currentetCO2value: 0,		// variable to hold ETCO2 value at the start of a breath waveform
			maxInhalationDuration: 0,	// max duration ofr inhalation
			scaleWasVisible: false		// ETCO2 scale visibility on the previous tick
		},

		// arterial (direct/invasive) blood pressure strip parameters
		abp: {
			width: 0,				// width of strip in pixels
			height: 125,			// height of strip in pixels (set by applyLayout)
			id: 'vs-trace-3',		// id of canvas for strip
			interval: 0,			// variable to hold interval instantiation
			color: '#ff4d4d',		// colour of trace
			waveform: {},			// normalised 0..1 morphology arrays, by type
			waveformRange: {},		// {min, max, mean} of each array - drives the numerics
			waveformDistorts: {},	// true where the morphology is a measurement artifact
			yOffset: 0,				// yOffset of trace
			yDisplayOffset: 5,		// display y offset
			baselineFraction: 0.90,	// 0 mmHg sits near the floor of the strip, so the
									// whole height carries pressure rather than half
			xOffsetLeft: 24,		// left xOffset of trace - also the scale label gutter
			xOffsetRight: 0,		// right xOffset of trace
			ampScale: 1,			// set by applyLayout
			xPos: 0,				// current x position on strip
			// Same draw interval as the ECG strip. Both advance one pixel per tick,
			// so a given moment sits at the same x on both traces and the pressure
			// upstroke visibly trails its own QRS by the transit delay - which is
			// what "synchronised with the ECG" has to mean on a swept display.
			drawInterval: 15,		// interval in msec to display pixels
			lastDisplayedY: 0,		// last displayed Y coordinate (with offsets)
			stopFlag: false,		// stop flag
			sampleCount: 120,		// resolution of the generated morphology arrays

			// pulse state
			pulseActive: false,		// a cardiac cycle is being drawn
			pulseIndex: 0,			// tick within the current cycle
			pulseLength: 0,			// ticks in the current cycle (the RR interval)
			pendingDelay: -1,		// ticks until the queued pulse starts (-1 = none)
			currentSys: 0,			// systolic captured at the start of this pulse
			currentDia: 0,			// diastolic captured at the start of this pulse
			lastNorm: 0,			// last normalised value, for the flatline decay
			scaleWasVisible: false	// scale visibility on the previous tick
		},

		// pulse oximetry plethysmograph strip parameters
		pleth: {
			width: 0,				// width of strip in pixels
			height: 125,			// height of strip in pixels (set by applyLayout)
			id: 'vs-trace-4',		// id of canvas for strip
			interval: 0,			// variable to hold interval instantiation
			color: '#ffe14d',		// colour of trace - matches the SpO2 readout
			waveform: {},			// normalised 0..1 morphology arrays, by type
			yOffset: 0,				// yOffset of trace
			yDisplayOffset: 5,		// display y offset
			baselineFraction: 0.74,	// The trace is entirely positive-going. With the
									// baseline here a normal pulse (PLETH_AMPLITUDE) is
									// centred on the strip's midline, level with its
									// readout, like the other channels.
			xOffsetLeft: 24,		// left xOffset - kept equal to the other strips so
									// all four traces start at the same x
			xOffsetRight: 0,
			ampScale: 1,			// set by applyLayout
			xPos: 0,
			drawInterval: 15,		// same time base as the ECG and arterial strips
			lastDisplayedY: 0,
			stopFlag: false,
			sampleCount: 120,		// resolution of the generated morphology arrays

			// pulse state, mirroring chart.abp
			pulseActive: false,
			pulseIndex: 0,
			pulseLength: 0,
			pendingDelay: -1,
			lastNorm: 0,
			noisePhase: 0,			// free-running phase for the artifact trace
			scaleWasVisible: false
		},

		// pulmonary artery catheter strip parameters
		//
		// Unlike the other pressure strip, this one is not always present: it exists
		// only while a catheter is in the patient (controls.pac.placed), and the
		// remaining channels re-divide the waveform area when it comes and goes.
		// See chart.setChannelEnabled.
		pac: {
			width: 0,				// width of strip in pixels
			height: 125,			// height of strip in pixels (set by applyLayout)
			id: 'vs-trace-5',		// id of canvas for strip
			interval: 0,			// variable to hold interval instantiation
			color: '#66d9ff',		// colour of trace - red and yellow are taken
			waveform: {},			// mmHg arrays by catheter position
			waveformKey: '',		// pressures the arrays were generated from
			yOffset: 0,				// yOffset of trace
			yDisplayOffset: 5,		// display y offset
			baselineFraction: 0.90,	// 0 mmHg near the floor, as on the arterial strip
			xOffsetLeft: 24,		// left xOffset - kept equal to the other strips
			xOffsetRight: 0,
			ampScale: 1,			// set by applyLayout
			xPos: 0,
			drawInterval: 15,		// same time base as the ECG and arterial strips
			lastDisplayedY: 0,
			stopFlag: false,
			sampleCount: 120,		// resolution of the generated morphology arrays

			// pulse state, mirroring chart.abp
			pulseActive: false,
			pulseIndex: 0,
			pulseLength: 0,
			pendingDelay: -1,
			currentWave: null,		// array captured at the start of this beat, so a
									// pressure change part way through a cycle cannot
									// distort the waveform in flight
			lastMmHg: 0,			// last value drawn, held between beats
			scaleWasVisible: false
		},

		// Pressure reaches a catheter tip inside the heart almost immediately - it is
		// in the chamber generating the pressure - so this is much shorter than the
		// arterial line's transit time to a peripheral artery.
		PAC_TRANSIT_MSEC: 60,

		// Pressure scale steps the PA catheter strip may auto-range through, in mmHg.
		// A right heart runs at a fraction of systemic pressure, so a fixed 160 mmHg
		// scale would squash every one of these traces into the bottom sixth of the
		// strip and the a/c/v waves would be invisible.
		PAC_SCALE_STEPS: [40, 60, 80, 100],

		// Pulse transit time to a peripheral probe. Longer than the arterial line's,
		// which is why the pleth upstroke visibly trails the pressure upstroke.
		PLETH_TRANSIT_MSEC: 240,

		// Capnograph display scale. The waveform code works in its own units - its
		// patterns peak at 62 px for 100 mmHg, the top of the instructor's ETCO2
		// range - which put a normal 35-45 mmHg in the bottom sixth of the strip.
		// The display now auto-ranges like a clinical capnograph: the smallest of
		// these full scales that holds the current value, drawn so that full scale
		// reaches ETCO2_FULL_SCALE_PX above zero at the reference strip height (the
		// same height the arterial pressure scale uses).
		ETCO2_SCALE_STEPS: [50, 75, 100],
		ETCO2_FULL_SCALE_PX: 88,

		// How much of the strip each morphology uses, as a fraction of the strip's
		// height. The plethysmograph has no calibrated units - a monitor draws it at
		// whatever gain it chooses - so amplitude here is a teaching signal rather
		// than a measurement: a poorly perfused patient gives a small, blunt trace.
		// Normal matches the ECG complex, about 55% of the strip; poor and artifact
		// keep their original proportions to it.
		PLETH_AMPLITUDE: { normal: 0.55, poor: 0.18, artifact: 0.23 },

		// Pulse transit time: the delay between the R wave and the arterial upstroke
		// reaching the transducer. Roughly 120-180 ms in a medium dog.
		ABP_TRANSIT_MSEC: 150,
		// Compression rate used for the CPR morphology, which runs free of the ECG.
		ABP_CPR_RATE: 110,

		// Reference scale drawn behind a waveform trace (the ETCO2 gridlines, the
		// ABP pressure scale). A strip's waveform is drawn so that a value of
		// scale.maxValue() produces fullScaleAmplitude pixels of deflection above
		// the zero line at the reference strip height, so a reference line lands at
		//     value * fullScaleAmplitude * ampScale / maxValue
		// pixels above zero. Both track the waveform automatically when the strip is
		// resized or the value range changes.
		//
		// A strip is drawn one pixel column at a time with a cursor clearing the
		// column ahead, so the scale cannot simply be painted once: drawStripScale()
		// repaints whatever part of it falls inside the cleared band on every tick.
		// The numeric labels live in the gutter left of xOffsetLeft, which the sweep
		// never clears, so they only need repainting when the strip wraps.
		//
		// Per-strip scale configuration lives on the channel entry (chart.channels).
		scaleStyle: {
			zeroColor: '#6a6a6a',	// solid 1px baseline (waveform itself is 2px)
			lineColor: '#4c4c4c',	// dotted 1px gridlines
			labelColor: '#8c8c8c',
			labelFont: '9px Verdana, sans-serif',
			labelPad: 3,			// gap between label and the start of the trace
									// (the gutter itself is the strip's xOffsetLeft)
			dashLength: 2,			// dotted gridline: 2px on ...
			dashPeriod: 6			// ... every 6px
		},

		cursorWidth: 10,			// width of cursor in pixels
		resizeTimer: 0,				// debounce handle for the window resize listener
		refitPending: false,		// a re-fit is already queued

		// ---------------------------------------------------------------------
		// Waveform channels
		//
		// Every waveform array in this file is authored in pixels for a strip of
		// REFERENCE_STRIP_HEIGHT. The layout manager divides a fixed waveform area
		// among the enabled channels, so the actual strip height varies with how
		// many are shown, and each strip carries an ampScale (height / reference)
		// that drawXxxPixel applies to the value before adding the y offsets.
		//
		// At the reference height ampScale is exactly 1, so a two-channel monitor
		// sized the traditional way renders bit-identically to before this existed.
		//
		// To add a waveform: append a channel here, give it a strip object (see
		// chart.ekg / chart.resp / chart.abp) and a draw function, and add the
		// canvas plus its readout div to the page. Nothing else needs to know how
		// many channels there are.
		// ---------------------------------------------------------------------
		REFERENCE_STRIP_HEIGHT: 125,	// height the waveform arrays are authored for

		// ---------------------------------------------------------------------
		// Design canvas
		//
		// The monitor is laid out once at a fixed 16:9 logical size and then
		// scaled to whatever space it is given: full screen on the student
		// display (which must not scroll), a fixed slot on the instructor page.
		// Every coordinate below is in design pixels; nothing in the layout
		// depends on the size of the window it ends up in.
		//
		// fitToFrame() applies the scale as a CSS transform on #vsm and gives
		// each canvas a backing store of designPixels * scale * devicePixelRatio,
		// with a matching ctx.setTransform, so the traces render at the display's
		// native resolution instead of being an upscaled bitmap. All drawing code
		// continues to work in design pixels and needs no knowledge of this.
		// ---------------------------------------------------------------------
		layout: {
			designWidth: 1280,		// 16:9 - the shape of the student display
			designHeight: 720,

			areaTop: 48,			// waveform area, below the title bar
			areaHeight: 552,		// total space shared by the enabled channels
			gap: 8,					// vertical gap between strips
			minStripHeight: 60,

			stripLeft: 0,			// traces
			stripWidth: 900,

			readoutLeft: 912,		// per-channel labels and numbers
			readoutWidth: 360,		// wide enough for two sub-columns (ETCO2 + awRR)

			bottomGap: 30,			// spacing between blocks in the numbers row

			bottomTop: 604,			// Temp / SpO2 / NIBP row
			bottomHeight: 112,

			scale: 1				// current fitted scale, set by fitToFrame()
		},

		// Scale the monitor to the space available and give every canvas a
		// device-resolution backing store. Called at init and on resize.
		fitToFrame: function() {
			var L = chart.layout;
			var vsm = document.getElementById('vsm');
			var frame = document.getElementById('vsm-frame');
			if( ! vsm || ! frame ) {
				return L.scale;
			}

			var s;
			if( frame.getAttribute('data-fit') == 'viewport' ) {
				// Student monitor: fit the window, letterboxed on black when it is
				// not 16:9. Works windowed as well as full screen - the scale is
				// simply whatever the current viewport allows.
				//
				// documentElement.clientWidth/Height is used in preference to
				// window.innerWidth/Height because it excludes any scrollbar and,
				// more importantly, is 0 rather than misleading when the page is
				// measured before it has been given a size.
				var vw = document.documentElement.clientWidth || window.innerWidth || 0;
				var vh = document.documentElement.clientHeight || window.innerHeight || 0;
				if( vw < 1 || vh < 1 ) {
					// The viewport has no size yet - happens when the page is laid
					// out before its container's bounds are applied. Keep the last
					// good scale and try again once the layout settles; scaling to a
					// degenerate value here would make the monitor vanish.
					chart.scheduleRefit();
					return L.scale;
				}
				s = Math.min( vw / L.designWidth, vh / L.designHeight );
			} else {
				// instructor interface: the slot sets the width, height follows
				s = frame.clientWidth / L.designWidth;
				if( ! ( s > 0 ) ) {
					chart.scheduleRefit();
					return L.scale;
				}
			}
			if( ! isFinite(s) || s <= 0 ) {
				s = 1;
			}
			L.scale = s;

			vsm.style.width = L.designWidth + 'px';
			vsm.style.height = L.designHeight + 'px';
			vsm.style.transformOrigin = 'top left';
			vsm.style.transform = 'scale(' + s + ')';

			// the frame holds the scaled footprint in normal flow
			var fw = Math.round( L.designWidth * s );
			var fh = Math.round( L.designHeight * s );
			frame.style.width = fw + 'px';
			frame.style.height = fh + 'px';

			// Centre the letterbox vertically. Done here rather than with flex so
			// that an oversized frame is clipped at the bottom, where it is
			// obvious, instead of being centred half off the top of the screen.
			if( frame.getAttribute('data-fit') == 'viewport' ) {
				var vh2 = document.documentElement.clientHeight || window.innerHeight || 0;
				var pad = Math.max( 0, Math.floor( ( vh2 - fh ) / 2 ) );
				frame.style.marginTop = pad + 'px';
			}

			return s;
		},

		// Ask for another fit shortly, for the case where the viewport could not be
		// measured yet. Coalesced so a burst of failed measurements costs one retry.
		scheduleRefit: function() {
			if( chart.refitPending ) {
				return;
			}
			chart.refitPending = true;
			setTimeout( function() {
				chart.refitPending = false;
				chart.handleResize();
			}, 120 );
		},

		// Backing-store multiplier: design pixels -> device pixels.
		renderScale: function() {
			var dpr = window.devicePixelRatio || 1;
			return chart.layout.scale * dpr;
		},

		// A channel's `visible` predicate is the same gate its trace colour uses:
		// always on for the instructor, sensor-dependent on the student monitor.
		channels: [
			{
				key: 'ekg', id: 'vs-trace-1', readout: 'vs-readout-ekg', enabled: true,
				visible: function() {
					return ( profile.isVitalsMonitor == false ) || ( controls.ekg.leadsConnected == true );
				},
				blank: function() { controls.heartRate.blankHR(); }
				// no reference scale on the ECG strip
			},
			{
				key: 'resp', id: 'vs-trace-2', readout: 'vs-readout-resp', enabled: true,
				visible: function() {
					return ( profile.isVitalsMonitor == false ) || ( controls.CO2.leadsConnected == true );
				},
				blank: function() { controls.etCO2.blankValue(); controls.awRR.blankValue(); },
				scale: {
					enabled: true,
					// px at full scale, at the reference height - kept in one place
					get fullScaleAmplitude() { return chart.ETCO2_FULL_SCALE_PX; },
					maxValue: function() { return chart.resp.etco2Scale; },
					// gridlines every 25 mmHg up to whichever full scale is showing
					lines: function() {
						var out = [];
						for( var v = 0; v <= chart.resp.etco2Scale; v += 25 ) {
							out.push( { value: v, label: true } );
						}
						return out;
					}
				}
			},
			{
				key: 'pleth', id: 'vs-trace-4', readout: 'vs-readout-pleth', enabled: true,
				visible: function() {
					return ( profile.isVitalsMonitor == false ) || ( controls.SpO2.leadsConnected == true );
				},
				blank: function() { controls.SpO2.blankValue(); }
				// no reference scale: the plethysmograph is unitless
			},
			{
				// Like the PA catheter, the arterial strip exists only while a line is
				// in: with no line there is nothing to transduce, and ECG, ETCO2 and
				// SpO2 are better off with the space. This applies to the instructor
				// display as well as the student monitor.
				// controls.abp.setLineConnected() calls chart.setChannelEnabled('abp', ...).
				key: 'abp', id: 'vs-trace-3', readout: 'vs-readout-abp', enabled: false,
				visible: function() {
					return ( controls.abp.lineConnected == true );
				},
				blank: function() { controls.abp.blankValue(); },
				scale: {
					enabled: true,
					fullScaleAmplitude: 100,	// px of deflection at maxValue, at reference height
					maxValue: function() { return controls.abp.scaleMax; },
					lines: [
						{ value: 0,   label: true },
						{ value: 50,  label: true },
						{ value: 100, label: true },
						{ value: 150, label: true }
					]
				}
			},
			{
				// The PA catheter strip is switched on and off at runtime rather than
				// hidden: a catheter that is not in the patient has no trace to show,
				// and the four remaining channels are better off with the space.
				// controls.pac.setPlaced() calls chart.setChannelEnabled('pac', ...).
				key: 'pac', id: 'vs-trace-5', readout: 'vs-readout-pac', enabled: false,
				visible: function() {
					return ( controls.pac.placed == true );
				},
				blank: function() { controls.pac.blankValue(); },
				scale: {
					enabled: true,
					fullScaleAmplitude: 100,	// px of deflection at maxValue, at reference height
					maxValue: function() { return chart.pacScaleMax(); },
					// The scale auto-ranges with the pressures, so the gridlines have
					// to be computed rather than listed: quarters of whatever full
					// scale pacScaleMax() picked.
					lines: function() {
						var mx = chart.pacScaleMax();
						var out = [];
						for( var i = 0; i <= 4; i++ ) {
							out.push( { value: Math.round( mx * i / 4 ), label: true } );
						}
						return out;
					}
				}
			}
		],

		// Look up a channel entry by strip key.
		channelFor: function(key) {
			for( var i = 0; i < chart.channels.length; i++ ) {
				if( chart.channels[i].key == key ) {
					return chart.channels[i];
				}
			}
			return null;
		},

		// Channels that are switched on AND actually present in this page's markup.
		// vitals.php and ii.php can therefore carry different sets of canvases.
		enabledChannels: function() {
			var out = [];
			for( var i = 0; i < chart.channels.length; i++ ) {
				var c = chart.channels[i];
				if( c.enabled && chart[c.key] && document.getElementById(c.id) ) {
					out.push(c);
				}
			}
			return out;
		},

		// Size and position every enabled strip and its paired readout block, in
		// design coordinates, and give each canvas a device-resolution backing
		// store. Must run before initStrip(), which derives yOffset from height.
		applyLayout: function() {
			var chans = chart.enabledChannels();
			if( chans.length == 0 ) {
				return;
			}
			var L = chart.layout;
			chart.fitToFrame();
			var render = chart.renderScale();

			// Hide anything belonging to a channel that is currently switched off,
			// so a disabled strip does not linger where it was last drawn. A
			// channel can be toggled at runtime - the PA catheter strip only
			// exists while a catheter is in - and the remaining channels then
			// re-divide the waveform area between them.
			for( var d = 0; d < chart.channels.length; d++ ) {
				var dc = chart.channels[d];
				var on = false;
				for( var k = 0; k < chans.length; k++ ) {
					if( chans[k].key == dc.key ) { on = true; break; }
				}
				var dEl = document.getElementById(dc.id);
				var dRo = document.getElementById(dc.readout);
				if( dEl ) { dEl.style.display = on ? '' : 'none'; }
				if( dRo ) { dRo.style.display = on ? '' : 'none'; }
			}

			var h = Math.floor( ( L.areaHeight - ( L.gap * ( chans.length - 1 ) ) ) / chans.length );
			if( h < L.minStripHeight ) {
				h = L.minStripHeight;
			}
			var top = L.areaTop;

			for( var i = 0; i < chans.length; i++ ) {
				var strip = chart[chans[i].key];
				var el = document.getElementById(chans[i].id);

				strip.height = h;
				strip.ampScale = h / chart.REFERENCE_STRIP_HEIGHT;

				// Layout size in design pixels ...
				el.style.position = 'absolute';
				el.style.left = L.stripLeft + 'px';
				el.style.top = top + 'px';
				el.style.width = L.stripWidth + 'px';
				el.style.height = h + 'px';

				// ... backing store in device pixels, with a matching context
				// transform so every draw call still works in design pixels.
				// Setting width/height resets the context, so the transform has
				// to be re-applied here rather than once at init.
				el.width = Math.max( 1, Math.round( L.stripWidth * render ) );
				el.height = Math.max( 1, Math.round( h * render ) );
				if( strip.ctx ) {
					strip.ctx.setTransform( render, 0, 0, render, 0, 0 );
				}

				var ro = document.getElementById(chans[i].readout);
				if( ro ) {
					ro.style.position = 'absolute';
					ro.style.left = '0px';
					ro.style.top = top + 'px';
					ro.style.width = L.readoutWidth + 'px';
					ro.style.height = h + 'px';
					// The readout type is expressed in the stylesheet as
					// calc(<size> * var(--vs-scale)), so the labels and values shrink
					// with the strip. At five channels this is about 0.8 and the whole
					// block still fits beside its own trace.
					ro.style.setProperty('--vs-scale', String( Math.round( strip.ampScale * 1000 ) / 1000 ));
				}

				top += h + L.gap;
			}

			var leftCol = document.getElementById('vs-left-col');
			if( leftCol ) {
				leftCol.style.position = 'absolute';
				leftCol.style.left = '0px';
				leftCol.style.top = '0px';
				leftCol.style.width = L.stripWidth + 'px';
				leftCol.style.height = ( L.areaTop + L.areaHeight ) + 'px';
			}
			// Only as wide as the readouts. It used to span the whole design canvas,
			// which put a transparent block on top of every trace and swallowed the
			// canvas clicks that open the waveform dialogs.
			var rightCol = document.getElementById('vs-right-col');
			if( rightCol ) {
				rightCol.style.position = 'absolute';
				rightCol.style.left = L.readoutLeft + 'px';
				rightCol.style.top = '0px';
				rightCol.style.width = L.readoutWidth + 'px';
				rightCol.style.height = ( L.areaTop + L.areaHeight ) + 'px';
			}
			// The Temp / SpO2 / NIBP row sits at a fixed place on the design
			// canvas rather than flowing under the strips.
			var vsm = document.getElementById('vsm');
			var wide = vsm ? vsm.querySelector('.wide-col') : null;
			if( wide ) {
				wide.style.position = 'absolute';
				wide.style.left = '0px';
				wide.style.top = L.bottomTop + 'px';
				wide.style.width = L.designWidth + 'px';
				wide.style.height = L.bottomHeight + 'px';
				chart.layoutBottomRow( wide );
			}
		},

		// The numbers row along the bottom of the design canvas. The clock is a
		// full-height block in the left corner and everything else runs to its
		// right; a page without a clock (the instructor interface has none) simply
		// starts at the left edge instead.
		layoutBottomRow: function(wide) {
			var L = chart.layout;
			var blocks = [
				{ el: wide.querySelector('#vs-clock'),              width: 260, full: true },
				{ el: wide.querySelector('.alt-control.control-Tperi'), width: 260 },
				{ el: wide.querySelector('#vs-nbp'),                width: 640 }
			];
			var x = 0;
			for( var i = 0; i < blocks.length; i++ ) {
				var el = blocks[i].el;
				if( ! el ) {
					continue;			// channel or clock not present on this page
				}
				el.style.position = 'absolute';
				el.style.left = x + 'px';
				el.style.top = '0px';
				el.style.width = blocks[i].width + 'px';
				el.style.margin = '0';
				if( blocks[i].full ) {
					el.style.height = L.bottomHeight + 'px';
				}
				x += blocks[i].width + L.bottomGap;
			}
		},

		// Wipe every strip and readout at once.
		//
		// The individual sensor-indicator handlers each clear their own canvas when
		// a probe is removed, but a scenario ending is not a probe change: without
		// this the traces merely stop being redrawn and then erode a pixel at a
		// time as the sweep passes over them, which reads as the monitor slowly
		// dissolving rather than switching off. A new channel is covered by adding
		// its `blank` hook to the registry above.
		blankMonitor: function() {
			var chans = chart.enabledChannels();
			for( var i = 0; i < chans.length; i++ ) {
				var strip = chart[chans[i].key];
				if( strip && strip.ctx ) {
					// full width including the scale label gutter
					strip.ctx.clearRect( 0, 0, chart.layout.stripWidth, strip.height );
					strip.xPos = strip.xOffsetLeft;
					strip.lastDisplayedY = strip.yOffset + strip.yDisplayOffset;
					strip.lastY = strip.yOffset;
					strip.scaleWasVisible = false;
				}
				if( chans[i].blank ) {
					try {
						chans[i].blank();
					} catch(e) {
						// a control that isn't on this page must not stop the rest
					}
				}
			}
		},

		// Wipe a strip the moment its sensor is removed on the student monitor, and
		// restart its sweep from the left when the sensor comes back. The ECG and
		// capnograph have always done this (simmgr.js, the ecg_indicator and
		// etco2_indicator blocks). Without it a strip only stops drawing, and the old
		// trace lingers until the cursor has erased it a column at a time - a whole
		// sweep, about 13 seconds.
		clearStrip: function(key) {
			var strip = chart[key];
			if( ! strip || ! strip.ctx || ! document.getElementById(strip.id) ) {
				return;
			}
			chart.initStrip(key);
			// full width, including the scale label gutter
			strip.ctx.clearRect( 0, 0, chart.layout.stripWidth + 2, strip.height + 2 );
			var ch = chart.channelFor(key);
			strip.lastDisplayedY = ( ch && ch.scale ) ? chart.stripScaleY(key, 0)
			                                          : strip.yOffset + strip.yDisplayOffset;
			strip.lastY = strip.yOffset;
			// Make the draw loop see a visibility change, so a reference scale (the
			// arterial pressure gridlines) is repainted in full on reconnect rather
			// than creeping back in a band at a time.
			strip.scaleWasVisible = false;
		},

		// Switch a channel on or off and re-divide the waveform area. Used for the
		// arterial and PA catheter strips, which appear only while their line or
		// catheter is in.
		setChannelEnabled: function(key, on) {
			var ch = chart.channelFor(key);
			if( ! ch || ch.enabled == on ) {
				return;
			}
			ch.enabled = on;
			chart.handleResize();
		},

		// Re-fit after the window changes size or the display enters full screen.
		// Resizing a canvas clears it and resets its context, so the scales are
		// repainted; in-flight traces are lost and redraw as the sweep continues.
		handleResize: function() {
			if( ! document.getElementById('vsm-frame') ) {
				return;
			}
			chart.applyLayout();
			var chans = chart.enabledChannels();
			for( var i = 0; i < chans.length; i++ ) {
				var key = chans[i].key;
				var strip = chart[key];
				if( strip.ctx ) {
					// Every strip derives its baseline (yOffset) from its height. A
					// window resize leaves the design-pixel heights alone, but adding
					// or removing a channel - placing the PA catheter - changes them,
					// and a baseline left over from the old height draws the trace too
					// low in the new, shorter strip. initStrip re-derives it, along
					// with the start position, width and context transform.
					chart.initStrip( key );
					strip.lastDisplayedY = strip.yOffset + strip.yDisplayOffset;
					chart.redrawStripScale( key );
				} else {
					strip.xPos = strip.xOffsetLeft;
					strip.width = chart.layout.stripWidth - strip.xOffsetLeft - strip.xOffsetRight;
				}
			}
		},

		// assume document is rendered before calling init.
		init: function() {
			// size and position the strips before anything derives geometry from them
			chart.applyLayout();

			/************************** EKG **********************************/
			// set initial pattern
			chart.ekg.rhythmIndex = 'asystole';	// Flatline
			chart.ekg.rateIndex = 0;	// lowest heart rate
			
			// init canvas for ekg
			chart.initStrip('ekg');
			
			// init rhythm patterns
			chart.ekg.rhythm.asystole = new Array;
			chart.ekg.rhythm.sinus = new Array;
			chart.ekg.rhythm.vfib = new Array;
			chart.ekg.rhythm.afib = new Array;
			chart.ekg.rhythm.vtach1 = new Array;
			chart.ekg.rhythm.vtach2 = new Array;
			chart.ekg.rhythm.vtach3 = new Array;  // place holder since vtach 3 is half sine
			chart.ekg.rhythm.vpc1 = new Array;
			chart.ekg.rhythm.vpc2 = new Array;
			chart.ekg.rhythm.cpr = new Array;  // place holder since cpr is similar to vtach3
			
			// init cpr waveform, assume rate will be 120 bpm and waveform is simple 1/2 sinusoidal
			//var cprXIncr = (120 * chart.ekg.drawInterval * Math.PI) / 60000;
			// authored against the reference height; chart.ekg.ampScale does the
			// scaling at draw time, so this must NOT use the live strip height
			var cprAmplitude = chart.REFERENCE_STRIP_HEIGHT / 2;
			//var cprIndex = 0;
			//for(var x = 0; x <= Math.PI; x += cprXIncr) {
			//	chart.ekg.rhythm.cpr[cprIndex] = (Math.sin(x) * -cprAmplitude);
			//	cprIndex++;
			//}
			chart.ekg.rhythm.cpr[0] = [
				0,0.007352941,0.014705882,0.022058824,0.029411765,0.036764706,0.044117647,0.095588235,
				0.147058824,0.198529412,0.25,0.272058824,0.294117647,0.529411765,0.764705882,
				0.838235294,0.911764706,0.941176471,1,0.970588235,0.941176471,0.970588235,1,
				0.941176471,0.926470588,0.911764706,0.75,0.588235294,0.485294118,0.382352941,
				0.279411765,0.176470588,0.220588235,0.264705882,0.205882353,0.147058824,0.132352941,
				0.117647059,0.073529412,0.029411765,0.014705882,-0.014705882
			];
			chart.ekg.rhythm.cpr[1] = [
				0,0.006410256,0.012820513,0.128205128,0.173076923,0.217948718,0.237179487,0.256410256,
				0.461538462,0.666666667,0.730769231,0.794871795,0.871794872,0.923076923,0.871794872,
				0.846153846,0.871794872,0.923076923,0.948717949,1,0.884615385,0.846153846,0.871794872,
				0.820512821,0.230769231,0.179487179,0.128205128,0.115384615,0.102564103,0.064102564,
				0.025641026,0.012820513,-0.012820513,0,0.012820513,-0.012820513,0,-0.012820513,0.038461538,
				0,0.012820513,-0.012820513
			];
			chart.ekg.rhythm.cpr[2] = [
				-0.013513514,0.013513514,0,0.040540541,-0.013513514,0,-0.013513514,0.013513514,0,0.081081081,
			0.162162162,0.621621622,0.648648649,0.675675676,0.648648649,0.540540541,0.621621622,0.702702703,
			0.864864865,0.918918919,0.918918919,0.932432432,0.972972973,1,0.972972973,0.986486486,
			0.986486486,0.972972973,0.972972973,0.918918919,0.837837838,0.77027027,0.702702703,0.486486486,
			0.27027027,0.25,0.22972973,0.182432432,0.135135135,0.013513514,0.006756757,0
			];

			for(var j = 0; j < chart.ekg.rhythm.cpr.length; j++)
			{
				for(var i = 0; i < chart.ekg.rhythm.cpr[j].length; i++)
				{
				 	chart.ekg.rhythm.cpr[j][i] *= -cprAmplitude;
				}
			}
			
			// ekg
			chart.ekg.rhythm['defib'] = [
//				32, -64, 64, 64, 64, 64, 64, 64, 64, 64,
//				64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
//				32, 25, 16, 12, 10, 8, 6, 4, 2, 1, 0
-32,-32,32,32,-64,-64,-64,-64,-64,-64,-64,-64,-64,-64,-64,-64,-64,-64,-32,-25,-16,-12,-10,-8,-6,-5,-4,-2,-1,0,0
			];
			
			// Atrial Fibrillation
			chart.ekg.rhythm['afib'][0] = [
				0, 1, 2, 3, 10, 17, 20, 52, 64, 40, 26, 10, 0, -10, -20, -15, -10, -1 // Up to 150
			];
			chart.ekg.rhythm['afib'][1] = [
				0, 2, 3, 10, 20, 52, 64, 26, 10, 0, -20, -15, -10, -1 // Up to 300
			];

			// Ventricular Tachycardia
			// BPM 0 - 80
			chart.ekg.rhythm['vtach1'][0] = [
				8, 8, 11, 21, 40, 56, 63, 67, 55, 37,
				17, -7, -13, -16, -21, -23, -24, -25, -26, -26,
				-24, -18, -11, -3, 5, 11, 14, 16, 15, 15,
				13, 12, 12, 13, 13, 17, 16, 15, 11, 9,
				9, 8, 8
			];
			// BPM 81 - 160
			chart.ekg.rhythm['vtach1'][1] = [
				8, 11, 21, 40, 56, 63, 67, 55, 37, 17,
				-7, -13, -16, -23, -26, -24, -18, -11, -3, 5, 
				11, 9, 8
			];
			// BPM 161 - 240
			chart.ekg.rhythm['vtach1'][2] = [
				8, 21, 40, 56, 63, 67, 37, 17,
				-7, -13, -26, -18, -11, 
				11, 8
			]; 
			// BPM 241 - 300
			chart.ekg.rhythm['vtach1'][3] = [
				8, 21, 40, 67, 37, 
				-7, -13, -26, -11, 
				11
			];

			// BPM 0 - 80
			chart.ekg.rhythm['vtach2'][0] = [
				0, 0, 0, 0, 0, 1, 2, 3, 3, 4,
				5, 3, -25, -52, -51, -49, -30, -19, -9, 11, 
				24, 25, 27, 28, 31, 35, 39, 42, 43, 40, 
				33, 25, 16, 9, 4, 0, 0, 0, 0, 0 
			];
			// BPM 81 - 160
			chart.ekg.rhythm['vtach2'][1] = [
				0, 1, 2, 3, 4, 5, 3, -25, -52, -30, 
				-19, -9, 11, 25, 35, 42, 33, 25, 16, 4
			];
			// BPM 161- 240
			chart.ekg.rhythm['vtach2'][2] = [
				1, 3, 5, -25, -52, -30, 
				-19, -9, 11, 25, 35, 42, 33, 25, 16
			]; 
			// BPM 241 - 300
			chart.ekg.rhythm['vtach2'][3] = [
				1, 5, 3, -25, -52, 
				-19, 11, 42, 33, 16
			];
			chart.ekg.rhythm['vtach3'][0] = [
				0, 1, 2, 3
			];
			
			// VPC
			chart.ekg.rhythm['vpc1'][0] = [
				8, 8, 11, 21, 40, 56, 63, 67, 55, 37,
				17, -7, -13, -16, -21, -23, -24, -25, -26, -26,
				-24, -18, -11, -3, 5, 11, 14, 16, 15, 15,
				13, 12, 12, 13, 13, 17, 16, 15, 11, 9,
				9, 8, 8
			];
			chart.ekg.rhythm['vpc1'][1] = [
				8, 11, 21, 40, 56, 63, 67, 55, 37, 17,
				-7, -13, -16, -23, -26, -24, -18, -11, -3, 5, 
				11, 9, 8
			];
			chart.ekg.rhythm['vpc1'][2] = [
				8, 21, 40, 56, 63, 67, 37, 17,
				-7, -13, -26, -18, -11, 
				11, 8
			];
			chart.ekg.rhythm['vpc2'][0] = [
				0, 0, 0, 0, 0, 1, 2, 3, 3, 4,
				5, 3, -25, -52, -51, -49, -30, -19, -9, 11, 
				24, 25, 27, 28, 31, 35, 39, 42, 43, 40, 
				33, 25, 16, 9, 4, 0, 0, 0, 0, 0 
			];
			chart.ekg.rhythm['vpc2'][1] = [
				0, 1, 2, 3, 4, 5, 3, -25, -52, -30, 
				-19, -9, 11, 25, 35, 42, 33, 25, 16, 4
			];
			chart.ekg.rhythm['vpc2'][2] = [
				1, 5, 3, -25, -52, -30, 
				-19, 11, 35, 42, 33, 16, 4
			];
			
			// asystole
			chart.ekg.rhythm['asystole'][0] = [
				0, 0, 0, 0, 0, 0, 0		// Flatline
			];
			
			// sinus
			chart.ekg.rhythm['sinus'][0] = [
				4, 3, 4, 6, 7, 7, 6, 4, 2, 1, 
				1, 1, 2, 2, 2, 3, 17, 52, 64, 26,
				-3, -5, -2, 0, 1, 2, 3, 4, 4, 5, 
				6, 7, 8, 10, 11, 13, 15, 16, 17, 17, 
				16, 14, 10, 7, 4, 2, 1, 0, 0, 1, 
				1 
			];
			chart.ekg.rhythm['sinus'][1] = [
				4, 3, 6, 7, 4, 2, 1, 2, 3, 17, 
				64, 26, -5, -2, 0, 2, 4, 5, 6,  10, 
				11, 15, 16, 17, 16, 10, 4, 1, 0, 1 
			];
			chart.ekg.rhythm['sinus'][2] = [
				4, 3, 7, 1, 3, 35, 64, -5, -2, 4, 
				6, 11, 15, 10, 4, 1 
			];
			chart.ekg.rhythm['sinus'][3] = [
				3, 7, 1, 35, 64, -5, 4, 17, 
				4, 1 
			];
			
			
			// vfib
			chart.ekg.rhythm['vfib'][0] = [
				2, 3, 17, 52, 64, 26, -3, -5, -2, 0, 1, 2, 3, 4, 4, 5, 6, 7, 
				8, 10, 11, 13, 15, 16, 17, 17, 16, 14, 10, 7, 4, 2, 1, 0, 0, 1, 1 // Up to 75
			];
			chart.ekg.rhythm['vfib'][1] = [
				2, 3, 17, 64, 26, -5, -2, 0, 2, 4, 5, 6,  10, 11, 15, 16, 17, 16, 10, 4, 1, 0, 1 // Up to 140
			];
			chart.ekg.rhythm['vfib'][2] = [
				3, 35, 64, -5, -2, 4, 6, 11, 15, 17, 10, 4, 1 // Up to 230
			];
			chart.ekg.rhythm['vfib'][3] = [
				3, 35, 64, -5, 4, 11, 17, 4, 1 // Up to 300
			];
			
			// Pre-computed VFib waveform segments.
			// Three amplitude grades (high=coarse, med=medium, low=fine),
			// 6 segments each (~4 s at 15 ms/sample).
			// Positive values = upward deflection; draw loop applies *-1 (same convention as other rhythms).
			chart.ekg.vfibSegments = {
				'high': [
					[
						0, 1, 3, 5, 9, 12, 12, 13, 10, 6, 0, -4, -8, -12, -13, -12, -11, -8, -6, 1,
						4, 10, 13, 15, 12, 9, 5, 1, 7, 12, 12, 7, -1, -5, -11, -14, -15, -17, -14, -11,
						-5, 1, 4, 8, 11, 11, 12, 11, 10, 7, 4, 0, -3, -8, -9, -9, -4, 1, 7, 12,
						13, 11, 6, 0, -3, -6, -8, -11, -10, -8, -4, 0, 4, 8, 7, 8, 7, 5, -1, -7,
						-11, -10, -6, 0, 5, 10, 11, 13, 9, 6, 1, 9, 15, 16, 14, 9, 0, -5, -11, -14,
						-17, -17, -16, -13, -10, -7, 0, 6, 11, 16, 16, 16, 14, 10, 4, 0, -7, -12, -17, -21,
						-19, -17, -12, -6, -1, 15, 16, 0, -5, -12, -14, -15, -13, -11, -5, -1, 7, 12, 15, 16,
						13, 12, 6, 1, -13, -17, -10, 1, 15, 23, 22, 14, 0, -17, -26, -18, 0, 6, 14, 16,
						16, 12, 7, -1, -14, -22, -25, -23, -13, -1, 8, 17, 21, 20, 15, 8, 0, -5, -12, -15,
						-17, -14, -11, -7, 1, 6, 11, 17, 20, 21, 19, 16, 12, 6, -1, -13, -14, 1, 8, 12,
						16, 19, 18, 12, 6, 0, 6, 12, 16, 17, 15, 12, 7, 0, 11, 16, 14, 10, 0, -6,
						-8, -12, -11, -11, -5, 1, 2, 5, 8, 9, 6, 3, 0, -12, -11, -1, 7, 10, 10, 8,
						1, -5, -9, -10, -9, -5, 0, 9, 12, 8, 0, -5, -9, -10, -14, -14, -12, -10, -6, -4,
						-1, -6, -5, 0, 1, 1, 0
					],
					[
						0, 1, 2, 3, 3, 3, -1, -6, -10, -11, -8, -1, 3, 8, 10, 9, 7, 5, 0, -3,
						-9, -13, -15, -14, -13, -10, -4, -1, 5, 10, 12, 13, 12, 9, 5, 1, -5, -9, -12, -8,
						-6, 1, 10, 16, 12, 0, -4, -7, -11, -12, -13, -11, -10, -7, -4, 1, 7, 12, 14, 11,
						7, 0, -11, -17, -21, -18, -11, 0, 14, 24, 23, 14, 0, 13, 22, 24, 22, 13, -1, -8,
						-15, -19, -21, -21, -18, -15, -7, -1, -10, -17, -24, -26, -26, -19, -12, -1, -14, -22, -27, -25,
						-13, 1, 6, 16, 20, 23, 23, 21, 14, 8, -2, -9, -15, -19, -22, -19, -17, -10, 0, 5,
						12, 13, 13, 15, 11, 6, 1, -6, -11, -16, -19, -19, -20, -16, -12, -7, -1, 11, 15, 11,
						-1, -17, -17, 0, 8, 15, 15, 9, 0, 5, 10, 10, 9, 5, 0, -11, -17, -10, -1, 4,
						7, 10, 12, 14, 13, 11, 7, 3, 0, -6, -9, -11, -11, -5, 0, 9, 13, 12, 7, -1,
						-7, -13, -10, 0, 6, 12, 14, 13, 7, 0, -5, -9, -11, -11, -10, -3, 1, -5, -9, -9,
						-14, -15, -14, -11, -7, -6, -1, 7, 10, 8, 0, -7, -13, -16, -15, -14, -13, -7, 2, 13,
						17, 17, 10, 0, -15, -16, 0, 11, 17, 12, 0, -9, -13, -18, -20, -22, -19, -14, -7, 0,
						-10, -17, -20, -20, -11, 0, -8, -13, -18, -20, -19, -13, -8, 0, 14, 22, 23, 12, 0, -5,
						-8, -10, -8, -6, -4, -1, 0
					],
					[
						0, 1, 2, 3, 3, 0, -4, -5, -9, -10, -14, -12, -8, -5, 0, 4, 9, 11, 13, 14,
						10, 8, 4, 0, -6, -11, -15, -19, -20, -19, -17, -12, -7, 2, -4, -10, -12, -16, -14, -11,
						-5, -1, 11, 20, 23, 19, 11, 0, -8, -12, -17, -16, -13, -7, 0, 7, 11, 17, 20, 21,
						21, 16, 12, 8, 0, -6, -9, -13, -17, -18, -18, -17, -14, -9, -5, 0, 9, 17, 16, 11,
						-1, -14, -21, -21, -13, -1, 8, 16, 16, 9, -1, -5, -10, -14, -17, -16, -16, -13, -10, -5,
						0, 10, 17, 18, 11, 0, -12, -16, -11, -1, 5, 11, 11, 11, 5, 0, -10, -15, -16, -9,
						1, 10, 13, 11, 1, -9, -16, -16, -10, -1, 9, 14, 10, 1, -9, -11, 0, -7, -11, -8,
						0, -3, -6, -9, -10, -10, -8, -7, -3, 0, 5, 9, 10, 9, 8, 4, 1, -8, -13, -14,
						-8, 0, 5, 10, 7, 0, -11, -16, -12, 1, 4, 8, 11, 13, 15, 12, 12, 8, 4, -1,
						-6, -10, -14, -13, -6, -2, -4, -9, -11, -9, -10, -4, 1, 10, 14, 9, 0, 8, 13, 17,
						19, 21, 17, 13, 7, 1, -7, -13, -18, -21, -21, -17, -14, -6, 0, 11, 19, 21, 17, 10,
						0, 10, 17, 21, 23, 20, 18, 8, 0, 13, 22, 26, 22, 14, 1, -5, -11, -16, -19, -19,
						-19, -16, -12, -5, 1, 4, 11, 16, 19, 17, 18, 16, 11, 6, -1, -10, -17, -19, -18, -12,
						-6, 0, 2, 4, 3, 1, 0
					],
					[
						0, 1, 2, 4, 5, 6, 6, 4, -1, -4, -8, -11, -15, -14, -12, -9, -5, 0, 6, 13,
						16, 18, 18, 16, 12, 7, -1, -12, -19, -17, -12, -1, 6, 10, 12, 6, -1, -10, -15, -16,
						-9, 0, 4, 7, 10, 10, 9, 7, 4, 1, 6, 10, 6, 1, -3, -6, -9, -10, -10, -12,
						-11, -9, -6, -4, 0, 2, 6, 9, 9, 10, 7, 7, 4, 1, 5, 8, 13, 12, 10, 4,
						0, -7, -12, -15, -15, -6, 0, 5, 8, 9, 7, -1, -12, -16, -11, -1, 8, 11, 16, 12,
						8, -1, -6, -9, -14, -17, -17, -17, -15, -11, -6, 0, -11, -19, -22, -19, -11, -2, 15, 16,
						1, -10, -18, -22, -22, -16, -10, 1, 13, 23, 22, 13, -1, -10, -16, -19, -15, -11, 0, 10,
						19, 22, 20, 11, 0, -8, -15, -21, -24, -23, -21, -15, -9, 0, 17, 25, 18, 0, -14, -19,
						-13, -1, 10, 15, 15, 10, -1, -7, -14, -19, -21, -24, -19, -15, -8, -1, 5, 10, 13, 15,
						14, 10, 5, 0, -8, -12, -16, -15, -13, -8, -1, 7, 13, 17, 21, 20, 17, 13, 6, 1,
						-7, -11, -15, -16, -14, -8, 0, 7, 13, 13, 13, 7, -1, -8, -13, -13, -8, 0, 4, 9,
						13, 14, 14, 13, 9, 6, 0, -1, -6, -8, -8, -8, -8, -5, -3, 0, 6, 10, 10, 5,
						0, -5, -9, -8, -4, -1, 7, 11, 12, 16, 14, 9, 6, -1, -7, -12, -10, -6, 0, 3,
						5, 5, 4, 2, 1, 0, 0
					],
					[
						0, -1, -2, -3, 0, 4, 7, 5, 1, -2, -4, -9, -9, -9, -8, -7, -7, -2, 0, 4,
						10, 10, 12, 11, 8, 4, 0, -8, -11, -8, 2, 9, 12, 13, 7, -1, -7, -11, -12, -6,
						1, 6, 9, 8, 5, 0, -4, -8, -9, -9, -9, -7, -3, 0, -5, -9, -11, -11, -8, -4,
						0, 9, 15, 16, 14, 9, 1, -9, -15, -18, -16, -9, -1, -13, -14, -1, 14, 22, 22, 13,
						-1, -12, -20, -24, -20, -12, 2, 7, 15, 19, 22, 22, 18, 15, 9, 0, -12, -19, -24, -27,
						-25, -18, -11, -1, 6, 10, 15, 16, 14, 10, 6, -1, 14, 22, 16, -1, -13, -19, -18, -11,
						0, 12, 20, 22, 17, 12, 1, -8, -14, -16, -13, -10, -1, 11, 17, 11, 1, 8, 15, 16,
						16, 9, 0, -13, -15, 0, 7, 12, 15, 13, 7, 1, -8, -15, -15, -7, 0, 11, 17, 17,
						16, 9, 0, 7, 12, 13, 12, 6, 0, -7, -11, -8, -1, -9, -14, -13, -8, -1, 5, 4,
						7, 9, 10, 8, 8, 6, 4, 1, -4, -7, -10, -12, -12, -12, -10, -8, -5, -1, 10, 13,
						10, 0, -4, -6, -8, -9, -11, -10, -7, -7, -5, 0, 5, 10, 12, 13, 9, 7, -1, -7,
						-10, -10, -7, 0, -4, -8, -8, -10, -9, -7, -4, 1, 6, 10, 12, 12, 10, 5, 1, -8,
						-12, -9, -1, 4, 10, 15, 17, 18, 15, 14, 10, 5, 1, -8, -16, -19, -24, -19, -17, -10,
						-5, 0, 2, 3, 3, 2, 0
					],
					[
						0, 1, 3, 4, 0, -5, -10, -11, -7, 0, 5, 10, 6, 0, -4, -11, -11, -10, -5, 1,
						4, 9, 10, 11, 9, 5, -1, -9, -18, -21, -21, -15, -9, -1, 5, 10, 14, 16, 18, 18,
						14, 11, 7, 0, -9, -16, -19, -16, -8, 0, 5, 9, 14, 16, 16, 15, 14, 11, 5, 1,
						-8, -14, -19, -21, -21, -18, -14, -8, -1, 8, 14, 16, 14, 8, -1, -8, -14, -19, -21, -19,
						-17, -9, 0, 6, 11, 14, 16, 18, 17, 15, 11, 4, 0, -6, -12, -15, -16, -12, -9, 1,
						12, 22, 21, 14, -1, -8, -14, -18, -22, -21, -20, -13, -6, 1, 10, 14, 10, 1, -5, -7,
						-11, -13, -13, -13, -11, -7, -5, 0, 5, 7, 9, 10, 10, 8, 3, -1, -4, -6, -8, -9,
						-9, -6, -3, 0, -6, -11, -12, -12, -7, 0, 7, 9, 8, 0, -6, -9, -9, -7, 1, 6,
						11, 13, 10, 10, 7, 0, -4, -9, -11, -13, -15, -14, -12, -8, -4, 1, 6, 10, 13, 16,
						13, 11, 7, 1, -6, -10, -13, -13, -13, -11, -9, -4, 0, 6, 9, 12, 12, 10, 5, 0,
						-4, -7, -10, -12, -12, -9, -7, -4, 0, 7, 13, 19, 22, 22, 22, 17, 14, 7, -2, -16,
						-24, -24, -15, 0, 6, 11, 16, 16, 17, 15, 10, 6, 0, -8, -17, -21, -20, -16, -9, 0,
						8, 14, 17, 17, 13, 8, 0, 16, 17, 0, -8, -17, -22, -24, -24, -21, -15, -8, 0, 7,
						11, 11, 8, 5, 2, 0, 0
					]
				],
				'med': [
					[
						0, 1, 2, 4, 4, 5, 3, 0, -11, -12, 0, 7, 11, 9, 6, 1, -10, -17, -16, -11,
						0, 7, 12, 12, 7, 0, -6, -9, -6, 1, 12, 14, -1, -15, -16, 0, 9, 8, 0, 8,
						12, 14, 14, 10, 5, 1, -8, -11, -8, -1, 9, 13, 10, 0, -7, -13, -13, -8, -1, -5,
						-6, -8, -9, -4, -1, 6, 11, 12, 11, 6, 0, -5, -8, -13, -10, -9, -5, -1, 9, 11,
						0, -6, -9, -6, 0, 3, 3, 5, 6, 4, 4, 1, 1, -8, -7, 1, 8, 6, 1, -2,
						-5, -6, -5, -5, -2, 0, 8, 7, 0, -5, -7, -9, -7, -6, 1, 4, 9, 9, 5, 0,
						-6, -5, 0, 3, 5, 8, 6, 4, 3, 0, -1, -4, -4, -6, -4, -2, 1, 4, 6, 8,
						4, 1, -3, -8, -10, -9, -5, 1, 6, 6, 0, -5, -8, -7, -6, -1, 7, 10, 11, 7,
						0, 9, 14, 10, 0, -5, -9, -11, -11, -10, -5, 1, 7, 11, 14, 14, 11, 7, 0, -8,
						-11, -9, 1, 7, 13, 11, 9, 0, -8, -11, -9, 0, 8, 11, 11, 7, 0, 6, 12, 12,
						8, 0, -4, -8, -10, -8, -7, -4, 0, 8, 14, 17, 16, 14, 7, 0, -6, -9, -12, -10,
						-6, 0, 13, 12, 0, -9, -14, -9, 0, 11, 10, 0, -8, -13, -15, -14, -8, 1, 8, 13,
						11, 8, -1, -7, -10, -7, 0, 3, 5, 8, 5, 3, 0, -3, -6, -7, -8, -6, -5, -3,
						0, 2, 3, 1, 1, 0, 0
					],
					[
						0, 1, 2, 3, 2, 0, -2, -5, -4, 0, 2, 6, 6, 7, 4, 0, -6, -8, -5, 0,
						-6, -6, 0, -7, -9, -6, 1, 3, 5, 6, 4, 4, -1, -5, -4, -6, -3, 0, 4, 7,
						6, 4, 1, -6, -8, -10, -5, 0, 5, 8, 7, 4, 0, -6, -8, -8, -5, 1, 5, 6,
						10, 9, 8, 4, 0, -6, -8, -5, 0, -6, -10, -10, -7, 1, 3, 6, 5, 4, 0, -4,
						-5, -6, -7, -6, -2, 1, 7, 7, 0, 5, 9, 8, 5, 1, -6, -9, -10, -7, 1, 5,
						8, 5, 0, -7, -8, 0, 8, 7, 1, -5, -10, -12, -12, -10, -5, 0, 9, 14, 14, 10,
						-1, 9, 14, 14, 8, 0, 9, 16, 11, 1, -14, -15, 0, 11, 14, 11, -1, -12, -13, -1,
						8, 14, 15, 15, 8, 0, -6, -11, -8, 1, 6, 13, 15, 14, 7, 0, -7, -12, -15, -14,
						-8, 1, 10, 11, 0, -5, -7, -8, -7, -4, -1, -4, -8, -8, -4, 0, 3, 6, 7, 6,
						4, 0, 6, 10, 12, 11, 6, 1, -3, -8, -7, -8, -5, -4, 1, 4, 8, 9, 7, 4,
						0, -6, -10, -7, 1, 6, 8, 7, 6, 0, 3, 5, 5, 4, -1, -3, -5, -4, -3, 1,
						4, 6, 6, 4, -1, -4, -8, -9, -7, -5, -3, 0, 3, 6, 8, 7, 3, 0, -5, -5,
						-7, -6, -3, 0, 5, 7, 10, 9, 8, 5, 0, -9, -9, 1, 4, 6, 5, 0, -3, -5,
						-5, -4, -3, -1, 0, 0, 0
					],
					[
						0, 0, 2, 3, 4, 3, 0, 7, 11, 12, 11, 0, -7, -10, -1, 8, 13, 8, 0, -8,
						-13, -12, -8, -1, 3, 6, 9, 9, 6, 4, 1, -4, -7, -7, -4, -1, 3, 5, 7, 6,
						2, 0, 6, 7, 6, -1, -5, -10, -9, -8, -5, 0, 3, 6, 8, 7, 5, 2, -1, -5,
						-4, 0, 5, 5, 7, 6, 4, 1, -2, -3, -4, -4, -3, -1, 4, 8, 9, 4, -1, -8,
						-7, 1, 8, 8, 0, -5, -7, -9, -8, -8, -3, -1, 4, 8, 7, 8, 4, 0, -9, -11,
						-7, 0, 7, 10, 8, -2, -8, -10, 0, 7, 8, 6, 1, -12, -11, 0, 7, 10, 11, 6,
						-1, -7, -13, -15, -13, -8, 0, 6, 11, 15, 13, 11, 6, -1, -8, -10, -7, 0, 7, 10,
						7, 0, -6, -12, -13, -12, -7, -1, 6, 8, 11, 13, 8, 4, 1, -6, -10, -7, 0, 10,
						9, 1, -6, -11, -10, -6, 1, -5, -8, -11, -11, -9, -5, -1, -6, -9, -10, -7, 1, 7,
						9, 9, 7, 0, -4, -8, -9, -5, 1, 5, 10, 11, 9, 5, 0, -6, -10, -12, -12, -11,
						-6, -1, 5, 7, 8, 7, 4, 0, -3, -6, -6, -7, -5, -3, -1, 8, 7, -1, -4, -7,
						-8, -4, 1, 4, 8, 4, 1, -5, -8, -10, -8, -4, 0, 7, 6, -1, -6, -6, 1, -4,
						-6, -8, -6, -4, 0, 3, 5, 4, 3, 0, -2, -4, -5, -3, 1, 2, 4, 5, 4, 3,
						1, 0, -3, -3, -2, 0, 0
					],
					[
						0, 0, 1, 3, 4, 1, 1, -3, -3, -5, -5, 0, 3, 6, 7, 6, 3, 0, -5, -7,
						-6, -4, 0, 3, 4, 5, 5, 5, 2, 0, -3, -7, -7, -6, -4, -1, 4, 7, 6, 7,
						4, -1, -3, -6, -7, -6, -5, 0, 8, 6, -1, -5, -9, -5, 0, 6, 9, 8, 0, -8,
						-8, 0, 6, 9, 11, 11, 10, 9, 3, -1, -6, -10, -13, -13, -10, -6, 0, 4, 7, 9,
						9, 8, 4, -1, -4, -7, -7, -5, -1, 9, 13, 9, 0, -12, -15, -11, -2, 6, 11, 14,
						13, 10, 6, 1, -11, -14, -11, 0, 8, 11, 0, -7, -7, -2, 8, 13, 15, 13, 9, 0,
						-5, -8, -9, -7, -4, 1, 9, 16, 16, 9, 0, -6, -10, -8, -1, 9, 16, 15, 8, 1,
						7, 11, 15, 14, 12, 5, 0, -8, -8, 0, 9, 11, 9, 0, -5, -8, -9, -6, -1, 3,
						5, 7, 7, 5, 3, 1, -6, -10, -10, -5, 0, 7, 13, 8, 0, -8, -8, 1, -4, -4,
						-6, -4, 0, -4, -5, -6, -5, -6, -3, 0, 4, 7, 9, 9, 8, 6, 0, -5, -7, -7,
						-4, 1, 8, 8, 0, -3, -7, -6, -4, 0, 4, 7, 10, 9, 8, 4, 0, -5, -8, -10,
						-4, 1, 3, 6, 8, 6, 7, 4, 0, -6, -6, -5, 0, 6, 10, 11, 9, 6, -1, -6,
						-12, -12, -8, -1, 5, 6, 5, 2, -6, -11, -12, -7, 1, 4, 6, 8, 10, 7, 3, 0,
						-5, -6, -3, 0, 1, 1, 0
					],
					[
						0, 0, 1, 3, 4, 2, 0, -4, -7, -9, -6, 0, -7, -8, -6, 0, 7, 11, 13, 11,
						6, 0, -4, -6, -10, -9, -9, -7, -4, 0, 10, 15, 12, 0, -4, -7, -7, -7, -3, 0,
						11, 11, 1, -5, -10, -12, -14, -10, -7, -1, 3, 6, 8, 8, 7, 3, 1, 14, 13, 0,
						-11, -15, -10, 0, -8, -12, -13, -8, 0, 7, 9, 8, 0, -10, -15, -14, -10, 0, 9, 13,
						13, 8, -1, 4, 7, 8, 7, 4, 0, 10, 10, 1, -6, -8, -5, 1, 4, 6, 5, 0,
						-5, -8, -9, -9, -6, -6, 0, 6, 9, 11, 10, 5, 0, -5, -6, -8, -9, -6, -5, 0,
						4, 8, 8, 7, 5, 1, -3, -6, -5, -4, 0, 6, 8, 6, 0, -5, -5, -4, -1, 2,
						4, 6, 6, 5, 1, 0, -3, -7, -7, -8, -6, -5, 0, 6, 9, 6, -1, -5, -7, -8,
						-9, -8, -4, 0, 7, 11, 7, 0, -5, -8, -5, 0, -5, -7, -9, -8, -5, -1, 6, 7,
						0, -8, -7, -1, 6, 8, 10, 9, 5, 1, -5, -8, -8, -9, -5, 0, 6, 12, 13, 12,
						6, 1, -8, -11, -7, 0, 10, 10, 0, -9, -7, 0, 14, 14, 1, -8, -13, -15, -13, -7,
						1, 9, 12, 8, 2, -7, -10, -14, -14, -10, -7, 0, 7, 12, 15, 16, 11, 7, -1, -4,
						-8, -8, -8, -4, 0, 9, 10, -1, -6, -9, -10, -9, -5, 1, 4, 6, 9, 9, 5, 3,
						0, -4, -4, -2, 0, 1, 0
					],
					[
						0, 0, 1, 3, 3, 4, 2, 0, -5, -5, 0, 4, 5, 6, 3, 0, 7, 6, 0, -3,
						-5, -5, -4, -2, -1, 5, 8, 9, 8, 4, 1, -4, -8, -8, -9, -8, -5, 0, 6, 4,
						-1, -6, -10, -11, -6, -1, 7, 13, 9, 0, -6, -6, -7, -1, 8, 11, 8, 0, -7, -9,
						-10, -7, -1, 10, 9, 1, 5, 10, 11, 9, 5, 1, -12, -16, -12, -1, 9, 16, 16, 10,
						0, -9, -12, -11, -7, 1, 7, 12, 15, 12, 6, 1, -7, -11, -12, -6, 0, -9, -15, -16,
						-15, -8, -1, 11, 16, 16, 10, 0, -10, -10, -1, 13, 13, 0, -8, -13, -14, -12, -8, 0,
						-11, -12, -1, 6, 10, 7, 0, -5, -7, -8, -7, 0, 6, 10, 9, 6, 0, -8, -9, -1,
						-4, -6, -6, -6, 0, 6, 8, 11, 12, 8, 6, 0, -5, -7, -8, -9, -4, 0, 4, 6,
						7, 6, 4, 0, -5, -8, -4, 1, 5, 9, 8, 6, 0, -5, -5, 1, 5, 5, 1, -3,
						-4, -5, -7, -5, -4, 0, 2, 4, 4, 6, 5, 3, 0, 5, 9, 9, 9, 5, 1, -7,
						-9, -10, -6, -1, -6, -12, -8, 0, -6, -10, -6, -1, 6, 10, 13, 12, 9, 6, 0, -8,
						-8, 0, -6, -6, 1, 4, 8, 9, 9, 7, 4, 0, -10, -10, 0, 7, 10, 14, 10, 5,
						0, -7, -11, -13, -10, -6, 0, 10, 15, 10, 1, -8, -6, 1, 11, 13, 11, 0, -5, -7,
						-8, -5, -3, 0, -2, -1, 0
					]
				],
				'low': [
					[
						0, -1, -1, 0, 2, 4, 3, 0, -3, -5, -6, -4, 1, 4, 6, 5, 4, 0, -7, -7,
						0, 5, 6, 4, 0, -3, -5, -6, -6, -4, 0, 7, 6, 0, -5, -7, -4, -1, 4, 6,
						6, 3, 0, -2, -4, -5, -2, 0, 4, 4, 0, -5, -6, 0, 4, 6, 4, -1, -2, -3,
						-3, 0, 3, 4, 0, -3, -3, -3, -1, 0, 3, 4, 3, 0, -2, -3, -4, -2, 0, 3,
						3, 0, -3, -2, -4, -2, 0, -5, -5, 0, 2, 3, 5, 2, 0, -3, -4, -3, -1, 2,
						3, 4, 3, 0, -1, -2, -3, -2, 0, 4, 5, 4, 1, -2, -3, -3, -2, 0, 2, 4,
						4, 2, 0, -6, -6, 0, 2, 3, 3, 2, 0, 4, 4, 0, -6, -6, 0, 6, 6, 0,
						5, 6, 0, -5, -6, 0, 5, 8, 6, 0, -7, -7, 0, 5, 4, 0, -5, -5, 0, 5,
						7, 5, 0, -4, -5, 0, 4, 7, 7, 4, 0, -5, -8, -8, -6, 0, 4, 5, 0, -3,
						-5, -5, -3, 0, 2, 3, 4, 2, 1, -4, -5, 0, -3, -3, -3, -1, 3, 4, 3, 0,
						3, 4, 4, 2, 0, -5, -6, -4, 0, 5, 6, 0, -4, -3, 1, 4, 6, 4, 0, -4,
						-6, -6, -3, 0, 4, 6, 6, 4, 0, -2, -2, -4, -3, -1, 1, 2, 3, 1, 0, -3,
						-4, -3, 0, 3, 4, 3, 0, -1, -2, -2, 0, 2, 4, 4, 2, -1, -2, -2, -1, -1,
						0, 1, 1, 0, 0, 0, 0
					],
					[
						0, 0, 1, 0, -1, -2, -2, 0, 2, 3, 2, 0, -3, -3, -2, 0, 3, 5, 0, -2,
						-3, 0, 2, 3, 2, 2, 0, -4, -6, -4, 0, 4, 4, 5, 3, 0, -3, -5, -3, -1,
						2, 3, 4, 2, -1, -5, -4, 0, 3, 4, 4, 2, 1, -4, -6, -7, -4, 0, 4, 6,
						4, 0, -5, -4, 0, 5, 6, 0, -5, -5, 0, 4, 6, 5, 0, -4, -7, -5, 1, 6,
						6, 1, -5, -8, -5, 0, 3, 3, 4, 2, 0, 6, 7, 5, 0, 4, 4, 0, -5, -6,
						-5, 0, 3, 4, 4, 2, 0, -4, -6, -4, 0, 3, 6, 4, 0, 5, 5, 0, -2, -3,
						-4, -3, 0, 4, 6, 6, 3, -1, -4, -4, -2, 0, 3, 4, 5, 2, 0, -1, -2, -4,
						-3, -1, 1, 3, 5, 4, 3, -1, -4, -5, -4, 1, -3, -4, 1, 3, 4, 2, 0, -2,
						-3, -3, -3, -1, -1, 1, 4, 3, 2, 0, -3, -4, -2, 0, 3, 2, 1, -3, -3, 0,
						3, 5, 5, 2, 0, -4, -3, 0, 5, 5, 0, -1, -2, -3, -1, 0, 4, 3, 0, 4,
						4, 0, 3, 3, 1, -3, -4, -5, -2, 0, 3, 6, 5, 0, 5, 5, 0, -2, -4, -3,
						-1, 3, 4, 0, -4, -4, 0, 4, 3, 4, 0, -3, -4, -4, -3, 0, 5, 6, 0, -4,
						-6, -6, -4, 0, -5, -8, -9, -5, 0, 5, 4, 0, -3, -4, -4, -2, 0, 5, 5, 4,
						0, -2, -3, -2, -1, 0, 0
					],
					[
						0, 1, 1, 0, 2, 2, 0, -2, -3, -4, -2, 0, 3, 5, 5, 3, 0, -3, -4, -3,
						0, 8, 6, -1, -6, -8, -6, 1, -5, -7, -5, 0, 4, 4, 0, -4, -6, -7, -5, 0,
						3, 4, 5, 3, 0, 3, 3, 0, 2, 3, 3, 2, 0, 4, 3, 0, -3, -4, -5, -2,
						0, 3, 5, 5, 3, 0, -3, -2, 0, 5, 4, 0, -4, -4, 0, -3, -4, -4, -1, 3,
						2, 2, 0, -3, -3, -2, 0, 3, 3, 0, -3, -3, -1, 2, 3, 2, 0, -2, -2, -1,
						2, 3, 1, 0, -3, -4, -2, 0, 3, 3, 2, 1, -2, -5, -4, -2, 0, 4, 3, 0,
						-3, -3, 0, 1, 3, 2, 1, 0, -5, -4, 0, 3, 4, 3, 0, -5, -5, -1, -3, -3,
						0, 3, 3, 0, -4, -4, 0, 3, 5, 4, 2, 1, -6, -8, -5, 0, 3, 7, 6, 3,
						0, -5, -8, -8, -4, 1, 5, 4, -1, -3, -3, 1, 3, 7, 6, 4, 1, -6, -7, 0,
						4, 4, 0, -4, -5, -3, 0, 5, 5, 0, -4, -4, -2, 0, 3, 6, 7, 5, 0, -5,
						-8, -7, -4, 1, 3, 6, 6, 4, 0, -5, -8, -7, -5, 0, 1, 3, 5, 2, 0, -3,
						-3, 0, 4, 6, 5, 0, -3, -6, -6, -4, 0, 3, 3, 4, 2, 0, -5, -4, 0, 4,
						5, 0, -3, -5, -4, 0, 3, 4, 4, 1, -2, -3, -3, 0, 3, 3, 3, 0, 2, 2,
						1, -1, -2, -2, 0, 0, 0
					],
					[
						0, 0, 1, 1, 2, 1, 0, -1, -2, -3, -3, -2, 0, 2, 4, 3, 2, 0, -3, -5,
						-3, 0, 6, 6, 0, -5, -7, -5, 0, 2, 4, 6, 2, 0, -3, -4, 0, 2, 4, 4,
						2, 0, -4, -6, -4, 1, -3, -5, -4, -3, 0, 6, 6, 0, -2, -4, -3, 0, 4, 6,
						4, -1, -3, -6, -7, -7, -4, 0, 6, 8, 7, 1, 4, 3, 1, -5, -8, -7, 0, 5,
						6, 0, -5, -5, -1, 4, 7, 7, 4, 0, -3, -5, -4, -3, 0, 5, 5, 0, -5, -6,
						0, 6, 5, -1, -2, -4, -4, -2, -1, 3, 4, 5, 2, 0, -4, -4, -4, 0, 3, 4,
						3, 0, -3, -4, -3, 0, 3, 3, 0, -2, -4, -2, 1, 1, 2, 2, 0, 0, -2, -4,
						-3, -2, -1, 2, 3, 3, 3, 0, -4, -4, -1, 2, 2, 3, 0, -2, -3, -1, 2, 2,
						1, -2, -3, -2, 0, 3, 4, 2, 1, -3, -4, -3, 0, -3, -4, -4, -3, 0, 4, 4,
						2, 1, -1, -3, -2, -2, 0, 4, 3, -1, -3, -4, -1, 6, 7, 5, 0, 3, 3, 0,
						4, 8, 5, -1, -4, -5, -4, 0, 2, 3, 3, 1, -5, -7, -7, -4, 0, -5, -5, -6,
						-4, 0, 3, 4, 4, 2, 0, -5, -8, -5, -1, -6, -7, -6, 1, 2, 5, 4, 3, 0,
						-3, -5, -3, 0, 3, 5, 6, 3, 1, -3, -4, -4, -2, 0, 3, 5, 5, 3, 0, -3,
						-2, 1, 2, 2, 0, -1, 0
					],
					[
						0, 0, 1, 1, 1, 0, -3, -5, -4, 0, -4, -6, -5, -3, 0, 6, 5, 0, -2, -4,
						-4, -2, 0, 7, 7, 1, -3, -3, -1, 3, 4, 3, 1, -5, -6, -4, 0, 3, 4, 0,
						-4, -6, -3, -1, 2, 2, 3, 2, 0, -3, -6, -5, -4, 0, 3, 2, 1, -4, -3, 0,
						3, 3, 0, -1, -3, -2, -1, 0, 4, 4, -1, -3, -3, -4, -2, 0, 4, 4, 1, -3,
						-4, -1, 1, 3, 3, 2, 0, -2, -3, 0, 5, 4, 0, 4, 3, -1, 4, 4, 5, 3,
						-1, -2, -2, -2, -1, -2, 2, 4, 5, 2, 0, -3, -4, -3, 0, -3, -6, -4, 1, 3,
						6, 6, 3, 0, -3, -3, -2, 0, 4, 4, 0, -5, -5, -5, 0, -4, -4, -4, 0, 5,
						6, 5, 0, -4, -4, 0, 5, 4, 0, -4, -6, -4, -1, 4, 6, 6, 4, 0, -4, -5,
						-4, 0, 4, 4, 0, -4, -6, -5, 0, 3, 6, 6, 4, 0, -4, -5, -4, 0, 3, 6,
						6, 3, 0, -3, -8, -7, -4, 1, 3, 6, 6, 5, 0, -3, -5, -4, 0, 5, 8, 8,
						5, 0, -2, -4, -3, 0, 3, 3, 0, -3, -5, -5, -4, -3, 0, 4, 7, 4, -1, -3,
						-4, 1, 4, 7, 4, 0, -1, -3, -3, -2, 0, 3, 4, 5, 3, 0, -3, -5, -5, -3,
						1, 3, 5, 3, 1, -3, -5, -4, -2, 1, 2, 3, 0, -2, -2, -3, 0, -3, -3, -3,
						-2, 0, 1, 1, 1, 0, 0
					],
					[
						0, 0, 1, 2, 1, 0, -3, -4, -4, 0, 7, 7, 0, -4, -7, -8, -7, -4, 0, 5,
						5, 0, -2, -5, -5, -3, -1, 6, 8, 5, 0, -7, -6, 0, 5, 5, 0, -5, -6, -1,
						4, 8, 6, 0, 3, 7, 6, 4, -1, -5, -7, -8, -5, 0, 3, 3, -1, -5, -5, 0,
						3, 2, 0, -5, -6, -4, 0, 5, 6, 4, 0, -3, -4, 0, 4, 6, 4, 0, -1, -2,
						-3, -1, 0, 4, 3, 1, -2, -2, 0, 4, 4, 3, 0, -2, -3, -3, 0, 2, 4, 3,
						3, 0, 2, 3, 3, 4, 2, 0, -2, -1, 0, 4, 4, 3, 0, 3, 4, 0, -4, -4,
						-2, -1, 3, 4, 0, -3, -3, 0, -2, -3, -3, -2, 0, 5, 5, 1, -5, -4, 0, 2,
						3, 0, 3, 4, 4, 2, 1, -5, -7, -7, -4, 0, 4, 7, 6, 4, 0, -4, -6, -7,
						-4, 0, 3, 4, 0, -4, -6, -4, 0, 3, 7, 6, 6, 3, -1, -5, -5, 0, 4, 5,
						4, 2, 1, -6, -6, 0, 3, 5, 6, 4, 1, -4, -5, -5, -3, 0, 5, 9, 8, 4,
						0, -3, -4, -4, -3, 0, 3, 4, 3, 1, -5, -4, 0, 6, 8, 0, -3, -4, -5, -3,
						-1, 4, 5, 5, 0, -4, -7, -4, -1, 4, 6, 6, 3, 0, -4, -6, -6, -4, 0, 3,
						3, 3, 0, -3, -5, -5, -3, 0, 2, 4, 5, 4, 2, 0, -3, -2, 1, -2, -3, -3,
						-1, 0, 1, 1, 0, 0, 0
					]
				]
			};
			// Segment-playback state for vfib
			chart.vfib.segIdx = 0;
			chart.vfib.sampleIdx = 0;

			// Store reference waveforms for dynamic resampling (the lowest-rate [0] arrays).
			// vtach3, vfib, cpr, and defib are excluded — they use their own generation paths.
			chart.ekg.rhythmRef['sinus']    = chart.ekg.rhythm['sinus'][0].slice();
			chart.ekg.rhythmRef['afib']     = chart.ekg.rhythm['afib'][0].slice();
			chart.ekg.rhythmRef['vtach1']   = chart.ekg.rhythm['vtach1'][0].slice();
			chart.ekg.rhythmRef['vtach2']   = chart.ekg.rhythm['vtach2'][0].slice();
			chart.ekg.rhythmRef['asystole'] = chart.ekg.rhythm['asystole'][0].slice();
			chart.ekg.rhythmRef['vpc1']     = chart.ekg.rhythm['vpc1'][0].slice();
			chart.ekg.rhythmRef['vpc2']     = chart.ekg.rhythm['vpc2'][0].slice();

			// Initialize active waveform to asystole (flatline at startup)
			chart.ekg.activeWaveform = chart.ekg.rhythm['asystole'][0].slice();
			chart.ekg.length = chart.ekg.activeWaveform.length;
			chart.ekg.beepValue = chart.ekg.rhythm['asystole'][0].max() * -1;

			// start the pattern
			chart.ekg.interval = setInterval(chart.drawEkgPixel, chart.ekg.drawInterval);
						
			/************************** Respiration **********************************/
			// init respiration
			chart.initStrip('resp');
			
			// init rhythm patterns
			chart.resp.rhythm['high-to-low'] = new Array;
			chart.resp.rhythm['low-to-high'] = new Array;
			chart.resp.rhythm['high'] = new Array;
			chart.resp.rhythm['high-to-low'][0] = [	
				61.5493449,60.72807351,58.85943707,50.48641877,
				36.93296859,24.22481363,11.00608487,2.468408594,0.877075091,
				0.334116028,0.292495125,0
//				60,52,44,36,28,24,20,15,8
			];
			chart.resp.rhythm['high-to-low'][1] = [	
				61.5493449,60.72807351,58.85943707,50.48641877,
				36.93296859,24.22481363,11.00608487,2.468408594,0.877075091,
				0.334116028,0.292495125,0
//				60,52,44,36,28,24,20,15,8
			];
			chart.resp.rhythm['high-to-low'][2] = [	
				61.5493449,60.72807351,58.85943707,50.48641877,
				36.93296859,24.22481363,11.00608487,2.468408594,0.877075091,
				0.334116028,0.292495125,0			
			];
			chart.resp.rhythm['high-to-low'][3] = [	
				60.72807351, 50.48641877, 24.22481363, 2.468408594, 0.334116028
			];
			chart.resp.rhythm['high-to-low'][4] = [	
				30
			];
			chart.resp.rhythm['low'] = [	
				0
			];
			chart.resp.rhythm['rest'] = [	
				0,0,0
			];
			chart.resp.rhythm['low-to-high'][0] = [	
				0.110304316,0.204757313,0.444808642,1.440832926,3.047279566,
				5.909726892,12.58774301,24.91583508,37.12211491,44.30213386,
				46.80024109,48.49503321,49.89641132,50.9500952,51.83944314,
			];
			chart.resp.rhythm['low-to-high'][1] = [	
				0.204757313,0.444808642,1.440832926,3.047279566,
				5.909726892,12.58774301,24.91583508,37.12211491,44.30213386,
				46.80024109,48.49503321,49.89641132,50.9500952
			];
			chart.resp.rhythm['low-to-high'][2] = [	
				1.440832926,
				5.909726892,24.91583508,44.30213386,
				48.49503321,50.9500952
			];
			chart.resp.rhythm['low-to-high'][3] = [	
				12.58774301,// 37.12211491,
				46.80024109,// 49.89641132,
				50.9500952
			];
			chart.resp.rhythm['low-to-high'][4] = [	
				30
			];

			chart.resp.rhythm['high'][0] = [	
				52,62
			];
			chart.resp.rhythm['high'][1] = [	
				54,62
			];
			chart.resp.rhythm['high'][2] = [	
				54,62
			];
			chart.resp.rhythm['high'][3] = [	
				56,62
			];
			chart.resp.rhythm['high'][4] = [
				56,62
			];

			// Curare cleft: normalized amplitude profile (0=baseline, 1=peak) applied to the
			// plateau phase when waveformType === 'curare'. The dip at roughly the mid-plateau
			// represents diaphragmatic effort against the ventilator (light anesthesia or
			// insufficient neuromuscular blockade).
			chart.resp.rhythm['cleft'] = [1.0, 1.0, 1.0, 0.95, 0.83, 0.76, 0.76, 0.83, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0];

			chart.resp.manualBreathPattern = [	// approximate 300 msec waveform
				0.110304233,0.110304233,0.110304233,0.110304233,0.110304233,
				0.110304233,0.110304233,0.110304233,0.110304233,0.110304233,
				0.110304316,0.204757313,0.444808642,1.440832926,3.047279566,
				5.909726892,12.58774301,24.91583508,37.12211491,44.30213386,
				46.80024109,48.49503321,49.89641132,50.9500952,51.83944314,
				52.67463999,53.16772702,53.59644724,53.8281222,54.26381362,
				54.49252225,54.93136691,55.1664858,55.59261397,56.04765394,
				56.25591856,56.46471241,56.92293194,57.36708998,57.80026169,
				58.01810818,58.40573427,58.67420683,59.01728293,59.37400285,
				59.78660762,60.2297822,60.4456987,60.89843097,61.10002117,
				61.55049417,61.5493449,60.72807351,58.85943707,50.48641877,
				36.93296859,24.22481363,11.00608487,2.468408594,0.877075091,
				0.334116028,0.292495125,0
			];
			
			// get max value
			chart.resp.max = chart.resp.rhythm['high'].max();
			
			// max inhalation duration
			chart.resp.maxInhalationDuration = Math.floor( 1500 / chart.resp.drawInterval );
			
			// get max displayed value
			chart.getETC02MaxDisplay();

			// paint the ETCO2 reference scale across the whole strip so it is there
			// before the first sweep; after this it is maintained by drawRespPixel
			chart.redrawStripScale('resp');
			chart.resp.scaleWasVisible = chart.stripVisible('resp');

			// beep indicator
			if(chart.ekg.beepFlag == true){
				$('#ekg-sound').html('Turn EKG Sound OFF!').removeClass('play').addClass('pause')
			} else {
				$('#ekg-sound').html('Turn EKG Sound ON!').removeClass('pause').addClass('play')			
			}
			
			// setup pattern length
			chart.resp.length = chart.resp.rhythm[chart.resp.rhythmIndex].length;

			// start the pattern
			chart.resp.interval = setInterval(chart.drawRespPixel, chart.resp.drawInterval, "resp");

//console.log("chart.resp.interval: " + chart.resp.interval);
//console.log("chart.resp.drawInterval: " + chart.resp.drawInterval);

			// init respiration
			chart.updateRespRate();
			controls.awRR.setSynch();

			// Re-fit when the window changes size or the student display goes
			// full screen. Debounced: a drag generates a resize per frame and
			// each one reallocates every canvas backing store.
			if( document.getElementById('vsm-frame') ) {
				var refit = function() {
					clearTimeout( chart.resizeTimer );
					chart.resizeTimer = setTimeout( chart.handleResize, 150 );
				};
				window.addEventListener('resize', refit);
				// A window resize event is not the only way the drawing area
				// changes size: the page may simply be laid out after this ran, or
				// sit in a host view whose bounds are applied later. Watching the
				// document element catches those without any resize event.
				if( typeof ResizeObserver !== 'undefined' ) {
					try {
						new ResizeObserver(refit).observe(document.documentElement);
					} catch(e) {
						// not fatal - the resize listener and the retries still apply
					}
				}
				// belt and braces for a viewport that settles after load
				setTimeout( chart.handleResize, 250 );
				setTimeout( chart.handleResize, 1000 );
			}

			/************************** Plethysmograph ***********************/
			if( document.getElementById(chart.pleth.id) ) {
				chart.initStrip('pleth');
				chart.initPlethWaveforms();
				chart.pleth.lastDisplayedY = chart.pleth.yOffset + chart.pleth.yDisplayOffset;
				chart.pleth.scaleWasVisible = chart.stripVisible('pleth');
				chart.pleth.interval = setInterval(chart.drawPlethPixel, chart.pleth.drawInterval);
			}

			/************************** Arterial pressure ********************/
			// only when this page carries the strip - vitals.php and ii.php may
			// legitimately show different channel sets
			if( document.getElementById(chart.abp.id) ) {
				chart.initStrip('abp');
				chart.initAbpWaveforms();
				chart.abp.lastDisplayedY = chart.stripScaleY('abp', 0);
				chart.redrawStripScale('abp');
				chart.abp.scaleWasVisible = chart.stripVisible('abp');
				chart.abp.interval = setInterval(chart.drawAbpPixel, chart.abp.drawInterval);
			}

			/************************** PA catheter **************************/
			// The channel starts disabled and is switched on by controls.pac when a
			// catheter is placed, so the strip is initialised here but claims no
			// layout space until then.
			if( document.getElementById(chart.pac.id) ) {
				chart.initStrip('pac');
				chart.initPacWaveforms();
				chart.pac.lastDisplayedY = chart.stripScaleY('pac', 0);
				chart.pac.scaleWasVisible = false;
				chart.pac.interval = setInterval(chart.drawPacPixel, chart.pac.drawInterval);
				if( typeof controls !== 'undefined' && controls.pac && controls.pac.placed ) {
					chart.setChannelEnabled('pac', true);
				}
			}
		},
		
		// Passed the cardiac data from simmgr status
		updateCardiac: function( cardiac) {
			if(controls.cpr.inProgress == true) {
				chart.ekg.rateIndex = 0;
			} else if ( cardiac.rate <= 0 ) {
				// Rate is zero (pulseless rhythm such as asystole or vfib).
				// Update activeWaveform so the draw loop uses the correct waveform for the
				// current rhythm rather than whatever the previous rhythm left behind.
				// updateEkgWaveform handles rate=0 safely (copies ref as-is); rhythms like
				// vfib that have no rhythmRef return early and use their own draw path.
				chart.updateEkgWaveform(chart.ekg.rhythmIndex, cardiac.rate);
			} else {
				// Reset vfib segment playback state whenever the rhythm switches to vfib.
				if(chart.ekg.rhythmIndex === 'vfib') {
					chart.vfib.segIdx = Math.floor(Math.random() * 6);
					chart.vfib.sampleIdx = 0;
				}

				// Dynamically resample the active waveform to fit the current heart rate.
				// Rhythms without a rhythmRef (vfib, vtach3, cpr, defib) use their own
				// generation paths and are unaffected.
				chart.updateEkgWaveform(chart.ekg.rhythmIndex, cardiac.rate);

				// VPC handling still uses the rateIndex lookup (separate from main rhythm)
				if(chart.ekg.rhythmIndex == 'sinus' && controls.heartRhythm.vpc != 'none') {
					if( cardiac.rate <= 65 ) {
						chart.ekg.vpcRateIndex = 0;
					}
					else if( cardiac.rate <= 115 ) {
						chart.ekg.vpcRateIndex = 1;
					}
					else {
						chart.ekg.vpcRateIndex = 2;
					}

					// calculate length of VPC
					chart.ekg.vpcLength = chart.ekg.rhythm[controls.heartRhythm.vpc][chart.ekg.vpcRateIndex].length;

					// calculate vpc synch delay 1.4X of heart rate (or 70%) minus width of sinus pulse
					chart.ekg.vpcSynchDelay = Math.floor(((60 / cardiac.rate) * chart.ekg.vpcAdvanceDelay) / chart.ekg.drawInterval);

					// set these 2 params to kick off a series of VPC's.
					chart.ekg.vpcCount = -1;
					chart.ekg.vpcSynchDelayCount = 0;

					chart.ekg.vpcPatternIndex = 0;
				}
			}

			if ( typeof ( chart.ekg.rhythm[chart.ekg.rhythmIndex] ) === 'undefined' )
			{
//				console.log("No EKG Rhythm "+chart.ekg.rhythmIndex );
				chart.ekg.rhythmIndex = 'asystole';	// Flatline
				chart.ekg.rateIndex = 0;
			}
			
			if(chart.ekg.patternIndex >= chart.ekg.length) {
				// Advance to the next CPR artifact waveform if cpr is happening
				//chart.cpr.waveformIndex++;
				chart.ekg.patternIndex = 0;
			}

			chart.heartRate = cardiac.rate;
			controls.heartRate.value = cardiac.rate;
			if ( typeof simsound !== 'undefined' )
			{
				simsound.lookupHeartSound();
			}
//console.log(cardiac );
//console.log(cardiac.rate);
//console.log(chart.ekg.rhythmIndex);
		},
		initStrip: function(stripType) {
			chart[stripType].canvas = document.getElementById(chart[stripType].id);
			chart[stripType].ctx = chart[stripType].canvas.getContext("2d");
			chart[stripType].xPos = chart[stripType].xOffsetLeft;
			// Where the strip's zero/baseline sits, as a fraction of its height.
			// The ECG and capnograph centre it (deflections either side); the
			// arterial trace puts it near the floor so the whole strip carries
			// pressure. Defaults to 0.5, which is what the first two have always
			// used, so this changes nothing for them.
			var baselineFraction = ( typeof chart[stripType].baselineFraction === 'number' )
									? chart[stripType].baselineFraction : 0.5;
			chart[stripType].yOffset = chart[stripType].lastY = Math.floor(chart[stripType].height * baselineFraction);

			// fallback for a strip the layout manager didn't size (no channel entry)
			if( ! chart[stripType].ampScale ) {
				chart[stripType].ampScale = chart[stripType].height / chart.REFERENCE_STRIP_HEIGHT;
			}

			// The backing store is in device pixels; this makes every draw call
			// below work in design pixels instead. applyLayout() sets the same
			// transform, but it runs before the context exists on first init.
			chart[stripType].ctx.setTransform( chart.renderScale(), 0, 0, chart.renderScale(), 0, 0 );

			// width of the drawable strip, in design pixels
			var designWidth = chart.layout.stripWidth;
			if( ! designWidth ) {
				designWidth = $('#' + chart[stripType].id).width();
			}
			chart[stripType].width = designWidth - chart[stripType].xOffsetLeft - chart[stripType].xOffsetRight;
			return;
		},
		
		// routine to initialize vtach 3 R on T values based on heart rate sinusoidal
		// updated amplitude setting per Dan F - 2024-03-04
		initVtach3: function() {
			chart.ekg.rhythm.vtach3[0] = new Array;
			xIncr = (controls.heartRate.value * chart.ekg.drawInterval * Math.PI) / 60000;
//			var amplitude = chart.ekg.height / 2;
			// reference-height amplitudes - scaled by ampScale in drawEkgPixel
			var amplitude = chart.REFERENCE_STRIP_HEIGHT / 2.5;
			var offset = chart.REFERENCE_STRIP_HEIGHT / 2;
			var index = 0;
			for(var x = 0; x <= Math.PI; x += xIncr) {
//				chart.ekg.rhythm.vtach3[0][index] = (Math.sin(x) * -amplitude) + 10;
				chart.ekg.rhythm.vtach3[0][index] = (Math.sin(x*2) * -amplitude) + 10;
				index++;
			}
		},

		// Resample a waveform array to a new length using linear interpolation.
		// Values are rounded to integers to preserve the integer precision of the
		// original arrays (important for the beepValue equality check in drawEkgPixel).
		// If targetLength >= ref.length, returns a copy without upsampling.
		//
		// Peak-preserving: the sample position nearest to the maximum value is
		// snapped to land exactly on it, preventing the R wave from being skipped
		// when aggressive downsampling causes uniform spacing to miss the peak.
		resampleWaveform: function(ref, targetLength) {
			if(targetLength >= ref.length) return ref.slice();

			// Find the index of the maximum value (R wave peak) — must be preserved
			var peakIdx = 0;
			for(var i = 1; i < ref.length; i++) {
				if(ref[i] > ref[peakIdx]) peakIdx = i;
			}

			// Build sample positions: uniform spacing with the nearest position
			// snapped to peakIdx so the peak amplitude is always captured exactly.
			var scale = (ref.length - 1) / (targetLength - 1);
			var snapTo = Math.round(peakIdx / scale);           // nearest uniform slot
			snapTo = Math.max(0, Math.min(snapTo, targetLength - 1));

			var positions = new Array(targetLength);
			for(var i = 0; i < targetLength; i++) {
				positions[i] = (i === snapTo) ? peakIdx : i * scale;
			}

			// Interpolate at each position
			var result = new Array(targetLength);
			for(var i = 0; i < targetLength; i++) {
				var pos = positions[i];
				var lo = Math.floor(pos);
				var hi = Math.min(lo + 1, ref.length - 1);
				var frac = pos - lo;
				result[i] = Math.round(ref[lo] * (1 - frac) + ref[hi] * frac);
			}
			return result;
		},

		// Compute and store the active waveform for the given rhythm and heart rate.
		// Dynamically resamples the reference ([0]) waveform so the complex width
		// scales smoothly with rate, replacing the 4-level rateIndex lookup table.
		// complexFraction controls what fraction of the RR interval the complex occupies.
		updateEkgWaveform: function(rhythmIndex, heartRate) {
			// vtach3 is a sine wave regenerated by initVtach3() before this is called
			if(rhythmIndex == 'vtach3') {
				chart.ekg.activeWaveform = chart.ekg.rhythm['vtach3'][0].slice();
				chart.ekg.length = chart.ekg.activeWaveform.length;
				return;
			}

			var ref = chart.ekg.rhythmRef[rhythmIndex];
			if(!ref) {
				// No reference defined (e.g. vfib, cpr, defib) — those rhythms use
				// their own generation paths and don't need activeWaveform.
				return;
			}

			if(heartRate <= 0) {
				chart.ekg.activeWaveform = ref.slice();
				chart.ekg.length = ref.length;
				return;
			}

			var complexFraction = 0.75;
			var period = Math.round(60000 / heartRate / chart.ekg.drawInterval);
			var targetLength = Math.min(ref.length, Math.max(5, Math.floor(period * complexFraction)));
			chart.ekg.activeWaveform = chart.resampleWaveform(ref, targetLength);
			chart.ekg.length = chart.ekg.activeWaveform.length;
			chart.ekg.beepValue = Math.max.apply(null, chart.ekg.activeWaveform) * -1;
		},
		
		drawEkgPixel: function() {
			// Only a PAUSED scenario freezes the student display.
			//
			// Deliberately not STOPPED: scenarioState.STOPPED is 0 and that is the
			// state the monitor sits in whenever no scenario is running, which is
			// most of the time - the simulator runs perfectly well without one.
			// Halting here would blank the monitor for good after a terminate and
			// stop a newly connected sensor from ever drawing. Terminating wipes
			// the screen once, via chart.blankMonitor(); it does not switch the
			// simulator off.
			if(scenario.currentScenarioState == scenario.scenarioState.PAUSED && profile.isVitalsMonitor) {
				return;
			}

			var y;

			// Create the 'cursor' by clearing out a 10px wide section in front of the pixel
			chart.drawCursor('ekg');
	
//console.log(chart.ekg.patternIndex)

			if ( ( profile.isVitalsMonitor == false ) || ( controls.ekg.leadsConnected == true ) || simmgr.isTeleSim() == true ) {
				// see if we need to draw waveform or if we are in background
				if(chart.ekg.stopFlag == true) {
					y = 0;
					controls.heartRate.audio.pause();
				} else if(controls.cpr.inProgress == true) {
					y = chart.ekg.rhythm.cpr[chart.ekg.cprwaveformIndex][chart.ekg.patternIndex];
					controls.heartRate.value = 120;
					chart.ekg.length = chart.ekg.rhythm.cpr[chart.ekg.cprwaveformIndex].length;
					
					// increment pointers
					chart.ekg.patternIndex++;
//				} else if( controls.cpr.running == 1) {
					// if we get here then we are in the 2 second runout of the cpr waveform.
					// generate noise value.
//					y = Math.floor((Math.random() * chart.ekg.noiseMax));
//					if(y > (chart.ekg.noiseMax / 2)) {
//						y -= (chart.ekg.noiseMax / 2);
//					}
//					chart.ekg.patternIndex = 0;					
				} else if(chart.ekg.rhythmIndex == 'defib') {
					y = chart.ekg.rhythm[chart.ekg.rhythmIndex][chart.ekg.patternIndex];
					
					// increment pointers
					chart.ekg.patternIndex++;				
				} else if(chart.ekg.rhythmIndex == 'sinus' || chart.ekg.rhythmIndex == 'vtach1' || chart.ekg.rhythmIndex == 'vtach2') {
					// check if we are doing a vpc.  VPC synch will only get set when the vpc needs to be generated
					if(chart.status.cardiac.vpcSynch == true && chart.ekg.patternIndex == 0 && chart.status.cardiac.synch == false) {
						// are there vpc's to generate?
						if(chart.ekg.vpcCount > 0) {
							// see if we need to generate the delay
							if(chart.ekg.vpcSynchDelayCount > 0) {
								// generate noise
								y = chart.getEKGNoisePixel();
// y = -30;
								chart.ekg.vpcSynchDelayCount--;
							} else {
								// generate the pattern
								y = chart.ekg.rhythm[controls.heartRhythm.vpc][chart.ekg.vpcRateIndex][chart.ekg.vpcPatternIndex] * -1;
								chart.ekg.vpcPatternIndex++;
								
								// are we done with the pattern?
								if(chart.ekg.vpcPatternIndex >= chart.ekg.vpcLength) {
									chart.ekg.vpcPatternIndex = 0;
									chart.ekg.vpcCount--;
									
									// reset synch delay minus width of vpc pattern
									chart.ekg.vpcSynchDelayCount = chart.ekg.vpcSynchDelay - chart.ekg.length;
								}
							}
						} else {
							chart.status.cardiac.vpcSynch = false;						
							y = chart.getEKGNoisePixel();
						}

					} else if((chart.status.cardiac.synch == false && chart.ekg.patternIndex == 0) || controls.heartRate.value == 0) {
						// see if we are doing a vpc...here is where we would generate noise or the pre-vpc delay
						y = chart.getEKGNoisePixel();						
					} else if(chart.status.cardiac.synch == true || chart.ekg.patternIndex > 0) {
						y = chart.ekg.activeWaveform[chart.ekg.patternIndex] * -1;
						if ( typeof simsound !== 'undefined' && chart.status.cardiac.synch == true )
						{
							simsound.playHeartSound();
						}
						
						// beep?
						if(y == chart.ekg.beepValue && chart.ekg.beepFlag == true && chart.ekg.stopFlag == false) {
							// controls.heartRate.audio.load();  // Don't do this!!
							controls.heartRate.audio.play();
						}
						
						// increment pointers
						chart.ekg.patternIndex++;
					}
										
				} else if(chart.ekg.rhythmIndex == 'afib') {
					if(chart.status.cardiac.synch == false && chart.ekg.patternIndex == 0) {
						// generate slow noise between range
						y = chart.vfib.base + chart.getafibBase();
						
					} else if(chart.status.cardiac.synch == true || chart.ekg.patternIndex > 0) {
						y = chart.ekg.activeWaveform[chart.ekg.patternIndex] * -1;

						if ( typeof simsound !== 'undefined' )
						{
							//simsound.playHeartSound();
						}
						// beep?
						if(y == chart.ekg.beepValue && chart.ekg.beepFlag == true && chart.ekg.stopFlag == false) {
							// controls.heartRate.audio.load();  // Don't do this!!
							controls.heartRate.audio.play();
						}
						
						// increment pointers
						chart.ekg.patternIndex++;
					}
				} else if(chart.ekg.rhythmIndex == 'asystole') {
					y = chart.ekg.activeWaveform[chart.ekg.patternIndex] * -1;

					// generate random noise between range
					y += Math.floor((Math.random() * chart.ekg.noiseMax));
					if(y > (chart.ekg.noiseMax / 2)) {
						y -= (chart.ekg.noiseMax / 2);
					}

					// increment pointers
					chart.ekg.patternIndex++;
				} else if(chart.ekg.rhythmIndex == 'vtach3') {
					y = chart.ekg.activeWaveform[chart.ekg.patternIndex];
					
					// increment pointers
					chart.ekg.patternIndex++;
				} else if(chart.ekg.rhythmIndex == 'vfib') {
					// Look up grade: 'high' = coarse, 'med' = medium, 'low' = fine.
					var vfibGrade = controls.heartRhythm.vfibAmplitude || 'high';
					if(vfibGrade === 'medium') { vfibGrade = 'med'; }
					var vfibSegs = chart.ekg.vfibSegments[vfibGrade];
					if(!vfibSegs) { vfibSegs = chart.ekg.vfibSegments['high']; }
					y = vfibSegs[chart.vfib.segIdx][chart.vfib.sampleIdx] * -1;
					chart.vfib.sampleIdx++;
					if(chart.vfib.sampleIdx >= vfibSegs[chart.vfib.segIdx].length) {
						chart.vfib.sampleIdx = 0;
						var nextSeg;
						do { nextSeg = Math.floor(Math.random() * vfibSegs.length); }
						while(nextSeg === chart.vfib.segIdx && vfibSegs.length > 1);
						chart.vfib.segIdx = nextSeg;
					}
				}
				
				// clear out sync flag
				if(chart.status.cardiac.synch == true) {
					if( (chart.ekg.periodCount > 0) && (parseInt(controls.heartRate.value) > parseInt(simmgr.cardiacResponse.rate)) ) {
						chart.updateCardiacRate();
					} else {
						chart.status.cardiac.synch = false;
					}
					
					// reset tick count
					chart.ekg.pixelCount = 0;
				} else {
					chart.ekg.pixelCount++;
					if( (chart.ekg.periodCount > 0) && (chart.ekg.pixelCount >= (chart.ekg.periodCount)) ) {
						chart.updateCardiacRate();
					}
				}
				
				// are we beyond pattern?
				if(chart.ekg.patternIndex >= chart.ekg.length) {
					if(controls.cpr.inProgress == true) {
						//if(chart.ekg.cprwaveformIndex==2){
						//	chart.ekg.cprwaveformIndex=0;
						//} else {
						chart.ekg.cprwaveformIndex = Math.floor((Math.random() * 3));
						//}
					}
					
					if(controls.defib.shock == 1) {
						// keep patternindex on 0
//						chart.ekg.patternIndex--;
						// generate random noise between range
						y = Math.floor((Math.random() * chart.ekg.noiseMax));
						if(y > (chart.ekg.noiseMax / 2)) {
							y -= (chart.ekg.noiseMax / 2);
						}
					} else {
						chart.ekg.patternIndex = 0;
					}
				}
			} else {
				y = 0;
			}
			
			// scale the reference-height waveform to this strip's actual height
			y = y * chart.ekg.ampScale;

			y += chart.ekg.yOffset + chart.ekg.yDisplayOffset;

			// create stroke
			chart.ekg.ctx.lineWidth = 2;
			if ( ( profile.isVitalsMonitor == false ) || ( controls.ekg.leadsConnected == true ) )
			{
				chart.ekg.ctx.strokeStyle = chart.ekg.color;
			}
			else
			{
				chart.ekg.ctx.strokeStyle = 'black';
			}
			chart.ekg.ctx.beginPath();
			chart.ekg.ctx.moveTo(chart.ekg.xPos, chart.ekg.lastY);
			
			// increment xpos
			chart.ekg.xPos++;
			
			chart.ekg.ctx.lineTo(chart.ekg.xPos, y);
			chart.ekg.ctx.stroke();
						
			// save last values for next segment
			chart.ekg.lastY = y;
			
			// see if we are beyond end of chart
			if((chart.ekg.xPos + chart.ekg.xOffsetRight) > chart.ekg.width) {
				chart.ekg.xPos = chart.ekg.xOffsetLeft;
				chart.ekg.ctx.fillRect(0, 0, chart.ekg.xOffsetLeft, chart.ekg.height);
			}
		},
		
		drawCursor: function(stripType) {
			// Create the 'cursor' by clearing out section in front of the pixel
			chart[stripType].ctx.fillStyle="black";
			chart[stripType].ctx.clearRect(chart[stripType].xPos, 0, chart.cursorWidth, chart[stripType].height );
		},

		// True when a channel's trace (and therefore its scale) should be drawn.
		// Always on for the instructor; sensor-dependent on the student monitor.
		stripVisible: function(key) {
			var ch = chart.channelFor(key);
			if( ! ch || ! ch.enabled ) {
				return false;
			}
			if( typeof profile === 'undefined' || typeof controls === 'undefined' ) {
				return true;			// called before the page state exists (init)
			}
			if( ! ch.visible ) {
				return true;
			}
			try {
				return ch.visible() ? true : false;
			} catch(e) {
				return true;			// a control not built yet must not blank the strip
			}
		},

		// True when the strip has a reference scale and it should be painted.
		stripScaleVisible: function(key) {
			var ch = chart.channelFor(key);
			if( ! ch || ! ch.scale || ! ch.scale.enabled ) {
				return false;
			}
			return chart.stripVisible(key);
		},

		// A channel's gridlines may be a fixed array or a function, so a scale that
		// ranges with its data (the PA catheter's does) can move its lines with it.
		scaleLines: function(cfg) {
			if( ! cfg || ! cfg.lines ) {
				return [];
			}
			return ( typeof cfg.lines === 'function' ) ? cfg.lines() : cfg.lines;
		},

		// y (canvas pixels) of a value on a strip's reference scale.
		stripScaleY: function(key, value) {
			var ch = chart.channelFor(key);
			var strip = chart[key];
			if( ! ch || ! ch.scale || ! strip ) {
				return 0;
			}
			var maxValue = ch.scale.maxValue();
			if( ! maxValue ) {
				maxValue = 100;
			}
			var zeroY = strip.yOffset + strip.yDisplayOffset;
			// fullScaleAmplitude is a reference-height figure, so it takes the same
			// ampScale the waveform does - the scale tracks the trace at any size
			var fullScale = ch.scale.fullScaleAmplitude * strip.ampScale;
			return Math.round( zeroY - ( value * fullScale / maxValue ) );
		},

		// Repaint the reference lines across [xStart, xStart + width). Called with
		// the cursor band each tick, so the lines survive the sweep that clears it.
		drawStripScale: function(key, xStart, width) {
			if( ! chart.stripScaleVisible(key) ) {
				return;
			}
			var strip = chart[key];
			var ctx = strip.ctx;
			if( ! ctx ) {
				return;
			}
			var cfg = chart.channelFor(key).scale;
			var st = chart.scaleStyle;
			var lines = chart.scaleLines(cfg);
			var x0 = Math.max( strip.xOffsetLeft, Math.floor( xStart ) );
			var x1 = Math.min( strip.width + 2, Math.ceil( xStart + width ) );
			if( x1 <= x0 ) {
				return;
			}

			var savedFill = ctx.fillStyle;

			for( var i = 0; i < lines.length; i++ ) {
				var y = chart.stripScaleY( key, lines[i].value );
				if( y < 0 || y >= strip.height ) {
					continue;			// off the strip at this scaling
				}
				if( lines[i].value == 0 ) {
					// zero line: solid, 1px (the waveform itself is drawn 2px)
					ctx.fillStyle = st.zeroColor;
					ctx.fillRect( x0, y, x1 - x0, 1 );
				} else {
					// gridline: 1px dots on an absolute x grid so the dash phase
					// stays continuous from one repainted band to the next
					ctx.fillStyle = st.lineColor;
					var dashStart = Math.floor( x0 / st.dashPeriod ) * st.dashPeriod;
					for( var dx = dashStart; dx < x1; dx += st.dashPeriod ) {
						var a = Math.max( dx, x0 );
						var b = Math.min( dx + st.dashLength, x1 );
						if( b > a ) {
							ctx.fillRect( a, y, b - a, 1 );
						}
					}
				}
			}

			ctx.fillStyle = savedFill;
		},

		// Paint the numeric labels in the left gutter. The gutter sits to the left of
		// xOffsetLeft, which the sweep never clears, so the labels stay put and only
		// need repainting when the strip wraps (the wrap blacks the gutter out).
		drawStripScaleLabels: function(key) {
			if( ! chart.stripScaleVisible(key) ) {
				return;
			}
			var strip = chart[key];
			var ctx = strip.ctx;
			if( ! ctx ) {
				return;
			}
			var cfg = chart.channelFor(key).scale;
			var st = chart.scaleStyle;
			var lines = chart.scaleLines(cfg);
			var savedFill = ctx.fillStyle;
			var savedFont = ctx.font;
			var savedBaseline = ctx.textBaseline;
			var savedAlign = ctx.textAlign;

			ctx.font = st.labelFont;
			ctx.textBaseline = 'middle';
			ctx.textAlign = 'right';
			ctx.fillStyle = st.labelColor;

			for( var i = 0; i < lines.length; i++ ) {
				if( ! lines[i].label ) {
					continue;
				}
				var y = chart.stripScaleY( key, lines[i].value );
				if( y < 0 || y >= strip.height ) {
					continue;			// off the strip at this scaling
				}
				// keep the glyphs on the canvas when a line is near an edge
				var textY = Math.min( Math.max( y, 6 ), strip.height - 6 );
				ctx.fillText( String( lines[i].value ), strip.xOffsetLeft - st.labelPad, textY );
			}

			ctx.fillStyle = savedFill;
			ctx.font = savedFont;
			ctx.textBaseline = savedBaseline;
			ctx.textAlign = savedAlign;
		},

		// Blank the label gutter (channel switched off on the vitals monitor).
		clearStripScaleLabels: function(key) {
			var strip = chart[key];
			if( strip && strip.ctx ) {
				strip.ctx.clearRect( 0, 0, strip.xOffsetLeft, strip.height );
			}
		},

		// Paint the whole scale at once - at init, and whenever a channel is
		// switched back on, so the scale doesn't creep in a band at a time.
		redrawStripScale: function(key) {
			var strip = chart[key];
			chart.drawStripScale( key, strip.xOffsetLeft, strip.width - strip.xOffsetLeft + 1 );
			chart.drawStripScaleLabels( key );
		},

		// ---------------------------------------------------------------------
		// Arterial blood pressure
		//
		// Each morphology is generated as an array of normalised samples spanning
		// one cardiac cycle, where 0 is the diastolic pressure and 1 the systolic.
		// Drawing maps that to mmHg and then through stripScaleY(), so the trace
		// and the pressure gridlines are guaranteed to agree at any strip height.
		//
		// The artifact morphologies deliberately do NOT span the full 0..1 range:
		// an overdamped trace reads falsely low in systole and falsely high in
		// diastole (narrowed pulse pressure), an underdamped one overshoots past
		// systole and undershoots diastole.
		//
		// The displayed numbers are derived from the min/max of the very array that
		// is drawn (see waveformRange below and controls.abp.displayedSystolic), so
		// the readout can never disagree with the trace - a monitor shows what its
		// transducer reports, artifact included.
		// ---------------------------------------------------------------------
		initAbpWaveforms: function() {
			var n = chart.abp.sampleCount;
			var types = ['normal', 'overdamped', 'underdamped', 'poor', 'cpr'];

			// Which morphologies are MEASUREMENT artifacts rather than physiological
			// states. The distinction matters for what the monitor displays:
			//
			//   overdamped / underdamped - the tubing and transducer distort what is
			//       reported, so the displayed numbers deviate from the set pressure.
			//       That deviation IS the artifact and is the teaching point.
			//
			//   normal / poor perfusion / CPR - the pressure is genuinely what it is.
			//       A poorly perfused patient set to 70/40 really is 70/40 and the
			//       monitor reads it correctly; only the shape of the pulse changes.
			//       These waveforms are normalised below so the trough lands exactly
			//       on diastolic and the peak exactly on systolic, whatever shape
			//       they are given - the reading cannot drift from the set pressure.
			var artifacts = { overdamped: true, underdamped: true };

			// smooth 0..1 ease used for the limb transitions
			var ease = function(t) { return 0.5 * ( 1 - Math.cos( Math.PI * Math.min( Math.max(t, 0), 1 ) ) ); };
			var seg  = function(t, a, b) { return a + ( b - a ) * ease(t); };

			for( var ti = 0; ti < types.length; ti++ ) {
				var type = types[ti];
				var arr = new Array(n);

				for( var i = 0; i < n; i++ ) {
					var p = i / n;			// phase through the cardiac cycle
					var v;

					switch( type ) {
						case 'overdamped':
							// slurred upstroke, rounded peak, no dicrotic notch, and
							// a floor well above true diastole: the classic narrowed
							// pulse pressure that reads falsely low AND falsely high
							if( p < 0.20 )      { v = seg( p / 0.20, 0.14, 0.76 ); }
							else if( p < 0.48 ) { v = seg( ( p - 0.20 ) / 0.28, 0.76, 0.52 ); }
							else                { v = 0.38 * Math.exp( -1.5 * ( p - 0.48 ) / 0.52 ) + 0.14; }
							break;

						case 'underdamped':
							// systolic overshoot followed by visible ringing, settling
							// below true diastole. The ring period is kept long enough
							// (about seven cycles per beat) to survive being sampled
							// at one pixel per draw tick - a faster ring aliases into
							// an invisible smear at normal heart rates.
							if( p < 0.07 )      { v = seg( p / 0.07, -0.06, 1.20 ); }
							else if( p < 0.32 ) { v = seg( ( p - 0.07 ) / 0.25, 1.20, 0.58 ); }
							else                { v = 0.64 * Math.exp( -2.6 * ( p - 0.32 ) / 0.68 ) - 0.06; }
							if( p >= 0.07 ) {
								v += 0.26 * Math.exp( -5.5 * ( p - 0.07 ) )
								   * Math.sin( 2 * Math.PI * ( p - 0.07 ) / 0.11 );
							}
							break;

						case 'poor':
							// slow upstroke, absent dicrotic notch, low amplitude and
							// a narrow pulse pressure - the low-output trace
							if( p < 0.26 )      { v = seg( p / 0.26, 0.08, 0.55 ); }
							else if( p < 0.54 ) { v = seg( ( p - 0.26 ) / 0.28, 0.55, 0.34 ); }
							else                { v = 0.26 * Math.exp( -2.0 * ( p - 0.54 ) / 0.46 ) + 0.08; }
							break;

						case 'cpr':
							// compression-generated pressure wave: rounded, no
							// dicrotic notch, near-zero between compressions
							if( p < 0.45 ) { v = Math.pow( Math.sin( Math.PI * p / 0.45 ), 0.9 ); }
							else           { v = 0.14 * Math.exp( -6.0 * ( p - 0.45 ) ); }
							break;

						default:	// 'normal'
							// rapid upstroke, systolic decline, dicrotic notch and
							// wave, then exponential diastolic runoff
							if( p < 0.09 )      { v = seg( p / 0.09, 0.0, 1.0 ); }
							else if( p < 0.30 ) { v = seg( ( p - 0.09 ) / 0.21, 1.0, 0.62 ); }
							else if( p < 0.35 ) { v = seg( ( p - 0.30 ) / 0.05, 0.62, 0.50 ); }
							else if( p < 0.42 ) { v = seg( ( p - 0.35 ) / 0.07, 0.50, 0.64 ); }
							else                { v = 0.64 * Math.exp( -3.2 * ( p - 0.42 ) / 0.58 ); }
							break;
					}
					arr[i] = v;
				}

				var mn = arr[0], mx = arr[0], k;
				for( k = 0; k < arr.length; k++ ) {
					if( arr[k] < mn ) { mn = arr[k]; }
					if( arr[k] > mx ) { mx = arr[k]; }
				}

				// A physiological shape must report the true pressure, so rescale it
				// to span exactly 0..1: trough on diastolic, peak on systolic. Only
				// the measurement artifacts keep their off-range excursions.
				if( ! artifacts[type] && mx > mn ) {
					for( k = 0; k < arr.length; k++ ) {
						arr[k] = ( arr[k] - mn ) / ( mx - mn );
					}
					mn = 0;
					mx = 1;
				}

				chart.abp.waveform[type] = arr;
				chart.abp.waveformDistorts[type] = ( artifacts[type] === true );

				// Record what this morphology spans. The displayed systolic and
				// diastolic of an artifact come straight from these, so retuning a
				// waveform above moves its numbers with it - they cannot drift apart.
				var sum = 0;
				for( k = 0; k < arr.length; k++ ) {
					sum += arr[k];
				}
				chart.abp.waveformRange[type] = { min: mn, max: mx, mean: sum / arr.length };
			}
		},

		// True when the morphology is a measurement artifact, and the numbers the
		// monitor displays therefore deviate from the pressure that was set.
		abpWaveformDistorts: function(type) {
			return chart.abp.waveformDistorts[type] === true;
		},

		// Fraction of the true pulse pressure that a morphology reaches at its peak
		// and trough. Used by controls.abp to derive the displayed pressures.
		abpWaveformRange: function(type) {
			var r = chart.abp.waveformRange[type];
			return r ? r : { min: 0, max: 1, mean: 1 / 3 };
		},

		// Which morphology to draw. Instructor-selected only.
		//
		// This deliberately does NOT auto-engage the CPR morphology from
		// controls.cpr.inProgress. That flag comes from cpr.compression, which the
		// controller raises on any large X/Y accelerometer excursion - including
		// simply moving the manikin (sim-ctl-master/cpr/cprScan.cpp). Driving the
		// arterial waveform from it would make the trace jump to a compression
		// pattern when someone repositions the patient.
		//
		// Selecting 'cpr' free-runs at ABP_CPR_RATE rather than following the ECG,
		// because compressions are not synchronised to the underlying rhythm. Real
		// per-compression synchronisation needs a debounced compression event from
		// the controller in the 40 ms quick status - see the changes document.
		abpWaveformType: function() {
			var t = ( typeof controls !== 'undefined' && controls.abp ) ? controls.abp.waveformType : 'normal';
			return chart.abp.waveform[t] ? t : 'normal';
		},

		// Queue the pressure pulse for a beat. Called from controls.heartRate.setSynch,
		// which is the beat event itself, so the ECG remains the single source of
		// beat timing and the pressure wave simply follows it.
		//
		// Deliberately NOT driven from chart.status.cardiac.synch: drawEkgPixel only
		// clears that flag inside its "leads connected or instructor interface"
		// branch, so on a student monitor with the ECG switched off the flag latches
		// true and any edge detector on it fires exactly once. An arterial line does
		// not stop working because the ECG electrodes came off.
		abpBeat: function() {
			if( ! chart.abp.ctx ) {
				return;
			}
			chart.abp.pendingDelay = Math.max( 1, Math.round( chart.ABP_TRANSIT_MSEC / chart.abp.drawInterval ) );
		},

		// Ticks in one cardiac cycle at the current rate, used as the pulse length
		// so the waveform always fills the interval between beats.
		abpCycleTicks: function() {
			var rate;
			if( chart.abpWaveformType() == 'cpr' ) {
				rate = chart.ABP_CPR_RATE;
			} else {
				rate = ( typeof controls !== 'undefined' && controls.heartRate ) ? controls.heartRate.value : 0;
			}
			if( ! rate || rate <= 0 ) {
				return 0;
			}
			return Math.max( 4, Math.round( 60000 / rate / chart.abp.drawInterval ) );
		},

		// True when the arterial line should show a pulsatile trace at all: a
		// pulseless rhythm still has electrical activity but produces no pressure.
		abpHasOutput: function() {
			if( typeof controls === 'undefined' ) {
				return false;
			}
			if( controls.cpr && controls.cpr.inProgress == true ) {
				return true;			// compressions generate pressure
			}
			if( controls.heartRhythm && ( controls.heartRhythm.pea == true || controls.heartRhythm.arrest == true ) ) {
				return false;			// PEA / arrest: complexes but no output
			}
			return ( controls.heartRate && controls.heartRate.value > 0 );
		},

		// ---------------------------------------------------------------------
		// Plethysmograph
		//
		// Same generation approach as the arterial morphologies: normalised samples
		// spanning one cardiac cycle, 0 at the trough and 1 at the peak. Unlike the
		// pressure trace there is no scale to agree with, so amplitude is purely a
		// gain choice (see PLETH_AMPLITUDE).
		// ---------------------------------------------------------------------
		initPlethWaveforms: function() {
			var n = chart.pleth.sampleCount;
			var ease = function(t) { return 0.5 * ( 1 - Math.cos( Math.PI * Math.min( Math.max(t, 0), 1 ) ) ); };
			var seg  = function(t, a, b) { return a + ( b - a ) * ease(t); };
			var types = ['normal', 'poor', 'artifact'];

			for( var ti = 0; ti < types.length; ti++ ) {
				var type = types[ti];
				var arr = new Array(n);
				for( var i = 0; i < n; i++ ) {
					var p = i / n;
					var v;
					switch( type ) {
						case 'poor':
							// Blunt and slow: a shallow upstroke, no discernible
							// dicrotic notch, and a lazy return to baseline. Drawn at
							// reduced gain as well, so it reads as a weak signal.
							if( p < 0.30 )      { v = seg( p / 0.30, 0.0, 1.0 ); }
							else if( p < 0.62 ) { v = seg( ( p - 0.30 ) / 0.32, 1.0, 0.42 ); }
							else                { v = 0.42 * Math.exp( -1.6 * ( p - 0.62 ) / 0.38 ); }
							break;

						case 'artifact':
							// No usable signal: probe off, or no detectable pulse.
							// Deliberately not pulsatile - the shape is filled in by
							// drawPlethPixel, which wanders the baseline instead of
							// replaying a cardiac cycle.
							v = 0;
							break;

						default:	// 'normal'
							// Brisk systolic upstroke, rounded peak, dicrotic notch on
							// the descent, then an exponential diastolic decay. Softer
							// than the arterial trace: the signal is optical and
							// mechanically damped by the tissue.
							if( p < 0.12 )      { v = seg( p / 0.12, 0.0, 1.0 ); }
							else if( p < 0.34 ) { v = seg( ( p - 0.12 ) / 0.22, 1.0, 0.55 ); }
							else if( p < 0.40 ) { v = seg( ( p - 0.34 ) / 0.06, 0.55, 0.46 ); }
							else if( p < 0.47 ) { v = seg( ( p - 0.40 ) / 0.07, 0.46, 0.57 ); }
							else                { v = 0.57 * Math.exp( -3.0 * ( p - 0.47 ) / 0.53 ); }
							break;
					}
					arr[i] = v;
				}
				chart.pleth.waveform[type] = arr;
			}
		},

		plethWaveformType: function() {
			var t = ( typeof controls !== 'undefined' && controls.SpO2 ) ? controls.SpO2.waveformType : 'normal';
			return chart.pleth.waveform[t] ? t : 'normal';
		},

		// Queue the pleth pulse for a beat. Called from controls.heartRate.setSynch
		// alongside chart.abpBeat, so both follow the same beat.
		plethBeat: function() {
			if( ! chart.pleth.ctx ) {
				return;
			}
			chart.pleth.pendingDelay = Math.max( 1, Math.round( chart.PLETH_TRANSIT_MSEC / chart.pleth.drawInterval ) );
		},

		// A pulse oximeter shows a pulsatile trace only when there is a pulse to
		// detect: the same condition the arterial line uses.
		plethHasOutput: function() {
			if( chart.plethWaveformType() == 'artifact' ) {
				return false;
			}
			return chart.abpHasOutput();
		},

		// ---------------------------------------------------------------------
		// Pulmonary artery catheter
		//
		// A Swan-Ganz catheter is floated from a central vein through the right
		// heart into a pulmonary artery, and the operator knows where the tip is
		// purely from the shape of the pressure trace. That is what this strip
		// teaches, so the five positions are generated to make the transitions
		// unmistakable rather than merely plausible:
		//
		//   CVP / RA   low-amplitude venous trace with a, c and v waves and the
		//              x and y descents between them. CVP is drawn slightly damped
		//              relative to RA - the tip is still up in the vena cava.
		//   RV         the tell is DIASTOLE: pressure collapses to essentially zero
		//              between beats, because a relaxed right ventricle fills at
		//              almost no pressure. Systole jumps to RV systolic.
		//   PA         same systolic peak as RV - the pulmonic valve is open at the
		//              moment of peak ejection - but diastole now STEPS UP and stays
		//              well above zero, because the closed pulmonic valve holds the
		//              arterial column back. A dicrotic notch appears at valve
		//              closure. The diastolic step-up is how you know the valve was
		//              crossed, and it is why the two are drawn on a shared scale.
		//   Wedge      the balloon occludes the branch and the pulsatile arterial
		//              waveform COLLAPSES to a damped left atrial trace: small a and
		//              v waves, no notch, and a mean below PA diastolic.
		//
		// Unlike the arterial morphologies, which are normalised 0..1 and mapped to
		// pressure at draw time, these are generated directly in mmHg. Their
		// features are absolute (a 3 mmHg v wave is a 3 mmHg v wave, whatever the
		// mean) and the RV trace has to reach true zero, which no fixed
		// normalisation against systolic and diastolic can express. They are
		// regenerated whenever the instructor changes a pressure - see
		// pacWaveformKey below - which is cheap: five arrays of 120 samples.
		// ---------------------------------------------------------------------

		// Signature of the pressures the generated arrays currently reflect.
		pacWaveformKey: function() {
			if( typeof controls === 'undefined' || ! controls.pac ) {
				return '';
			}
			var c = controls.pac;
			return [ c.raMean, c.rvSys, c.rvDia, c.paSys, c.paDia, c.wedgeMean ].join(':');
		},

		initPacWaveforms: function() {
			var n = chart.pac.sampleCount;
			var c = ( typeof controls !== 'undefined' && controls.pac ) ? controls.pac : null;

			var raM   = c ? c.raMean    : 5;
			var rvS   = c ? c.rvSys     : 25;
			var rvD   = c ? c.rvDia     : 5;
			var paS   = c ? c.paSys     : 25;
			var paD   = c ? c.paDia     : 12;
			var pcwM  = c ? c.wedgeMean : 9;

			// smooth 0..1 ease, as used by the arterial morphologies
			var ease = function(t) { return 0.5 * ( 1 - Math.cos( Math.PI * Math.min( Math.max(t, 0), 1 ) ) ); };
			var seg  = function(t, a, b) { return a + ( b - a ) * ease(t); };
			// exponential runoff that is exactly 1 at t=0 and exactly 0 at t=1, so a
			// diastolic decay lands precisely on the diastolic pressure instead of
			// leaving a step at the cycle wrap
			var decay = function(t, k) {
				t = Math.min( Math.max(t, 0), 1 );
				var e = Math.exp( -k );
				return ( Math.exp( -k * t ) - e ) / ( 1 - e );
			};

			// Venous deviation from the mean, in mmHg, for one cardiac cycle measured
			// from the R wave. The a wave follows atrial contraction, which precedes
			// the QRS, so it sits at the END of the cycle - just before the next R.
			var venous = function(p) {
				if( p < 0.04 )      { return 1.0; }							// post-a plateau
				if( p < 0.12 )      { return seg( ( p - 0.04 ) / 0.08,  1.0,  2.0 ); }	// c wave
				if( p < 0.28 )      { return seg( ( p - 0.12 ) / 0.16,  2.0, -2.5 ); }	// x descent
				if( p < 0.45 )      { return seg( ( p - 0.28 ) / 0.17, -2.5,  3.0 ); }	// v wave
				if( p < 0.60 )      { return seg( ( p - 0.45 ) / 0.15,  3.0, -3.0 ); }	// y descent
				if( p < 0.80 )      { return seg( ( p - 0.60 ) / 0.20, -3.0, -0.5 ); }	// filling
				if( p < 0.88 )      { return seg( ( p - 0.80 ) / 0.08, -0.5,  4.0 ); }	// a wave
				return seg( ( p - 0.88 ) / 0.12, 4.0, 1.0 );							// x descent
			};

			// Left atrial pressure seen through the pulmonary capillary bed: damped,
			// delayed, and with no c wave to speak of. The collapse in amplitude is
			// the wedge tell as much as the drop in mean is.
			var wedge = function(p) {
				if( p < 0.10 )      { return seg(   p          / 0.10,  0.6,  0.0 ); }
				if( p < 0.26 )      { return seg( ( p - 0.10 ) / 0.16,  0.0,  2.5 ); }	// a wave (delayed)
				if( p < 0.42 )      { return seg( ( p - 0.26 ) / 0.16,  2.5, -1.5 ); }	// x descent
				if( p < 0.62 )      { return seg( ( p - 0.42 ) / 0.20, -1.5,  2.0 ); }	// v wave
				if( p < 0.78 )      { return seg( ( p - 0.62 ) / 0.16,  2.0, -1.8 ); }	// y descent
				return seg( ( p - 0.78 ) / 0.22, -1.8, 0.6 );
			};

			// A venous trace has to report the mean the instructor set, so the shape
			// is centred on its own mean before the configured mean is added. Retuning
			// a wave above therefore cannot drag the reading off the set pressure.
			var centred = function(fn, mean, damping) {
				var raw = new Array(n), sum = 0, i;
				for( i = 0; i < n; i++ ) {
					raw[i] = fn( i / n );
					sum += raw[i];
				}
				var avg = sum / n;
				for( i = 0; i < n; i++ ) {
					raw[i] = mean + ( ( raw[i] - avg ) * damping );
				}
				return raw;
			};

			var out = {};

			// CVP: the same venous waveform, damped by the length of catheter still
			// sitting in the vena cava. Same mean - it is the same venous pressure.
			out.cvp = centred( venous, raM, 0.70 );
			out.ra  = centred( venous, raM, 1.00 );
			out.wedge = centred( wedge, pcwM, 1.00 );

			// Right ventricle. Peak lands exactly on RV systolic and the END-diastolic
			// value exactly on RV diastolic, which is how a ventricular pressure is
			// reported; the early-diastolic dip to zero is the whole point of the trace
			// and is deliberately below the reported diastolic.
			var rv = new Array(n);
			var pa = new Array(n);
			for( var i = 0; i < n; i++ ) {
				var p = i / n;
				var v;

				if( p < 0.02 )      { v = rvD; }
				else if( p < 0.14 ) { v = seg( ( p - 0.02 ) / 0.12, rvD, rvS ); }			// upstroke
				else if( p < 0.30 ) { v = seg( ( p - 0.14 ) / 0.16, rvS, rvS * 0.92 ); }		// ejection
				else if( p < 0.42 ) { v = seg( ( p - 0.30 ) / 0.12, rvS * 0.92, 0.4 ); }		// isovolumic fall
				else if( p < 0.50 ) { v = seg( ( p - 0.42 ) / 0.08, 0.4, 0.0 ); }			// early diastolic dip
				else if( p < 0.86 ) { v = seg( ( p - 0.50 ) / 0.36, 0.0, rvD - 0.8 ); }		// slow filling
				else if( p < 0.93 ) { v = seg( ( p - 0.86 ) / 0.07, rvD - 0.8, rvD + 0.8 ); }// atrial kick
				else                { v = seg( ( p - 0.93 ) / 0.07, rvD + 0.8, rvD ); }
				rv[i] = v;

				// Pulmonary artery. Same peak as the ventricle, but diastole never
				// returns to baseline - the runoff decays onto PA diastolic and stops
				// there - and a dicrotic notch marks pulmonic valve closure.
				var pp = paS - paD;
				if( p < 0.04 )      { v = paD; }
				else if( p < 0.16 ) { v = seg( ( p - 0.04 ) / 0.12, paD, paS ); }					// upstroke
				else if( p < 0.34 ) { v = seg( ( p - 0.16 ) / 0.18, paS, paD + 0.45 * pp ); }		// decline
				else if( p < 0.40 ) { v = seg( ( p - 0.34 ) / 0.06, paD + 0.45 * pp, paD + 0.32 * pp ); }	// notch
				else if( p < 0.46 ) { v = seg( ( p - 0.40 ) / 0.06, paD + 0.32 * pp, paD + 0.42 * pp ); }	// dicrotic wave
				else                { v = paD + ( 0.42 * pp * decay( ( p - 0.46 ) / 0.54, 2.6 ) ); }	// runoff
				pa[i] = v;
			}
			out.rv = rv;
			out.pa = pa;

			chart.pac.waveform = out;
			chart.pac.waveformKey = chart.pacWaveformKey();
		},

		// Which catheter position to draw, regenerating the arrays first if the
		// instructor has changed a pressure since they were built.
		pacWaveformType: function() {
			if( chart.pac.waveformKey !== chart.pacWaveformKey() ) {
				chart.initPacWaveforms();
			}
			var t = ( typeof controls !== 'undefined' && controls.pac ) ? controls.pac.position : 'cvp';
			return chart.pac.waveform[t] ? t : 'cvp';
		},

		// Full scale for the pressure axis, auto-ranged so a right heart is not
		// squashed into the bottom of the strip. Stepped rather than continuous, so
		// the gridlines stay on round numbers and the scale does not creep about
		// every time a pressure is nudged.
		pacScaleMax: function() {
			var peak = 0;
			if( typeof controls !== 'undefined' && controls.pac ) {
				peak = Math.max( controls.pac.paSys, controls.pac.rvSys );
			}
			var want = peak * 1.15;
			for( var i = 0; i < chart.PAC_SCALE_STEPS.length; i++ ) {
				if( chart.PAC_SCALE_STEPS[i] >= want ) {
					return chart.PAC_SCALE_STEPS[i];
				}
			}
			return chart.PAC_SCALE_STEPS[ chart.PAC_SCALE_STEPS.length - 1 ];
		},

		// Queue the pressure wave for a beat. Called from controls.heartRate.setSynch
		// alongside chart.abpBeat, for the same reasons - see chart.abpBeat.
		pacBeat: function() {
			if( ! chart.pac.ctx ) {
				return;
			}
			chart.pac.pendingDelay = Math.max( 1, Math.round( chart.PAC_TRANSIT_MSEC / chart.pac.drawInterval ) );
		},

		// A catheter in a chamber with no mechanical activity still reads a pressure -
		// it just stops pulsating. Arrest flattens the trace onto the mean rather
		// than blanking it, which is what the transducer would actually show.
		pacHasOutput: function() {
			return chart.abpHasOutput();
		},

		// Resting pressure between beats: the last sample of the cycle, which is end
		// diastole for the ventricular and arterial traces and the mean for the
		// venous ones. Holding this keeps the trace continuous at low heart rates.
		pacRestingValue: function() {
			var wave = chart.pac.waveform[ chart.pacWaveformType() ];
			if( ! wave || ! wave.length ) {
				return 0;
			}
			return wave[ wave.length - 1 ];
		},

		drawPacPixel: function() {
			// Only a PAUSED scenario freezes the student display - see drawAbpPixel
			// for why STOPPED deliberately does not.
			if(scenario.currentScenarioState == scenario.scenarioState.PAUSED && profile.isVitalsMonitor) {
				return;
			}
			if( ! chart.pac.ctx ) {
				return;
			}

			var y;

			// catheter placed or withdrawn
			var visible = chart.stripVisible('pac');
			if( visible != chart.pac.scaleWasVisible ) {
				if( visible == true ) {
					chart.redrawStripScale('pac');
				} else {
					chart.clearStripScaleLabels('pac');
				}
				chart.pac.scaleWasVisible = visible;
			}

			chart.drawCursor('pac');
			chart.drawStripScale('pac', chart.pac.xPos, chart.cursorWidth);

			if( visible == false ) {
				chart.pac.xPos++;
				if((chart.pac.xPos + chart.pac.xOffsetRight) > chart.pac.width) {
					chart.pac.xPos = chart.pac.xOffsetLeft;
				}
				return;					// blank strip, nothing drawn
			}

			// count down the transit delay, then start the cycle
			if( chart.pac.pendingDelay >= 0 ) {
				if( chart.pac.pendingDelay == 0 ) {
					chart.pac.pendingDelay = -1;
					chart.pac.pulseLength = chart.abpCycleTicks();
					if( chart.pac.pulseLength > 0 && chart.pacHasOutput() ) {
						chart.pac.pulseActive = true;
						chart.pac.pulseIndex = 0;
						// capture the array for this beat so a pressure change part
						// way through does not distort the waveform in flight
						chart.pac.currentWave = chart.pac.waveform[ chart.pacWaveformType() ];
						// refresh the numerics once per beat, as a monitor does
						controls.pac.displayValue();
					}
				} else {
					chart.pac.pendingDelay--;
				}
			}

			var mmHg;
			if( chart.pac.pulseActive == true && chart.pac.currentWave ) {
				var wave = chart.pac.currentWave;
				var idx = Math.floor( ( chart.pac.pulseIndex / chart.pac.pulseLength ) * wave.length );
				if( idx >= wave.length ) {
					idx = wave.length - 1;
				}
				mmHg = wave[idx];
				chart.pac.pulseIndex++;
				if( chart.pac.pulseIndex >= chart.pac.pulseLength ) {
					chart.pac.pulseActive = false;
				}
			} else {
				// Between beats, and during arrest, sit at the resting pressure. The
				// catheter is still in a fluid column: it reads a pressure whether or
				// not the heart is ejecting.
				mmHg = chart.pacRestingValue();
			}
			chart.pac.lastMmHg = mmHg;

			y = chart.stripScaleY( 'pac', mmHg );

			// clamp into the strip so a big pressure cannot draw outside it
			if( y < 1 ) { y = 1; }
			if( y > chart.pac.height - 1 ) { y = chart.pac.height - 1; }

			chart.pac.ctx.lineWidth = 2;
			chart.pac.ctx.strokeStyle = chart.pac.color;
			chart.pac.ctx.beginPath();
			chart.pac.ctx.moveTo(chart.pac.xPos, chart.pac.lastDisplayedY);

			chart.pac.xPos++;

			chart.pac.ctx.lineTo(chart.pac.xPos, y);
			chart.pac.ctx.stroke();

			chart.pac.lastDisplayedY = y;

			if((chart.pac.xPos + chart.pac.xOffsetRight) > chart.pac.width) {
				chart.pac.xPos = chart.pac.xOffsetLeft;
				chart.pac.ctx.fillStyle = "black";
				chart.pac.ctx.fillRect(0, 0, chart.pac.xOffsetLeft, chart.pac.height);
				chart.drawStripScaleLabels('pac');
			}
		},

		drawPlethPixel: function() {
			if(scenario.currentScenarioState == scenario.scenarioState.PAUSED && profile.isVitalsMonitor) {
				return;
			}
			if( ! chart.pleth.ctx ) {
				return;
			}

			var visible = chart.stripVisible('pleth');
			if( visible != chart.pleth.scaleWasVisible ) {
				chart.pleth.scaleWasVisible = visible;
			}

			chart.drawCursor('pleth');

			if( visible == false ) {
				chart.pleth.xPos++;
				if((chart.pleth.xPos + chart.pleth.xOffsetRight) > chart.pleth.width) {
					chart.pleth.xPos = chart.pleth.xOffsetLeft;
				}
				return;
			}

			var type = chart.plethWaveformType();
			var norm;

			if( type == 'artifact' || chart.plethHasOutput() == false ) {
				// Wandering, non-pulsatile baseline. Two incommensurate sinusoids
				// plus a little noise, so it never settles into a rhythm a student
				// could mistake for a pulse.
				chart.pleth.noisePhase += 1;
				var ph = chart.pleth.noisePhase;
				norm = 0.5
					 + 0.30 * Math.sin( ph / 17.0 )
					 + 0.18 * Math.sin( ph / 6.3 )
					 + 0.10 * ( Math.random() - 0.5 );
				if( norm < 0 ) { norm = 0; }
				if( norm > 1 ) { norm = 1; }
				chart.pleth.pulseActive = false;
			} else {
				// count down the transit delay, then start the cycle
				if( chart.pleth.pendingDelay >= 0 ) {
					if( chart.pleth.pendingDelay == 0 ) {
						chart.pleth.pendingDelay = -1;
						chart.pleth.pulseLength = chart.abpCycleTicks();
						if( chart.pleth.pulseLength > 0 ) {
							chart.pleth.pulseActive = true;
							chart.pleth.pulseIndex = 0;
						}
					} else {
						chart.pleth.pendingDelay--;
					}
				}

				if( chart.pleth.pulseActive == true ) {
					var wave = chart.pleth.waveform[type];
					var idx = Math.floor( ( chart.pleth.pulseIndex / chart.pleth.pulseLength ) * wave.length );
					if( idx >= wave.length ) {
						idx = wave.length - 1;
					}
					norm = wave[idx];
					chart.pleth.pulseIndex++;
					if( chart.pleth.pulseIndex >= chart.pleth.pulseLength ) {
						chart.pleth.pulseActive = false;
					}
				} else {
					norm = 0;
				}
			}
			chart.pleth.lastNorm = norm;

			var gain = chart.PLETH_AMPLITUDE[type];
			if( ! gain ) {
				gain = 1.0;
			}
			// full-scale deflection is the strip height (see PLETH_AMPLITUDE)
			var zeroY = chart.pleth.yOffset + chart.pleth.yDisplayOffset;
			var full = chart.pleth.height;
			var y = Math.round( zeroY - ( norm * gain * full ) );

			if( y < 1 ) { y = 1; }
			if( y > chart.pleth.height - 1 ) { y = chart.pleth.height - 1; }

			chart.pleth.ctx.lineWidth = 2;
			chart.pleth.ctx.strokeStyle = chart.pleth.color;
			chart.pleth.ctx.beginPath();
			chart.pleth.ctx.moveTo(chart.pleth.xPos, chart.pleth.lastDisplayedY);

			chart.pleth.xPos++;

			chart.pleth.ctx.lineTo(chart.pleth.xPos, y);
			chart.pleth.ctx.stroke();

			chart.pleth.lastDisplayedY = y;

			if((chart.pleth.xPos + chart.pleth.xOffsetRight) > chart.pleth.width) {
				chart.pleth.xPos = chart.pleth.xOffsetLeft;
				chart.pleth.ctx.fillStyle = "black";
				chart.pleth.ctx.fillRect(0, 0, chart.pleth.xOffsetLeft, chart.pleth.height);
			}
		},

		drawAbpPixel: function() {
			// Only a PAUSED scenario freezes the student display.
			//
			// Deliberately not STOPPED: scenarioState.STOPPED is 0 and that is the
			// state the monitor sits in whenever no scenario is running, which is
			// most of the time - the simulator runs perfectly well without one.
			// Halting here would blank the monitor for good after a terminate and
			// stop a newly connected sensor from ever drawing. Terminating wipes
			// the screen once, via chart.blankMonitor(); it does not switch the
			// simulator off.
			if(scenario.currentScenarioState == scenario.scenarioState.PAUSED && profile.isVitalsMonitor) {
				return;
			}
			if( ! chart.abp.ctx ) {
				return;
			}

			var y;

			// arterial line switched on or off (see the equivalent in drawRespPixel)
			var visible = chart.stripVisible('abp');
			if( visible != chart.abp.scaleWasVisible ) {
				if( visible == true ) {
					chart.redrawStripScale('abp');
				} else {
					chart.clearStripScaleLabels('abp');
				}
				chart.abp.scaleWasVisible = visible;
			}

			chart.drawCursor('abp');
			chart.drawStripScale('abp', chart.abp.xPos, chart.cursorWidth);

			if( visible == false ) {
				chart.abp.xPos++;
				if((chart.abp.xPos + chart.abp.xOffsetRight) > chart.abp.width) {
					chart.abp.xPos = chart.abp.xOffsetLeft;
				}
				return;					// blank strip, nothing drawn
			}

			// CPR runs free of the ECG, so it self-triggers rather than waiting for
			// a beat that compressions do not produce
			if( chart.abpWaveformType() == 'cpr' && chart.abp.pulseActive == false && chart.abp.pendingDelay < 0 ) {
				chart.abp.pendingDelay = 0;
			}

			// count down the pulse transit delay, then start the cycle
			if( chart.abp.pendingDelay >= 0 ) {
				if( chart.abp.pendingDelay == 0 ) {
					chart.abp.pendingDelay = -1;
					chart.abp.pulseLength = chart.abpCycleTicks();
					if( chart.abp.pulseLength > 0 && chart.abpHasOutput() ) {
						chart.abp.pulseActive = true;
						chart.abp.pulseIndex = 0;
						// capture the pressures at the start of the beat so a change
						// part way through does not distort the waveform in flight
						// the TRUE pressures define the range the waveform spans;
						// the artifact is in the morphology, and the displayed
						// numbers are derived back out of it (controls.abp)
						chart.abp.currentSys = controls.abp.setSystolic();
						chart.abp.currentDia = controls.abp.setDiastolic();
						// refresh the numerics once per beat, as a monitor does
						controls.abp.displayValue();
					}
				} else {
					chart.abp.pendingDelay--;
				}
			}

			var norm;
			if( chart.abp.pulseActive == true ) {
				var wave = chart.abp.waveform[ chart.abpWaveformType() ];
				var idx = Math.floor( ( chart.abp.pulseIndex / chart.abp.pulseLength ) * wave.length );
				if( idx >= wave.length ) {
					idx = wave.length - 1;
				}
				norm = wave[idx];
				chart.abp.pulseIndex++;
				if( chart.abp.pulseIndex >= chart.abp.pulseLength ) {
					chart.abp.pulseActive = false;
				}
			} else if( chart.abpHasOutput() == false ) {
				// no output: decay towards zero rather than snapping flat
				norm = chart.abp.lastNorm * 0.94;
				if( norm < 0.01 ) {
					norm = 0;
				}
				chart.abp.currentSys = controls.abp.setSystolic();
				chart.abp.currentDia = controls.abp.setDiastolic();
			} else {
				norm = 0;				// at diastole, waiting for the next beat
			}
			chart.abp.lastNorm = norm;

			var mmHg;
			if( chart.abpHasOutput() == false ) {
				mmHg = norm * chart.abp.currentDia;		// decays to 0 mmHg
			} else {
				mmHg = chart.abp.currentDia + ( norm * ( chart.abp.currentSys - chart.abp.currentDia ) );
			}
			y = chart.stripScaleY( 'abp', mmHg );

			// clamp into the strip so a big overshoot cannot draw outside it
			if( y < 1 ) { y = 1; }
			if( y > chart.abp.height - 1 ) { y = chart.abp.height - 1; }

			chart.abp.ctx.lineWidth = 2;
			chart.abp.ctx.strokeStyle = chart.abp.color;
			chart.abp.ctx.beginPath();
			chart.abp.ctx.moveTo(chart.abp.xPos, chart.abp.lastDisplayedY);

			chart.abp.xPos++;

			chart.abp.ctx.lineTo(chart.abp.xPos, y);
			chart.abp.ctx.stroke();

			chart.abp.lastDisplayedY = y;

			if((chart.abp.xPos + chart.abp.xOffsetRight) > chart.abp.width) {
				chart.abp.xPos = chart.abp.xOffsetLeft;
				chart.abp.ctx.fillStyle = "black";
				chart.abp.ctx.fillRect(0, 0, chart.abp.xOffsetLeft, chart.abp.height);
				chart.drawStripScaleLabels('abp');
			}
		},

		drawRespPixel: function() {
			// Only a PAUSED scenario freezes the student display.
			//
			// Deliberately not STOPPED: scenarioState.STOPPED is 0 and that is the
			// state the monitor sits in whenever no scenario is running, which is
			// most of the time - the simulator runs perfectly well without one.
			// Halting here would blank the monitor for good after a terminate and
			// stop a newly connected sensor from ever drawing. Terminating wipes
			// the screen once, via chart.blankMonitor(); it does not switch the
			// simulator off.
			if(scenario.currentScenarioState == scenario.scenarioState.PAUSED && profile.isVitalsMonitor) {
				return;
			}

			var y;

			// Handle the capnograph being switched on or off (CO2 leads connected on
			// the vitals monitor). On: paint the whole scale now rather than letting
			// it creep in a band at a time over the sweep. Off: blank the labels,
			// which live outside the area the sweep clears.
			var scaleVisible = chart.stripVisible('resp');
			if( scaleVisible != chart.resp.scaleWasVisible ) {
				if( scaleVisible == true ) {
					chart.redrawStripScale('resp');
				} else {
					chart.clearStripScaleLabels('resp');
				}
				chart.resp.scaleWasVisible = scaleVisible;
			}

			// Create the 'cursor' by clearing out a 10px wide section in front of the pixel
			chart.drawCursor('resp');

			// repaint the ETCO2 reference scale into the section just cleared, so it
			// sits behind the trace instead of being wiped out by the sweep
			chart.drawStripScale('resp', chart.resp.xPos, chart.cursorWidth);

			if(controls.manualRespiration.inProgress == true) {
				if(controls.manualRespiration.manualBreathIndex >= chart.resp.manualBreathPattern.length) {
					controls.manualRespiration.inProgress = false;
					y = 0;
				} else {
					//scale the y value to the current ETCO2
					chart.resp.currentetCO2value = controls.etCO2.value;
					var _midx = controls.manualRespiration.manualBreathIndex;
					if( _midx == 0 ) {
						chart.updateEtco2Scale( chart.resp.currentetCO2value );
					}
					var _rawVal = chart.resp.manualBreathPattern[_midx];
					var _mPeakVal = 61.55049417;		// max of manualBreathPattern (index 50)
					var _mScaleFactor = chart.resp.currentetCO2value / controls.etCO2.maxValue;
					var _wt_m = (controls.etCO2 && controls.etCO2.waveformType) ? controls.etCO2.waveformType : 'normal';

					if(_wt_m === 'obstructive') {
						// Shark fin: CO2 rises linearly from 0 to peak across the full
						// exhalation phase (indices 11-50), then uses the original falling tail.
						var _mRiseStart = 11, _mPeakIdx = 50;
						if(_midx >= _mRiseStart && _midx <= _mPeakIdx) {
							var _mProg = (_midx - _mRiseStart) / (_mPeakIdx - _mRiseStart);
							_rawVal = _mPeakVal * _mProg;
						}
						y = _rawVal * -1 * _mScaleFactor;
					} else if(_wt_m === 'curare') {
						// Curare cleft: apply plateau notch modulation to the plateau region.
						var _mPlatStart = 21, _mPlatEnd = 50;
						if(_midx >= _mPlatStart && _midx <= _mPlatEnd) {
							var _mProg = (_midx - _mPlatStart) / (_mPlatEnd - _mPlatStart);
							var _cleftArr = chart.resp.rhythm['cleft'];
							var _mCi = Math.min(Math.round(_mProg * (_cleftArr.length - 1)), _cleftArr.length - 1);
							_rawVal = _mPeakVal * _cleftArr[_mCi];
						}
						y = _rawVal * -1 * _mScaleFactor;
					} else {
						// Normal: use pattern as-is
						y = _rawVal * -1 * _mScaleFactor;
					}

					// Rebreathing: elevated baseline floor — applies regardless of other waveform shape
					if(_wt_m === 'rebreathing') {
						var _mPeakScaled = _mPeakVal * _mScaleFactor;
						var _mRebreathFloor = -(_mPeakScaled * 0.25);
						if(y > _mRebreathFloor) { y = _mRebreathFloor; }
					}

//console.log("manual breath: " + y);
					// advance to the next point in the waveform
					controls.manualRespiration.manualBreathIndex++;
				}
				
				// check for vitals display of new ETCO2, manual breath index = 35 is transition to low.
				if( profile.isVitalsMonitor && controls.manualRespiration.manualBreathIndex == (chart.resp.manualBreathPattern.length - 1) ) {
					controls.etCO2.displayValue();					
				}
				
//			} else if (controls.heartRhythm.pea == true) {
//				y = 0;
			} else if(simmgr.respResponse.rate == 0) {
				// Reset to rest state so no phantom waveform fires when rate goes
				// non-zero via full-status poll -- a real breath/synch is required to start drawing
				chart.resp.rhythmIndex = 'rest';
				chart.resp.length = chart.resp.rhythm['rest'].length - 1;
				chart.resp.patternIndex = 0;
				y = 0;
			} else if ( ( profile.isVitalsMonitor == false ) || ( controls.CO2.leadsConnected == true ) ) {
				if(chart.status.resp.synch == true ) {	// Restart Cycle
					if ( typeof simsound !== 'undefined' )
					{
						simsound.playLungSound();
					}
// console.log("Periodcount: " + chart.resp.periodCount);
// console.log("rate: " + simmgr.respResponse.rate);
					chart.updateRespRate();
					//store the current etCO2 value for this breath in case it is changed mid-breath
					chart.resp.currentetCO2value = controls.etCO2.value
					chart.updateEtco2Scale( chart.resp.currentetCO2value );
					
					// clear out synch bit
					chart.status.resp.synch = false;
					
					// flag start of synch
					chart.resp.breathStart = true;
					
					// pixel count is used to track total number of pixels rendered in waveform
					chart.resp.pixelCount = 0;
					
					// index of current pattern pixel being displayed
					chart.resp.patternIndex = 0;
					
					// pattern being displayed
					chart.resp.rhythmIndex = 'low';	// start pattern with pattern low...start of inhalation
					
					// length of current pattern segment being displayed
					chart.resp.length = chart.resp.inhalationDuration-1;
//console.log("chart.resp.inhalationDuration: " + chart.resp.inhalationDuration);
//console.log("chart.resp.exhalationDuration: " + chart.resp.exhalationDuration);
					
					// max value
					if(chart.resp.rhythm[chart.resp.rhythmIndex][chart.resp.patternIndex] > chart.displayETCO2.max) {
						y = chart.displayETCO2.max * -1;
					} else {
						y = chart.resp.rhythm[chart.resp.rhythmIndex][chart.resp.patternIndex] * -1;
					}

					// Rebreathing floor: apply here too — the synch frame draws y=0 (rhythm['low'][0])
					// which would otherwise escape the clamp in the else-branch below.
					if((controls.etCO2 && controls.etCO2.waveformType) === 'rebreathing') {
						var _syncPeakScaled = chart.resp.rhythm['high'][chart.resp.risePatternIndex][1] * chart.resp.currentetCO2value / controls.etCO2.maxValue;
						var _syncRebreathFloor = -(_syncPeakScaled * 0.25);
						if(y > _syncRebreathFloor) { y = _syncRebreathFloor; }
					}
				}
				else {
					var _wt = (controls.etCO2 && controls.etCO2.waveformType) ? controls.etCO2.waveformType : 'normal';

					if(chart.resp.rhythmIndex == 'low-to-high') {
						y = chart.resp.rhythm[chart.resp.rhythmIndex][chart.resp.risePatternIndex][chart.resp.patternIndex] * -1 * chart.resp.rhythm['high'][chart.resp.risePatternIndex][0]/52;
					} else if(chart.resp.rhythmIndex == 'high-to-low'){
						y = chart.resp.rhythm[chart.resp.rhythmIndex][chart.resp.risePatternIndex][chart.resp.patternIndex] * -1;
					} else if(chart.resp.rhythmIndex == 'low' || chart.resp.rhythmIndex == 'rest'){
						y = chart.resp.rhythm[chart.resp.rhythmIndex][0] * -1;
					} else if (chart.resp.rhythmIndex == 'high'){
						var _peak  = chart.resp.rhythm['high'][chart.resp.risePatternIndex][1];
						var _start = chart.resp.rhythm['high'][chart.resp.risePatternIndex][0];
						var _prog  = (chart.resp.length > 1) ? chart.resp.patternIndex / (chart.resp.length - 1) : 1;
						if(_wt === 'obstructive') {
							// Shark fin: continuous rise from baseline (0) to peak across full exhalation
							y = -(_peak * _prog);
						} else if(_wt === 'curare') {
							// Curare cleft: plateau with a mid-plateau notch from diaphragmatic effort
							var _cleft = chart.resp.rhythm['cleft'];
							var _ci = Math.min(Math.round(_prog * (_cleft.length - 1)), _cleft.length - 1);
							y = -(_peak * _cleft[_ci]);
						} else {
							// Normal: slight upward slope across the plateau
							y = -1 * (_start + (_prog * (_peak - _start)));
						}
					}

					//scale the y value to the current ETCO2
					y = y * chart.resp.currentetCO2value / controls.etCO2.maxValue

					// Rebreathing: CO2 doesn't return to zero between breaths.
					// Apply an elevated baseline floor — baseline = 25% of scaled peak.
					// Since y is negative for upward (CO2) deflections, values closer to 0
					// than the floor are clamped to the floor.
					if(_wt === 'rebreathing') {
						var _peakScaled = chart.resp.rhythm['high'][chart.resp.risePatternIndex][1] * chart.resp.currentetCO2value / controls.etCO2.maxValue;
						var _rebreathFloor = -(_peakScaled * 0.25);
						if(y > _rebreathFloor) { y = _rebreathFloor; }
					}
//console.log("y: " + y);
					
					// check that y is not over max value
					// if(y < (chart.displayETCO2.max * -1)) {
					//	y = chart.displayETCO2.max * -1;
					// }
					
					// increment pixel count and index into pattern
					chart.resp.pixelCount++;
					chart.resp.patternIndex++;

					if(chart.resp.patternIndex >= chart.resp.length) {						
						chart.resp.patternIndex = 0;
						switch ( chart.resp.rhythmIndex ) {
							// inhalation
							case 'low': // Hold In (pattern low)
								// breathing rate is greater than zero than advance to next waveform, else stay in low and reset pattern
								if(simmgr.respResponse.rate > 0) {
									var _wt_low = (controls.etCO2 && controls.etCO2.waveformType) ? controls.etCO2.waveformType : 'normal';
									if(_wt_low === 'obstructive') {
										// Shark fin: skip upstroke array entirely — 'high' rises
										// continuously from 0 to peak over the full exhalation duration
										chart.resp.rhythmIndex = 'high';
										chart.resp.length = chart.resp.exhalationDuration - chart.resp.rhythm['high-to-low'][chart.resp.risePatternIndex].length - 1;
									} else {
										chart.resp.rhythmIndex = 'low-to-high';
										chart.resp.length = chart.resp.rhythm[chart.resp.rhythmIndex][chart.resp.risePatternIndex].length-1;
									}
								}
								chart.resp.patternIndex = 0;
								break;
							
							case 'low-to-high': // Exhalation (low to high)
								chart.resp.rhythmIndex = 'high';
								chart.resp.length = chart.resp.exhalationDuration - chart.resp.length - chart.resp.rhythm['high-to-low'][chart.resp.risePatternIndex].length-1;
//console.log("length of high: " + chart.resp.length);
								chart.resp.patternIndex = 0;								
								break;

							case 'high': // Hold Out (hold high)
								chart.resp.rhythmIndex = 'high-to-low';
								chart.resp.length = chart.resp.rhythm[chart.resp.rhythmIndex][chart.resp.risePatternIndex].length-1;
								chart.resp.patternIndex = 0;
								controls.etCO2.changeInProgressStatus = ETCO2_NEW_WAVEFORM_COMPLETED;
									if ( profile.isVitalsMonitor ) {
										controls.etCO2.displayValue();
									}								
								break;

							case 'high-to-low':	// Depletion of CO2 (high to low)
//console.log("got to end of high to low");
								chart.resp.rhythmIndex = 'rest';
								chart.resp.length = chart.resp.rhythm[chart.resp.rhythmIndex].length-1;
								chart.resp.patternIndex = 0;
//								controls.etCO2.changeInProgressStatus = ETCO2_NEW_WAVEFORM_COMPLETED;
//									if ( profile.isVitalsMonitor ) {
//										controls.etCO2.displayValue();
//									}
								break;

							case 'rest':	// rest between breaths...stay in cycle until synch pulse
								chart.resp.rhythmIndex = 'rest';
								chart.resp.length = chart.resp.rhythm[chart.resp.rhythmIndex].length-1;
								chart.resp.patternIndex = 0;
								if(controls.etCO2.changeInProgressStatus == ETCO2_NEW_WAVEFORM_COMPLETED) {
									controls.etCO2.changeInProgressStatus = ETCO2_OK;
									
//									if ( profile.isVitalsMonitor ) {
//										controls.etCO2.displayValue();
//									}								
								}							
								break;

						}
					}
				}
			} else if ( ( profile.isVitalsMonitor == true ) || ( controls.CO2.leadsConnected == false ) ) {
				if(chart.status.resp.synch == true ) {	// Restart Cycle
					if ( typeof simsound !== 'undefined' )
					{
						simsound.playLungSound();
					}
					chart.status.resp.synch = false;
				}
			}
			else {
				y = 0;
			}
			
			// save last y before offsets are added in
			chart.resp.lastY = y;

			// waveform units -> the display scale (see ETCO2_SCALE_STEPS)
			y = y * chart.etco2DisplayGain();

			// scale the reference-height waveform to this strip's actual height
			y = y * chart.resp.ampScale;

			y += chart.resp.yOffset + chart.resp.yDisplayOffset;
			// create stroke
			chart.resp.ctx.lineWidth = 2;
			if ( ( profile.isVitalsMonitor == false ) || ( controls.CO2.leadsConnected == true ) )
			{
				chart.resp.ctx.strokeStyle = chart.resp.color;
			}
			else
			{
				chart.resp.ctx.strokeStyle = 'black';
			}
			chart.resp.ctx.beginPath();
			chart.resp.ctx.moveTo(chart.resp.xPos, chart.resp.lastDisplayedY);
			
			// increment xpos
			chart.resp.xPos++;
			
			chart.resp.ctx.lineTo(chart.resp.xPos, y);
			chart.resp.ctx.stroke();
						
			// save last values for next segment
			chart.resp.lastDisplayedY = y;
			
			// see if we are beyond end of chart
			if((chart.resp.xPos + chart.resp.xOffsetRight) > chart.resp.width) {
				chart.resp.xPos = chart.resp.xOffsetLeft;
				chart.resp.ctx.fillRect(0, 0, chart.resp.xOffsetLeft, chart.resp.height);
				// the fill above blacks out the gutter the scale labels live in
				chart.drawStripScaleLabels('resp');
			}

			// are we at the start of a new pattern?
			// clear out bit and recalculate amplitude of ETCO2 waveform.
			if( chart.resp.breathStart ) {
				chart.resp.breathStart = false;
				chart.getETC02MaxDisplay();
//console.log("New ETCO2: " + controls.etCO2.value);
//console.log("New ETCO2 max: " + chart.displayETCO2.max);
			}
		},
		
		// Pick the capnograph's full scale for a value: the smallest step that keeps
		// the plateau under 90% of the scale. It steps down again only once the value
		// is well inside the smaller scale, so an ETCO2 trending back and forth
		// across a boundary does not make the display jump on every breath.
		etco2ScaleMax: function(value) {
			var v = parseInt(value, 10) || 0;
			var steps = chart.ETCO2_SCALE_STEPS;
			var want = steps[steps.length - 1];
			for( var i = 0; i < steps.length; i++ ) {
				if( v <= steps[i] * 0.9 ) { want = steps[i]; break; }
			}
			var cur = chart.resp.etco2Scale || steps[0];
			if( want > cur || ( want < cur && v <= want * 0.8 ) ) {
				return want;
			}
			return cur;
		},

		// Re-range at the start of a breath, never mid-breath. A change of scale
		// moves every gridline, so the strip is wiped and the sweep restarts with the
		// new scale, as a monitor does when it autoscales.
		updateEtco2Scale: function(value) {
			var next = chart.etco2ScaleMax(value);
			if( next != chart.resp.etco2Scale ) {
				chart.resp.etco2Scale = next;
				chart.clearStrip('resp');
			}
		},

		// Multiplier from the waveform code's own units (resp.max px for
		// etCO2.maxValue mmHg) to the display scale.
		etco2DisplayGain: function() {
			var nativePerMmHg = ( chart.resp.max || 62 ) / ( controls.etCO2.maxValue || 100 );
			return ( chart.ETCO2_FULL_SCALE_PX / chart.resp.etco2Scale ) / nativePerMmHg;
		},

		getETC02MaxDisplay: function() {
			// calculate maximum displayed for ETCO2
			chart.displayETCO2.max = Math.floor(chart.resp.max * (controls.etCO2.value / controls.etCO2.maxValue));
			
			// save value of ETCO2 used for last max calculation (for vitals use...)
			chart.resp.lastETCO2 = controls.etCO2.value;
		},

		getBaseline: function() {
			x1 = chart.baselineP1 / chart.baselineUnit;
			y1 = Math.sin(x1);
			
			x2 = chart.baselineP2 / chart.baselineUnit;
			y2 = Math.sin(x2);
			chart.baselineP1 += 0.1;
			chart.baselineP2 += 0.25;
			return ( chart.baselineUnit*(y1 + y2) );
		},
		
		getfib: function() {
			if ( chart.fibUnit1 == 0 ) {
				return ( 0 );
			}
			else {	
				if ( ( chart.fibP3 % 4 ) == 1 )
				{
					chart.fibMultiply = chart.fibP3List[chart.fibP3ListIndex];
					chart.fibP3ListIndex++;
					if ( chart.fibP3ListIndex >= chart.fibP3List.length ) {
						chart.fibP3ListIndex = 0;
					}
//console.log("fib Multiply: " + fibMultiply);
				}
			
				y1 = Math.sin(chart.fibP1 / chart.fibUnit1 );
				y2 = Math.sin(chart.fibP2 / chart.fibUnit2 );
				
				chart.fibP1 += chart.fibP1Constant;
				chart.fibP2 += chart.fibP2Constant;
				chart.fibP3 += 1;
				
				return ( (chart.fibMultiply/chart.fibDivide)*(y1 + y2) );
			}
		},
		
		getafibBase2: function() {
			if ( chart.fibUnit1 == 0 ) {
				return ( 0 );
			}
			else {	
				if ( ( chart.fibP3 % 2 ) == 1 )
				{
					chart.fibMultiply = chart.fibP3List[chart.fibP3ListIndex];
					chart.fibP3ListIndex++;
					if ( chart.fibP3ListIndex >= chart.fibP3List.length ) {
						chart.fibP3ListIndex = 0;
					}
//console.log("fib Multiply: " + fibMultiply);
				}
			
				y1 = Math.sin(chart.fibP1 / chart.fibUnit1 );
				y2 = Math.sin(chart.fibP2 / chart.fibUnit2 );
				
				chart.fibP1 += chart.fibP1Constant;
				chart.fibP2 += chart.fibP2Constant;
				chart.fibP3 += 1;
				
				return ( (chart.fibMultiply/8)*(y1 + y2) );
//				return ( (chart.fibMultiply/chart.fibDivide)*(y1 + y2) );
			}
		},
		
		getafibBase: function() {
			if ( chart.fibUnit1 == 0 ) {
				return ( 0 );
			}
			else {	
				if ( ( chart.fibP3 % 2 ) == 1 )
				{
					chart.fibMultiply = chart.fibP3List[chart.fibP3ListIndex];
					chart.fibP3ListIndex++;
					if ( chart.fibP3ListIndex >= chart.fibP3List.length ) {
						chart.fibP3ListIndex = 0;
					}
//console.log("fib Multiply: " + fibMultiply);
				}
			
				y1 = Math.sin(chart.fibP1 / chart.fibUnit1 );
				y2 = Math.sin(chart.fibP2 / chart.fibUnit2 );
				
				chart.fibP1 += 6;
				chart.fibP2 += 4;
//				chart.fibP1 += chart.fibP1Constant;
//				chart.fibP2 += chart.fibP2Constant;
				chart.fibP3 += 1;
				
				return ( (chart.fibMultiply/4)*(y1 + y2) );
			}
		},

		updateCardiacRate: function() {
			controls.heartRate.setHeartRateValue(simmgr.cardiacResponse.rate );
			if(simmgr.cardiacResponse.rhythm == 'vtach3') {
				// pre calculate R on T based on heart rate
				chart.initVtach3();
			}
			chart.updateCardiac(simmgr.cardiacResponse);
			chart.status.cardiac.synch == false;
			chart.ekg.patternIndex = 0;
			clearTimeout(controls.heartRate.beatTimeout);
			controls.heartRate.setSynch();
		},
		
		updateRespRate: function() {
			// Calculate the inhalation time
			if ( simmgr.respResponse.rate > 0 )
			{
				// calculate total length of breathing pattern
				chart.resp.periodCount = Math.round(((60 / simmgr.respResponse.rate) * 1000) / chart.resp.drawInterval);
//console.log("periodCount: " + chart.resp.periodCount);
//console.log("simmgr.respResponse.rate: " + simmgr.respResponse.rate);

				// calculate exhalation duration
				// Maximum length of expiration is 3 seconds, so truncate at cycle length > 4.5sec
				if( (60/simmgr.respResponse.rate) > 4.5 )
					{
						chart.resp.exhalationDuration = Math.floor((3 * 1000) / chart.resp.drawInterval);
					} else {
						//chart.resp.exhalationDuration = Math.floor(simmgr.respResponse.exhalation_duration / chart.resp.drawInterval);
						chart.resp.exhalationDuration = Math.floor(chart.resp.periodCount * 2 / 3);
					}
				
				// calculate inhalation duration
				chart.resp.inhalationDuration = chart.resp.periodCount - chart.resp.exhalationDuration;

				

//console.log("exhalation_duration: " + chart.resp.exhalationDuration)
//console.log("chart.resp.inhalationDuration: " + chart.resp.inhalationDuration)

				
				// rise / fall pattern used fo rising and falling edge patterns
				if(simmgr.respResponse.rate < 10) {
					chart.resp.risePatternIndex = 0;
				} else if(simmgr.respResponse.rate <= 20) {
					chart.resp.risePatternIndex = 1;								
				} else if(simmgr.respResponse.rate <= 30) {
					chart.resp.risePatternIndex = 2;								
				} else if(simmgr.respResponse.rate <= 50) {
					chart.resp.risePatternIndex = 3;
					//chart.resp.exhalationDuration = Math.floor(chart.resp.periodCount / 2);	
					//chart.resp.inhalationDuration = chart.resp.periodCount - chart.resp.exhalationDuration;							
				} else {
					chart.resp.risePatternIndex = 4;
					chart.resp.exhalationDuration = Math.floor(chart.resp.periodCount / 2);	
					chart.resp.inhalationDuration = chart.resp.periodCount - chart.resp.exhalationDuration;							

				}
				
				// check for maximum inhalation duration
				if( chart.resp.inhalationDuration > chart.resp.maxInhalationDuration ) {
					chart.resp.inhalationDuration = chart.resp.maxInhalationDuration;
				}
			}
			else
			{
				// Default to avoid divide by zero
				controls.inhalation_duration.value = 400; 
				
				// assign any value to generate low value
				chart.resp.periodCount = 50;
			}
		},
		
		getEKGNoisePixel: function() {
			// generate random noise between range
			var y = Math.floor((Math.random() * chart.ekg.noiseMax));
			if(y > (chart.ekg.noiseMax / 2)) {
				y -= (chart.ekg.noiseMax / 2);
			}
			return y;
		}
	}
