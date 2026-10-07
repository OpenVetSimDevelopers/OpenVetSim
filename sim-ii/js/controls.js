/*
sim-ii: Copyright (C) 2019  VetSim, Cornell University College of Veterinary Medicine Ithaca, NY

See gpl.html
*/
	var controls = {
		// Simulator > Patient Monitor in the app. 'simple' is the monitor as it
		// always was - ECG, ETCO2 and SpO2 - with the ABP and IBP2 buttons hidden;
		// 'advanced' adds those buttons, and their waveforms while a line is in.
		// A page starts in the mode PHP put on <body> (ovsPatientMonitorMode in
		// init.php) and follows sim-remote/ovs-config.json from then on, so a
		// change in the menu reaches every open instructor and student display.
		// Only the display is gated: the simulator keeps each line's state, so
		// switching to Advanced shows a line that was placed in the meantime.
		monitorMode: {
			advanced: true,
			CONFIG_URL: '/sim-remote/ovs-config.json',
			POLL_MS: 3000,

			// call after chart.init()
			init: function() {
				controls.monitorMode.advanced = ! document.body.classList.contains('monitor-simple');
				controls.monitorMode.apply();
				setTimeout(controls.monitorMode.load, controls.monitorMode.POLL_MS);
			},

			load: function() {
				fetch(controls.monitorMode.CONFIG_URL, { cache: 'no-store' })
					.then(function(r) { return r.ok ? r.json() : null; })
					.then(function(cfg) {
						if( cfg && typeof cfg.patientMonitor === 'string' ) {
							var adv = ( cfg.patientMonitor !== 'simple' );
							if( adv != controls.monitorMode.advanced ) {
								controls.monitorMode.advanced = adv;
								controls.monitorMode.apply();
							}
						}
					})
					.catch(function() { /* keep the current mode */ })
					.then(function() {
						setTimeout(controls.monitorMode.load, controls.monitorMode.POLL_MS);
					});
			},

			apply: function() {
				var adv = controls.monitorMode.advanced;
				document.body.classList.toggle('monitor-simple', ! adv);
				document.body.classList.toggle('monitor-advanced', adv);
				if( typeof chart !== 'undefined' && chart.setChannelEnabled ) {
					chart.setChannelEnabled('abp', controls.abp.lineConnected && adv);
					chart.setChannelEnabled('pac', controls.pac.placed && adv);
				}
			}
		},

		controllers: {
			ip: "",				// controller IP address
			fwVers: "",
			lastSeen: 0			// Date.now() timestamp of last confirmed status poll; 0 = never seen
		},
		
		defib: {
			last: -1,			// count of defib to flag a new defib cycle, -1 indicates uninitialized...
			shock: 0			// currently in defib cycle...
		},
		
		heartRate: {
			value: 75,
			avg_rate: 0,			// rolling average as reported by sim mgr
			minValue: 0,
			maxValue: 300,
			slideBar: '',
			increment: 1,
			delay: 1,
			rOnTMinValue: 180,
			normalMinValue: 0,
			
			beatTimeout: 0,
			
			modalUnitsLabel: 'BPM',
			
			init: function() {
				if ( ! ( simmgr.isLocalDisplay() ) )
				{
					if(controls.heartRate.value != 0) {
						clearTimeout(controls.heartRate.beatTimeout);
						controls.heartRate.beatTimeout = setTimeout(controls.heartRate.setSynch, Math.round((60 / controls.heartRate.value) * 1000) * controls.heartRate.delay);						
					}
				}
				controls.heartRate.displayValue();
			},
			
			setHeartRateValue: function(rate, time ) {
				controls.heartRate.value = rate;
				controls.heartRate.displayValue();
			},
			
			setHeartRate: function() {
				// get latest value from modal and send to the SimMgr
				rate = $('.strip-value.new').val();
				time = $('.transfer-time').val();
//				controls.heartRate.setHeartRateValue(rate );
				controls.heartRate.slideBar.slider( "value", parseInt( $('.strip-value.new').val() ) );
				
				simmgr.sendChange( { 'set:cardiac:rate' : rate, 'set:cardiac:transfer_time' : time } );
			},
			
			updateCPRDisplay: function() {
				if(profile.isVitalsMonitor == false) {
					return;
				}

				// see where we are in cycle
				if(controls.cpr.inProgress == false) {
					// if we are in active state then start timer
					if(chart.ekg.cprHRDisplayStatus == chart.CPR_ACTIVE) {
						chart.ekg.cprHRDisplayStatus = chart.CPR_DELAY_STOP;
						chart.cprDelayTimer = setTimeout(function() {
							chart.ekg.cprHRDisplayStatus = chart.CPR_DELAY_NONE;
							controls.heartRate.displayValue();
						}, chart.CPR_DELAY_OUT);
					} else {
						// else clear out timer and do nothing, did not complete delay
						clearTimeout(chart.cprDelayTimer);
					}
				} else {
					// CPR now active
					if(chart.ekg.cprHRDisplayStatus == chart.CPR_DELAY_NONE) {
						chart.ekg.cprHRDisplayStatus = chart.CPR_DELAY_START
						chart.cprDelayTimer = setTimeout(function() {
							chart.ekg.cprHRDisplayStatus = chart.CPR_ACTIVE;
							controls.heartRate.displayValue();
						}, chart.CPR_DELAY_IN);
					}
				}
			},
			
			setSynch: function() {				
				// if afib, then get randomized delay, else delay multiplier is 1.0
				if(controls.heartRhythm.currentRhythm == 'afib') {
					controls.heartRate.delay = chart.afib.delay[chart.afib.delayPtr++];
					if(chart.afib.delayPtr > chart.afib.delayCount) {
						chart.afib.delayPtr = 0;
					}
				} else {
					controls.heartRate.delay = 1.0;
				}
				
				// see if we are in a vpc cycle
				if(chart.ekg.rhythmIndex == 'sinus' && !(simmgr.isLocalDisplay())) {
					if(chart.ekg.vpcCount == 0) {
						// skip synch for just completed VPC, set count to -1 to flag action
						chart.ekg.vpcCount = -1;
					} else if(chart.ekg.vpcCount == -1) {
						// see if we need to flag a new vpc, -1 indicated vpc has been completed and synch has been skipped.
						chart.status.cardiac.synch = true;
						chart.abpBeat();
						chart.plethBeat();
						chart.pacBeat();
						controls.heartRate.isVPCCycle();
					}
				} else {
					chart.status.cardiac.synch = true;
					chart.abpBeat();
					chart.plethBeat();
					chart.pacBeat();
				}
	
				if ( ! ( simmgr.isLocalDisplay() ))
				{
					clearTimeout(controls.heartRate.beatTimeout);
					controls.heartRate.beatTimeout = setTimeout(controls.heartRate.setSynch, Math.round((60 / controls.heartRate.value) * 1000) * controls.heartRate.delay);						
				}
			},
			
			isVPCCycle: function() {
				// vpc?  This is called after each cardiac synch
				if (simmgr.isLocalDisplay()) {
					// flag that we are going to do a vpc pulse
					chart.status.cardiac.vpcSynch = true;
					chart.ekg.vpcCount = controls.heartRhythm.vpcCount;
					chart.ekg.vpcSynchDelayCount = 0;
					chart.ekg.vpcPatternIndex = 0;
					return;
				}

				// are we in the middle of a vpc?
				if(chart.status.cardiac.vpcSynch == true) {
					return;
				}
				
				// set up the start for doing a vpc cycle
				if(controls.heartRhythm.vpcCount > 0 && controls.heartRhythm.currentRhythm == 'sinus') {
					if(controls.heartRhythm.vpcFrequencyArray[controls.heartRhythm.vpcFrequencyIndex] == 1) {
						// flag that we are going to do a vpc pulse
						chart.status.cardiac.vpcSynch = true;
						chart.ekg.vpcCount = controls.heartRhythm.vpcCount;
						chart.ekg.vpcSynchDelayCount = chart.ekg.vpcSynchDelay - chart.ekg.length;
						chart.ekg.vpcPatternIndex = 0;
					} else {
						chart.status.cardiac.vpcSynch = false;
						chart.ekg.vpcCount = -1;					
						chart.ekg.vpcSynchDelayCount = 0;
					}
					
					controls.heartRhythm.vpcFrequencyIndex++;
					if(controls.heartRhythm.vpcFrequencyIndex >= controls.heartRhythm.vpcFrequencyLength) {
						controls.heartRhythm.vpcFrequencyIndex = 0;
					}
				}

			},
			
			validateNewValue: function() {
				var newValue = parseInt($('.strip-value.new').val());
				if(newValue < controls.heartRate.minValue || isNaN(newValue) == true) {
					$('.strip-value.new').val(controls.heartRate.minValue);			
				} else if(newValue > controls.heartRate.maxValue) {
					$('.strip-value.new').val(controls.heartRate.maxValue);
				}
				controls.heartRate.slideBar.slider( "value", parseInt( $('.strip-value.new').val() ) );
			},
			blankHR: function () {
				$('#vs-heartRhythm a.display-rate').html('---<span class="vs-upper-label"> bpm</span>');
			},
			displayValue: function() {
				if ( ( profile.isVitalsMonitor == false ) || 
					( controls.ekg.leadsConnected == true && controls.cpr.inProgress == false) ) {
					if(profile.isVitalsMonitor && controls.heartRate.avg_rate == 0) {
						
					} else if(controls.heartRhythm.currentRhythm == 'asystole' || controls.heartRhythm.currentRhythm == 'vfib') {
						if(profile.isVitalsMonitor == true) {
							controls.heartRate.blankHR();				
						} else {
							$('#vs-heartRhythm a.display-rate').html('0<span class="vs-upper-label"> bpm</span>');
						}
					} else if(chart.ekg.cprHRDisplayStatus == chart.CPR_ACTIVE && profile.isVitalsMonitor == true) {
						controls.heartRate.blankHR();
					} else {
						$('#vs-heartRhythm a.display-rate').html(controls.heartRate.avg_rate + '<span class="vs-upper-label"> bpm</span>');
					}
				}
				else {
					controls.heartRate.blankHR();
				}
			}
		},
		
		heartRhythm: {
			currentRhythm: '',
			pea: false,
			arrest: false,
			vpc: 'vpc1',			// vpc rhythm to be generated {'vpc1', 'vpc2'}
			vpcResponse: 'none',	// actual vpc response from simmgr {'none', '1-1', '1-2', etc...}
			vpcFrequency: 10,
			vfibAmplitude: 'low',
			vpcCount: 0,			// count of vpc's to be generated {0 - none, 1 - singlet, 2 - doublet, 3 - triplet}
			
			// array to simulate semi-random vpc
			vpcFrequencyArray: {},
			vpcFrequencyLength: 0,
			vpcFrequencyIndex: 0,
			
			setHeartRhythmModal: function() {
				var newECG = $('.ecg-select').children('option:selected').val();
				var newECGType = $('.ecg-select').children('option:selected').attr('data-type');
				
				// hide all options
				$('.control-modal-div.pea, .control-modal-div.amplitude, .control-modal-div.pulses, .control-modal-div.frequency').hide();
				
				// if pulse ECG then show PEA
				if(newECGType == 'pulse') {
					$('.control-modal-div.pea').show();							
				}
				
				// sinus - pulses
				if(newECG == 'sinus') {
					$('.control-modal-div.pulses, .control-modal-div.frequency').show();											
				}

				// vfib - pulses
				if(newECG == 'vfib') {
					$('.control-modal-div.amplitude').show();											
				}
			},
			
			calculateVPCFreq: function() {
				controls.heartRhythm.vpcFrequencyArray = new Array;

				// if 0% then set array to 0
				if(controls.heartRhythm.vpcFrequency == 0) {
					controls.heartRhythm.vpcFrequencyArray.push(0);
				} else if(controls.heartRhythm.vpcFrequency == 100) {
					controls.heartRhythm.vpcFrequencyArray.push(1);				
				} else {
					// get 100 samples for 100 cycles of sinus rhythm between 10 and 90
					for(var i = 0; i <= 99; i++) {
						if(Math.floor(Math.random() * 100) > controls.heartRhythm.vpcFrequency)  {
							controls.heartRhythm.vpcFrequencyArray.push(0);						
						} else {
							controls.heartRhythm.vpcFrequencyArray.push(1);
						}
					}
				}
				controls.heartRhythm.vpcFrequencyLength = controls.heartRhythm.vpcFrequencyArray.length;
			}
		},
		
		awRR: {
			value: 30,
			minValue: 0,
			maxValue: 60,
			slideBar: '',
			beatTimeout: 0,
			increment: 1,
			modalRate: 30,
			
			modalUnitsLabel: 'BPM',
			
			init: function() {
				if ( ! ( simmgr.isLocalDisplay() ) )
				{
					clearTimeout(controls.awRR.beatTimeout);
					controls.awRR.beatTimeout = setTimeout(controls.awRR.setSynch, Math.round((60 / controls.awRR.value) * 1000));
				}
				controls.awRR.displayValue();							
			},
			
			// Show dashes regardless of sensor state - used when a scenario ends.
			blankValue: function() {
				$('.awRR a.alt-control-rate').html('---<span class="vs-lower-label"> bpm</span>');
				$('#display-awRR').html('---');
			},

			displayValue: function() {
				if ( ! ( simmgr.isLocalDisplay() ) )
				{
// we do not want to reset the timer for awRR if a trend is occurring...
// at a scan rate of 500 msec the timer will just keep on getting reset.
// no waveform appears until the trend is completed.
//					clearTimeout(controls.awRR.beatTimeout);
//					controls.awRR.beatTimeout = setTimeout(controls.awRR.setSynch, Math.round((60 / controls.awRR.value) * 1000));
				}
				if ( ( profile.isVitalsMonitor == false ) || ( controls.CO2.leadsConnected == true ) ) {
					if( profile.isVitalsMonitor && ( controls.awRR.value == 0 || chart.resp.rrBlankCount > 0 ) ) {
						$('.awRR a.alt-control-rate').html('---<span class="vs-lower-label"> bpm</span>');
					} else {
						$('.awRR a.alt-control-rate').html(controls.awRR.value + '<span class="vs-lower-label"> bpm</span>');
					}
				} else {
					$('.awRR a.alt-control-rate').html('---<span class="vs-lower-label"> bpm</span>');
				}
			},
			
			setRespRate: function() {
				// get latest value from modal
				$('#display-awRR').html(controls.awRR.value);						
				rate = $('.strip-value.new').val();
				time = $('.transfer-time').val();
				
				// set controls and update new value
				controls.awRR.slideBar.slider( "value", parseInt( $('.strip-value.new').val() ) );
				simmgr.sendChange( { 'set:respiration:rate' : rate, 'set:respiration:transfer_time' : time } );
			},
			
			setSynch: function() {
// console.log('pixelCount: ' + chart.resp.pixelCount);
// console.log('periodCount: ' + chart.resp.periodCount);
// console.log(Math.round((60 / controls.awRR.value) * 1000));
// console.log(controls.awRR.value);
				chart.status.resp.synch = true;
				
				// set flag to mark start of breath
				chart.resp.breathStart = true;								
				return;
//				if ( ! ( simmgr.isLocalDisplay() ) )
//				{
//					controls.awRR.beatTimeout = setTimeout(controls.awRR.setSynch, Math.round((60 / controls.awRR.value) * 1000));
//				}
			},
			
			validateNewValue: function() {
				var newValue = parseInt($('.strip-value.new').val());
				if(newValue < controls.awRR.minValue || isNaN(newValue) == true) {
					$('.strip-value.new').val(controls.awRR.minValue);			
				} else if(newValue > controls.awRR.maxValue) {
					$('.strip-value.new').val(controls.awRR.maxValue);
				}
				controls.awRR.slideBar.slider( "value", parseInt( $('.strip-value.new').val() ) );
			}
		},
		
		chestRise: {
			active: false
		},
		
		inhalation_duration: {
			value: 500
		},

		pulseStrength: {
			value: "medium",
			left: {
				femoral: {
					value: "medium"
				},
				dorsal: {
					value: "medium"
				}
			}, 
			right: {
				femoral: {
					value: "medium"
				},
				dorsal: {
					value: "medium"
				}
			}
			
		},
		
		pulse: {
			// pulse palpate force detected
			PULSE_TOUCH_NONE: 0,
			PULSE_TOUCH_LIGHT: 1,
			PULSE_TOUCH_MEDIUM: 2,
			PULSE_TOUCH_HEAVY: 3,
			PULSE_TOUCH_EXCESSIVE: 4,
			
			// pulse palpate position detected
			PULSE_POSITION_NONE: 0,
			PULSE_POSITION_LEFT_FEMORAL: 4,
			
			position: 0,
			pressure: 0,
			
			left_femoral: 0,
			right_femoral: 0,
			left_dorsal: 0,
			right_dorsal: 0,
			
			left: {
				femoral: {
					sensitivity: 50
				},
				dorsal: {
					sensitivity: 50
				}
			}, 
			right: {
				femoral: {
					sensitivity: 50
				},
				dorsal: {
					sensitivity: 50
				}
			},
			
			slideBar: '',
			
			volumeMinValue: 0,
			volumeMaxValue: 100,
			volumeIncrement: 1,
			
			
			init: function() {
				this.position = this.PULSE_POSITION_NONE;
				this.pressure = this.PULSE_TOUCH_NONE;
				$('#button-palpate').css('cursor', 'default');
				this.setPalpateColor();
			},
			
			setPalpateColor: function() {
				var palpateClass = '';
				
				var palpateValue = Math.max(
										parseInt(controls.pulse.left_femoral), 
										parseInt(controls.pulse.right_femoral), 
										parseInt(controls.pulse.left_dorsal), 
										parseInt(controls.pulse.right_dorsal)
									);
				
				// icon is an aggregate of any pulse position being palpated
				if(palpateValue != this.PULSE_POSITION_LIGHT) {
					switch(palpateValue) {
						case this.PULSE_TOUCH_LIGHT:
							palpateClass = 'palp-light';		// yellow outline
							break;
						case this.PULSE_TOUCH_MEDIUM:
							palpateClass = 'palp-medium';		// green outline
							break;
						case this.PULSE_TOUCH_HEAVY:
						case this.PULSE_TOUCH_EXCESSIVE:
							palpateClass = 'palp-firm';		// red outline
							break;
						default:
							break;
					}
				}
				// the Pulse tile: faded hand when not palpated, dark hand with an
				// outline in the pressure colour when it is (common.css)
				$('#button-palpate').removeClass('palp-light palp-medium palp-firm').addClass(palpateClass)
					.prop('title', palpateClass ? 'Pulse being palpated' : 'Pulse palpation');
				return;
			},
			
			setPulseLabelColor: function(position, value) {
				var labelColor = '';
				switch(value) {
					case '0':
						labelColor = '#000000';
						break;
					case '1':
						labelColor = '#B3B300';
						break;
					case '2':
						labelColor = 'green';
						break;
					case '3':
					case '4':
						labelColor = 'red';
						break;
					default:
						break;
				}
				$('#' + position + '-pulse-dog-control-title').css('color', labelColor);
			}
		},
		
		ekg: {
			leadsConnected: false,
			connectHTML: "Disconnect EKG Leads",
			disconnectHTML: "Connect EKG Leads"
		},
		
		bpcuff: {
			leadsConnected: false,
			connectHTML: "Disconnect BP Cuff",
			disconnectHTML: "Connect BP Cuff"
		},
		
		SpO2: {
			value: 98,
			waveformType: 'normal',		// normal | poor | artifact - plethysmograph shape
			minValue: 0,
			maxValue: 100,
			slideBar: '',
			increment: 1,
			
			leadsConnected: false,
			connectHTML: 'Disconnect SpO2 Sensor',
			disconnectHTML: "Connect SpO2 Sensor",
			
			modalUnitsLabel: '%',
			
			init: function() {
				controls.SpO2.displayValue();			
			},
			
			validateNewValue: function() {
				var newValue = parseInt($('.strip-value.new').val());
				if(newValue < controls.SpO2.minValue || isNaN(newValue) == true) {
					$('.strip-value.new').val(controls.SpO2.minValue);			
				} else if(newValue > controls.SpO2.maxValue) {
					$('.strip-value.new').val(controls.SpO2.maxValue);
				}
				controls.SpO2.slideBar.slider( "value", parseFloat( $('.strip-value.new').val() ) );
			},
			
			// Show dashes regardless of sensor state - used when a scenario ends.
			blankValue: function() {
				$('#display-SpO2').html('---<span class="vs-lower-label"> %</span>');
			},

			displayValue: function(){
				if ( ( profile.isVitalsMonitor == false ) || ( controls.SpO2.leadsConnected == true  && !controls.heartRhythm.arrest) ) {
					$('#display-SpO2').html(controls.SpO2.value + '<span class="vs-lower-label"> %</span>');
				}
				else {
					$('#display-SpO2').html('---<span class="vs-lower-label"> %</span>');
				}
			}

		},

		// Direct (invasive) arterial blood pressure.
		//
		// The arterial line reads the same pressures the instructor already sets -
		// controls.nbp.systolicValue / diastolicValue, fed from the engine's
		// cardiac.bps_sys / bps_dia - but unlike the NIBP cuff, which only reports
		// when a cycle completes, it displays them continuously with a computed
		// mean and draws a pressure waveform synchronised to the ECG.
		abp: {
			lineConnected: false,		// arterial catheter placed and transducer zeroed
			waveformType: 'normal',		// normal | overdamped | underdamped | poor | cpr
			scaleMax: 160,				// mmHg at the top of the strip's pressure scale

			// Tooltips for the ABP button in the sensor row.
			connectHTML: 'Remove Arterial Line',
			disconnectHTML: 'Place Arterial Line',

			// Place or remove the line. The strip and its readout appear and
			// disappear with it, and the other channels re-divide the space.
			setLineConnected: function(on) {
				on = ( on == true );
				if( controls.abp.lineConnected == on ) {
					return false;
				}
				controls.abp.lineConnected = on;
				if( typeof chart !== 'undefined' && chart.setChannelEnabled ) {
					chart.setChannelEnabled('abp', on && controls.monitorMode.advanced);
				}
				return true;
			},

			// ---- the true pressures, as set by the instructor -------------------
			// These define the range the waveform is drawn across. They are what a
			// scenario sets and what a perfectly-transduced line would report.
			setSystolic: function() {
				var v = parseInt(controls.nbp.systolicValue);
				return isNaN(v) ? 0 : v;
			},

			setDiastolic: function() {
				var v = parseInt(controls.nbp.diastolicValue);
				return isNaN(v) ? 0 : v;
			},

			// ---- the pressures the monitor displays -----------------------------
			// Physiological states report the pressure that was set. Measurement
			// artifacts do not: their numbers come from the peak and trough of the
			// morphology actually being drawn, so the readout always agrees with the
			// trace, exactly as a real transducer misreports a true pressure.
			//
			// Scenario authors:
			//
			//   normal, poor perfusion, CPR
			//       The monitor displays the systolic and diastolic you set. A poorly
			//       perfused patient set to 70/40 reads 70/40; the waveform shape
			//       changes (slow upstroke, no dicrotic notch) but not the numbers.
			//
			//   overdamped, underdamped
			//       The numbers deviate, because that is what the artifact is. For a
			//       set pressure S/D:
			//           displayed systolic  = D + max * (S - D)
			//           displayed diastolic = D + min * (S - D)
			//
			//       morphology      min     max   | 120/80 displays as
			//       overdamped     0.14    0.76   | 110/86  (94)  narrowed
			//       underdamped   -0.06    1.41   | 136/78  (97)  widened
			//
			// Those multipliers are the measured min/max of the generated waveform
			// (chart.abp.waveformRange), not hand-maintained figures: retuning a
			// waveform in chart.initAbpWaveforms moves them automatically.
			displayedSystolic: function() {
				var s = controls.abp.setSystolic();
				if( s <= 0 || typeof chart === 'undefined' ) {
					return s;
				}
				var type = chart.abpWaveformType();
				if( ! chart.abpWaveformDistorts( type ) ) {
					return s;			// physiological state - reads true
				}
				var d = controls.abp.setDiastolic();
				return Math.round( d + ( chart.abpWaveformRange( type ).max * ( s - d ) ) );
			},

			displayedDiastolic: function() {
				var s = controls.abp.setSystolic();
				var d = controls.abp.setDiastolic();
				if( s <= 0 || typeof chart === 'undefined' ) {
					return d;
				}
				var type = chart.abpWaveformType();
				if( ! chart.abpWaveformDistorts( type ) ) {
					return d;			// physiological state - reads true
				}
				return Math.round( d + ( chart.abpWaveformRange( type ).min * ( s - d ) ) );
			},

			// MAP = DAP + (SAP - DAP) / 3, computed from the DISPLAYED pressures.
			//
			// This is the standard clinical estimate rather than the true area under
			// the waveform. A real monitor integrates, which would give a MAP a few
			// mmHg higher (96 rather than 93 for a normal 120/80) and one that barely
			// moves under damping. The estimate is used here because it is the
			// formula a scenario author can predict without running the waveform;
			// chart.abp.waveformRange[type].mean carries the integral if the true
			// area-under-curve mean is ever wanted instead.
			mean: function() {
				var s = controls.abp.displayedSystolic();
				var d = controls.abp.displayedDiastolic();
				if( s <= 0 ) {
					return 0;
				}
				return Math.floor( ( s - d ) / 3 ) + d;
			},

			init: function() {
				controls.abp.displayValue();
			},

			// Show dashes regardless of line state - used when a scenario ends.
			blankValue: function() {
				$('#display-abp').html('---');
				$('#display-abp-map').html('');
			},

			// Called once per beat from drawAbpPixel, as a monitor refreshes its
			// numerics on each pulse.
			displayValue: function() {
				if ( profile.isVitalsMonitor == true && controls.abp.lineConnected == false ) {
					$('#display-abp').html('---');
					$('#display-abp-map').html('');
					return;
				}
				if ( controls.abp.setSystolic() <= 0 ) {
					$('#display-abp').html('---');
					$('#display-abp-map').html('');
					return;
				}
				$('#display-abp').html( controls.abp.displayedSystolic() + '/' + controls.abp.displayedDiastolic() );
				$('#display-abp-map').html( '(' + controls.abp.mean() + ')<span class="vs-lower-label"> mmHg</span>' );
			}
		},

		// Pulmonary artery (Swan-Ganz) catheter.
		//
		// Unlike the arterial line, which reads pressures the instructor already
		// sets elsewhere, the right heart pressures are the catheter's own: nothing
		// else in the simulator models them. They come from cardiac.pac_* in the
		// engine and are set from the PA catheter dialog.
		//
		// The strip only exists while a catheter is in the patient. Placing one adds
		// a fifth waveform channel and the other four give up space for it; pulling
		// it out gives the space back. See chart.setChannelEnabled.
		pac: {
			placed: false,				// catheter in the patient
			position: 'cvp',			// cvp | ra | rv | pa | wedge - where the tip is

			// Right heart pressures, mmHg. Defaults are normal for a medium dog.
			raMean: 5,					// RA / CVP mean
			rvSys: 25,					// RV systolic
			rvDia: 5,					// RV end-diastolic
			paSys: 25,					// PA systolic - matches RV systolic across the
										// open pulmonic valve
			paDia: 12,					// PA diastolic - the step-up that says the
										// valve has been crossed
			wedgeMean: 9,				// PAWP / PCWP mean

			// What the monitor labels the trace, by position. The label changes with
			// the tip: the number means something different in each chamber.
			labels: { cvp: 'CVP', ra: 'RA', rv: 'RV', pa: 'PA', wedge: 'PAWP' },

			// Tooltips for the probe icon, matching the other sensors.
			connectHTML: 'Remove IBP2 Catheter',
			disconnectHTML: 'Place IBP2 Catheter',

			// Positions reported as a mean pressure rather than systolic/diastolic.
			// A venous or wedge trace has no meaningful systole.
			isMeanPosition: function(pos) {
				return ( pos == 'cvp' || pos == 'ra' || pos == 'wedge' );
			},

			// Show or hide the strip. Idempotent - chart.setChannelEnabled returns
			// immediately if nothing changed, so this is safe to call from a status
			// poll on every cycle.
			setPlaced: function(on) {
				on = ( on == true );
				if( controls.pac.placed == on ) {
					return;
				}
				controls.pac.placed = on;
				if( typeof chart !== 'undefined' && chart.setChannelEnabled ) {
					chart.setChannelEnabled('pac', on && controls.monitorMode.advanced);
				}
				controls.pac.displayValue();
			},

			setPosition: function(pos) {
				if( ! controls.pac.labels[pos] ) {
					pos = 'cvp';
				}
				controls.pac.position = pos;
				controls.pac.displayValue();
			},

			// PA mean = PAD + (PAS - PAD) / 3, the same clinical estimate the
			// arterial line uses. Reported alongside the PA systolic/diastolic
			// because PA mean is the number that drives clinical decisions.
			paMean: function() {
				return Math.floor( ( controls.pac.paSys - controls.pac.paDia ) / 3 ) + controls.pac.paDia;
			},

			init: function() {
				controls.pac.displayValue();
			},

			blankValue: function() {
				$('#display-pac-label').html('');
				$('#display-pac').html('---');
				$('#display-pac-sub').html('');
			},

			// Called once per beat from drawPacPixel, as a monitor refreshes its
			// numerics on each pulse.
			displayValue: function() {
				if( controls.pac.placed == false ) {
					controls.pac.blankValue();
					return;
				}
				var p = controls.pac.position;
				$('#display-pac-label').html( controls.pac.labels[p] );

				if( controls.pac.isMeanPosition(p) ) {
					var m = ( p == 'wedge' ) ? controls.pac.wedgeMean : controls.pac.raMean;
					$('#display-pac').html( m );
					$('#display-pac-sub').html( '<span class="vs-lower-label">mmHg</span>' );
					return;
				}
				if( p == 'rv' ) {
					$('#display-pac').html( controls.pac.rvSys + '/' + controls.pac.rvDia );
					$('#display-pac-sub').html( '<span class="vs-lower-label">mmHg</span>' );
					return;
				}
				// PA: systolic/diastolic with the mean, as the arterial line does
				$('#display-pac').html( controls.pac.paSys + '/' + controls.pac.paDia );
				$('#display-pac-sub').html( '(' + controls.pac.paMean() + ')<span class="vs-lower-label"> mmHg</span>' );
			}
		},

		etCO2: {
			value: 34,
			minValue: 0,
			maxValue: 100,
			slideBar: '',
			increment: 1,
			changeInProgressStatus: ETCO2_OK,
			manualETCO2Val: '---',
			delayCount: 0,
			waveformType: 'normal',		// 'normal', 'rebreathing', 'obstructive', 'curare'
			
			modalUnitsLabel: 'mmHg',
			
			init: function() {
				controls.etCO2.displayValue();
			},
			
			validateNewValue: function() {
				var newValue = parseInt($('.strip-value.new').val());
				if(newValue < controls.etCO2.minValue || isNaN(newValue) == true) {
					$('.strip-value.new').val(controls.SpO2.minValue);			
				} else if(newValue > controls.etCO2.maxValue) {
					$('.strip-value.new').val(controls.etCO2.maxValue);
				}
				controls.etCO2.slideBar.slider( "value", parseInt( $('.strip-value.new').val() ) );
			},
			
			// Show dashes regardless of sensor state - used when a scenario ends.
			blankValue: function() {
				$('#vs-etCO2 a').html('---<span class="vs-upper-label"> mmHg</span>');
				clearTimeout( chart.resp.blankTimer );
			},

			displayValue: function() {
				if ( profile.isVitalsMonitor == true ) {
					if( controls.CO2.leadsConnected == false || controls.etCO2.value == 0 ) {
						$('#vs-etCO2 a').html('---<span class="vs-upper-label"> mmHg</span>');
					} else {
						$('#vs-etCO2 a').html( chart.resp.lastETCO2 + '<span class="vs-upper-label"> mmHg</span>');
						clearTimeout( chart.resp.blankTimer );
					}
					
					// decrement rrBlankCount
					if( controls.CO2.leadsConnected == true && chart.resp.rrBlankCount > 0 ) {
						chart.resp.rrBlankCount--;
					}
					
					// begin timer for blankout
					chart.resp.blankTimer = setTimeout(
						function() {
							$('#vs-etCO2 a').html('---<span class="vs-upper-label"> mmHg</span>');							
						}, chart.RESP_ETCO2_BLANK_DELAY
					);
					
				} else {
						$('#vs-etCO2 a').html(controls.etCO2.value + '<span class="vs-upper-label"> mmHg</span>');					
				}
console.log("rrBlankCount: " + chart.resp.rrBlankCount);
				
				// since etco2.displayValue is only called at the end of a breathing waveform
				// we are using this point to determine when to start showing awRR
				if( profile.isVitalsDisplay && ( chart.resp.rrBlankCount > 0 ) ) {
					chart.resp.rrBlankCount--;
				}
				return;
/*
if(profile.isVitalsMonitor == true) {
console.log("ETCO2 Display Value0");
console.log("ETCO2 Display Value - chart.resp.manualBreathDisplayCount: " + chart.resp.manualBreathDisplayCount );
console.log("ETCO2 Display Value - controls.manualRespiration.inProgress: " + controls.manualRespiration.inProgress );
console.log("ETCO2 Display Value - controls.etCO2.changeInProgressStatus: " + controls.etCO2.changeInProgressStatus );
console.log("ETCO2 Display Value - chart.resp.rhythmIndex: " + chart.resp.rhythmIndex );
}


				var awRRHTML = $('.awRR a.alt-control-rate').html();
				// NOTE: Oct 1, 2018: This change was outstanding on vet.newforce.us. Checked in by TMK
			
				if ( awRRHTML.includes('---') == true && chart.resp.manualBreathDisplayCount == 0 ) {
					$('#vs-etCO2 a').html('---<span class="vs-upper-label"> mmHg</span>');					
				} else if ( ( profile.isVitalsMonitor == false ) || ( controls.CO2.leadsConnected == true ) ) {
					$('#vs-etCO2 a').html(controls.etCO2.value + '<span class="vs-upper-label"> mmHg</span>');	
				} else {
					$('#vs-etCO2 a').html('---<span class="vs-upper-label"> mmHg</span>');	
				}
*/				
			}
		},
		
		Tperi: {
			value: 98.0,
			minValue: 70.0,
			maxValue: 110.0,
			slideBar: '',
			increment: 0.1,
			leadsConnected: false,
			connectHTML: 'Disconnect Tperi Probe',
			disconnectHTML: "Connect Tperi Probe",
			
			modalUnitsLabel: '&deg;F',
			currentUnits: 'F',
			
			init: function() {
				// set dropdown for units
				if( typeof localStorage.tperiUnits != "undefined") {
					controls.Tperi.currentUnits = localStorage.tperiUnits;
				}
				simmgr.sendChange( { 'set:general:temperature_units' : controls.Tperi.currentUnits } );
				controls.Tperi.displayValue();
			},
			
			fahrToCent: function( fahrT ) {
				var fTemp = 0;
				if( typeof fahrT == "string") {
					fTemp = parseFloat( fahrT );
				} else {
					fTemp = fahrT;
				}
				var returnVal = (( fTemp  - 32) * 5/9).toFixed(1);
				return ( returnVal );
			},
			
			centToFahr: function( centT ) {
				return ( ( parseFloat( centT ) * 9/5) + 32 ).toFixed( 1 );
			},
			
			setModalValues: function( TperiUnits ) {				
				var newTperiVal = parseFloat( $('.strip-value.new').val() );
				if( TperiUnits == 'C' ) {
					// convert to Centigrade
					$('h2.modal-section-title').html("Tperi (&deg;C) ");
					
					// update min and max to C
					// the new displayed value is greater then 50, than the previous value was in F and we will need to convert
					if( newTperiVal > 50  ) {
						$('.strip-value.new').val( controls.Tperi.fahrToCent($('.strip-value.new').val()) );
					}
					
					$('.strip-value.current').val( controls.Tperi.fahrToCent(controls.Tperi.value) );
					
					$('.control-slider-1').slider({
						'value': parseFloat( $('.strip-value.current').val() ),
						'min': parseFloat(controls.Tperi.fahrToCent( controls.Tperi.minValue )),
						'max': parseFloat(controls.Tperi.fahrToCent( controls.Tperi.maxValue ))
					});
					
				} else {
					// convert to Fahrenheit
					$('h2.modal-section-title').html("Tperi (&deg;F) ");
					
					// update min and max to F
					// the new displayed value is greater then 50, than the previous value was in F and we will need to convert
					if( newTperiVal < 50  ) {
						$('.strip-value.new').val( controls.Tperi.centToFahr($('.strip-value.new').val()) );
					}
					$('.strip-value.current').val( controls.Tperi.value );
					$('.control-slider-1').slider({
						'value': parseFloat( $('.strip-value.current').val() ),
						'min': controls.Tperi.minValue,
						'max': controls.Tperi.maxValue
					});

				}

			},
			
			setValue: function(newValue) {
//console.log(newValue);
				if(newValue < controls.Tperi.minValue || isNaN(newValue) == true) {
					controls.Tperi.value = controls.Tperi.minValue;			
				} else if(newValue > controls.Tperi.maxValue) {
					controls.Tperi.value = controls.Tperi.maxValue;
				} else {
					controls.Tperi.value = newValue;
				}
//				controls.Tperi.displayValue();
			},
			
			validateNewValue: function() {
				var newValue = parseFloat($('.strip-value.new').val());
/*				if(newValue < controls.Tperi.minValue || isNaN(newValue) == true) {
					$('.strip-value.new').val(controls.Tperi.minValue);			
				} else if(newValue > controls.Tperi.maxValue) {
					$('.strip-value.new').val(controls.Tperi.maxValue);
				} */
				
				// use min and max values in slider itself
				var TperiMin = parseFloat( $('.strip-value.new').attr("min") );
				var TperiMax = parseFloat( $('.strip-value.new').attr("max") );
				if(newValue < TperiMin || isNaN(newValue) == true) {
					$('.strip-value.new').val( TperiMin );			
				} else if(newValue > TperiMax) {
					$('.strip-value.new').val(TperiMax);
				}
											
				$('.control-slider-1').slider( "value", parseFloat( $('.strip-value.new').val() ) );
			},
			
			// stored value will always be in Fahrenheit
			displayValue: function() {
				if ( ( profile.isVitalsMonitor == false ) || ( controls.Tperi.leadsConnected == true ) ) {
					// which units to be displayed?
					if( controls.Tperi.currentUnits == 'F' ) {
						$('#display-Tperi').html(controls.Tperi.value.toFixed(1) + '<span class="vs-lower-label"> &deg;F</span>');					
					} else {
						$('#display-Tperi').html( controls.Tperi.fahrToCent(controls.Tperi.value) + '<span class="vs-lower-label"> &deg;C</span>');										
					}
				} else {
					$('#display-Tperi').html('----' + '<span class="vs-lower-label"> &deg;' + controls.Tperi.currentUnits + '</span>');
				}
			}
		}, 

		CO2: {
			leadsConnected: false,
			connectHTML: 'Disconnect CO2 Sensor',
			disconnectHTML: "Connect CO2 Sensor"
		},
		
		vocals: {
			audio: new Audio(),
			fileName: '',
			repeat: false,
			slideBar: '',
			minValue: 1,
			maxValue: 10,
			increment: 1,
			value: 5,
			mute: false,
			
			init: function() {
				controls.vocals.displayMute();
			},
			
			displayMute: function() {
				if(controls.vocals.mute == true) {
					$('#vocals-mute').show();
				} else {
					$('#vocals-mute').hide();				
				}
			},
			
			displayRepeat: function() {
				if(controls.vocals.repeat == true) {
					$('#audio-control-repeat').children('img').addClass('selected');
					controls.vocals.audio.loop = true;
				} else {
					$('#audio-control-repeat').children('img').removeClass('selected');
					controls.vocals.audio.loop = false;				
				}
			}
		},
		
		media: {
			fileName: ''
		},
		
		nbp: {
			systolicValue: 120,
			minSystolicValue: 0,
			maxSystolicValue: 300,
			
			diastolicValue: 80,
			minDiastolicValue: 0,
			maxDiastolicValue: 290,
			
			meanValue: 0,
			
			nibp_read: -1,
			nibp_freq: 0,
			
			display_student_nibp: false,
			
			slideBarSystolic: '',
			slideBarDiastolic: '',
			slideBarLinkedHR: '',
			reportedHRValue: 70,
			previousReportedHRValue: 70,
			increment: 1,
			coupled: false,
			linkedHR: false,
			
			init: function() {
				controls.nbp.updateDisplayedNBP();
				if(profile.isVitalsMonitor) {
					controls.nbp.displayNIBPDashes();									
				}
				if( profile.isVitalsMonitor ) {
					$('#nibp-read-in-progress').hide();
				}
			},
			
			updateDisplayedNBP: function() {
				if(profile.isVitalsMonitor) {
					if(controls.nbp.display_student_nibp == true) {
						if(controls.nbp.diastolicValue == 0 && controls.nbp.systolicValue == 0) {
							// display dashes
							controls.nbp.displayNIBPDashes();					
						} else {
							// display values
							controls.nbp.displayNIBPValues();
						}
						controls.nbp.display_student_nibp = false;
					}
				} else {
					controls.nbp.displayNIBPValues();			
				}
			},
			
			displayNIBPDashes: function() {
				$('#displayed-systolic').html('---');
				$('#displayed-diastolic').html('---');
				
				// calculate mean NBP
				$('#displayed-meanNBP').html('---')
				
				// display reported HR
				$('#displayed-reportedHR').html('---');					
			},
			
			displayNIBPValues: function() {
				// update displayed NBP
				$('#displayed-systolic').html(controls.nbp.systolicValue);
				$('#displayed-diastolic').html(controls.nbp.diastolicValue);
				
				// calculate mean NBP
				controls.nbp.meanValue = Math.floor((controls.nbp.systolicValue - controls.nbp.diastolicValue) / 3) + parseInt(controls.nbp.diastolicValue);
				$('#displayed-meanNBP').html(controls.nbp.meanValue)
				
				// display reported HR
				$('#displayed-reportedHR').html(controls.nbp.reportedHRValue + ' <span class="nbip-label">bpm</span>');	
			},
						
			validateNewValue: function(type) {
				var newValue = 0;
				if(type == 'systolic') {
					newValue = parseInt($('.strip-value.new.systolic').val());
					if(newValue < controls.nbp.minSystolicValue || isNaN(newValue) == true) {
						$('.strip-value.new.systolic').val(controls.nbp.minSystolicValue);			
					} else if(newValue > controls.nbp.maxSystolicValue) {
						$('.strip-value.new.systolic').val(controls.nbp.maxSystolicValue);
					}
					controls.nbp.slideBarSystolic.slider( "value", parseInt( $('.strip-value.new.systolic').val() ) );
				} else if(type == 'diastolic') {
					newValue = parseInt($('.strip-value.new.diastolic').val());
					if(newValue < controls.nbp.minDiastolicValue || isNaN(newValue) == true) {
						$('.strip-value.new.diastolic').val(controls.nbp.minDiastolicValue);			
					} else if(newValue > controls.nbp.maxDiastolicValue) {
						$('.strip-value.new.diastolic').val(controls.nbp.maxDiastolicValue);
					}
					controls.nbp.slideBarDiastolic.slider( "value", parseInt( $('.strip-value.new.diastolic').val() ) );
				}
			},
			
			validateNewLinkedHRValue: function() {
				newValue = parseInt($('.strip-value.new.linked-hr').val());
				if(newValue < controls.heartRate.minValue || isNaN(newValue) == true) {
					$('.strip-value.new.linked-hr').val(controls.heartRate.minValue);			
				} else if(newValue > controls.heartRate.maxValue) {
					$('.strip-value.new.linked-hr').val(controls.heartRate.maxValue);
				}
				controls.nbp.slideBarLinkedHR.slider( "value", parseFloat( $('.strip-value.new.linked-hr').val() ) );
				controls.nbp.reportedHRValue = $('.strip-value.new.linked-hr').val();
				if(controls.nbp.linkedHR == true) {
					controls.nbp.previousReportedHRValue = $('.strip-value.new.linked-hr').val();
				}
			},
			
			setDiastolicValue: function(systolicSlideDifference) {
				// if sliders are coupled and diastolic = 0, do not move diastolic unil systolic is at least at value of 10.
				var currentDisatolicValue = $('.strip-value.new.diastolic').val();
				if(controls.nbp.coupled == true && ($('.strip-value.new.systolic').val() - currentDisatolicValue) >= 10) {
					$('.strip-value.new.diastolic').val(parseInt(currentDisatolicValue) + parseInt(systolicSlideDifference));
				} else if( ($('.strip-value.new.systolic').val() - currentDisatolicValue) < 10) {
					$('.strip-value.new.diastolic').val(parseInt($('.strip-value.new.systolic').val()) - 10)
				}
				controls.nbp.validateNewValue("diastolic");
				return;
			}, 
			
			setSystolicValue: function(diastolicSlideDifference) {
				// if sliders are coupled and systolic = 0, jump systolic to 10
				var currentSystolicValue = $('.strip-value.new.systolic').val();
				if(controls.nbp.coupled == true && (currentSystolicValue - $('.strip-value.new.diastolic').val()) >= 10) {
					$('.strip-value.new.systolic').val(parseInt(currentSystolicValue) + parseInt(diastolicSlideDifference));
				} else if( (currentSystolicValue - $('.strip-value.new.diastolic').val()) < 10) {
					$('.strip-value.new.systolic').val(parseInt($('.strip-value.new.diastolic').val()) + 10)
				}
				controls.nbp.validateNewValue("systolic");
				return;
			},
			
			updateSlideBar: function(type) {
				var systolicObj = $('.strip-value.new.systolic');
				var diastolicObj = $('.strip-value.new.diastolic');
				
				if(type == "diastolic") {
					if(controls.nbp.coupled == true) {
						diastolicObj.val(parseInt(systolicObj.val()) - 10);
					} else if((systolicObj.val() - 10) <= diastolicObj.val()) {
						diastolicObj.val(parseInt(systolicObj.val()) - 10);					
					}
				} else if(type == "systolic") {
					if(controls.nbp.coupled == true) {
						systolicObj.val(parseInt(diastolicObj.val()) + 10);
					} else if((systolicObj.val() - 10) <= diastolicObj.val()) {
						systolicObj.val(parseInt(diastolicObj.val()) + 10);					
					}
				}
				controls.nbp.validateNewValue(type);
				return;
			},
			
			setLinkedHRValue: function(linkedHRSlideDifference) {
				var currentLinkedHRValue = $('.strip-value.new.linked-hr').val();
				$('.strip-value.new.linked-hr').val(parseInt(currentLinkedHRValue) + parseInt(linkedHRSlideDifference));
				controls.nbp.validateNewLinkedHRValue();
				return;
			},
			
			linkedHRControl: function() {
				if(controls.nbp.linkedHR == true) {
					controls.nbp.reportedHRValue = controls.heartRate.value;
				} else {
					controls.nbp.reportedHRValue = controls.nbp.previousReportedHRValue;
				}
				$('input.strip-value.new.linked-hr').val(controls.nbp.reportedHRValue);
				controls.nbp.slideBarLinkedHR.slider( "value", parseInt( $('input.strip-value.new.linked-hr').val() ) );
				
				$('input.strip-value.new.linked-hr').prop('disabled', controls.nbp.linkedHR);
				controls.nbp.slideBarLinkedHR.slider('option', 'disabled', controls.nbp.linkedHR);
				$('a.control-incr-decr-rate.linked-hr').prop('disabled', controls.nbp.linkedHR);
				return;
			}
		},
		
		leftLung: {
			fileName: '',
			slideBar: '',
			minValue: 1,
			maxValue: 10,
			increment: 1,
			value: 5,
			mute: false,
			
			init: function() {
				controls.leftLung.displayMute();
			},
			
			displayMute: function() {
				if(controls.leftLung.mute == true) {
					$('#left-lung-mute').show();
				} else {
					$('#left-lung-mute').hide();				
				}
				controls.leftLung.slideBar.slider("option", "disabled", controls.leftLung.mute);
			}
		},
		
		rightLung: {
			fileName: '',
			slideBar: '',
			minValue: 1,
			maxValue: 10,
			increment: 1,
			value: 5,
			mute: false,
			
			init: function() {
				controls.rightLung.displayMute();
			},
			
			displayMute: function() {
				if(controls.rightLung.mute == true) {
					$('#right-lung-mute').show();
				} else {
					$('#right-lung-mute').hide();				
				}
				controls.rightLung.slideBar.slider("option", "disabled", controls.rightLung.mute);
			}
		},
		
		heartSound: {
			soundName: 'normal',
			slideBar: '',
			minValue: 1,
			maxValue: 10,
			increment: 1,
			value: 5,
			mute: false,
			
			displayMute: function() {
				if(controls.heartSound.mute == true) {
					$('#heart-sound-mute').show();
					controls.heartSound.slideBar.slider("option", "disabled", true);
				} else {
					$('#heart-sound-mute').hide();				
					controls.heartSound.slideBar.slider("option", "disabled", false);
				}
			}
		},
		
		cpr: {
			inProgress: false,
			running: 0,
			
			init: function() {
				controls.cpr.setCPRState();
				
				// bind event
				$('a.cpr-link').click(function() {
					if(controls.cpr.inProgress == false) {
						simmgr.sendChange( { 'set:cpr:compression' : 1 } );					
					} else {
						simmgr.sendChange( { 'set:cpr:compression' : 0 } );				
					}
				});
			},
			
			setCPRState: function() {
				if( typeof buttons !== 'undefined' && buttons.setCPRButton ) {
					buttons.setCPRButton();		// the Comps tile
				}
				if(controls.cpr.inProgress == false) {
					$('a.cpr-link').html('Start Comps (c)');
				} else {
					$('a.cpr-link').html('Stop Comps (c)');
				}
			}
		},
		
		manualRespiration: {
			inProgress: false,
			serverCount: 0,	// manual breath count as provided by server
			iiCount: 0,		// manual breath count as tracked by application
			manualBreathIndex: 0,	// count of pixels generated for manual ETCO2 waveform
			
			init: function() {
				// set count
				this.iiCount = this.serverCount;
				
				// bind control
				$('a.breath-link').click(function() {
					simmgr.sendChange( { 'set:respiration:manual_breath' : 1 } );				
				});
			},
			
			manualBreath: function() {
				this.iiCount = this.serverCount;
				this.inProgress = true;
				this.manualBreathIndex = 0;
				chart.resp.manualBreathDisplayCount = 0;
				
				// set flag to mark start of breath
				chart.resp.breathStart = true;
				
				// reset spontaneous breath parameters
				// clear out synch bit
				chart.status.resp.synch = false;
				// pixel count is used to track total number of pixels rendered in waveform
				chart.resp.pixelCount = 0;
				
				// index of current pattern pixel being displayed
				chart.resp.patternIndex = 0;
				
				// start pattern with pattern low...start of inhalation
				chart.resp.rhythmIndex = 'rest';
				
				chart.resp.length = chart.resp.rhythm[chart.resp.rhythmIndex].length;
			}
		
		}

	}
