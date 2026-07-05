/*
sim-ii: Copyright (C) 2019  VetSim, Cornell University College of Veterinary Medicine Ithaca, NY

See gpl.html
*/
	var modal = {
		imgTop: '50px',
		imgPadding: '0px',
		
		textTop: '200px',
		textPadding: '20px',
		textWidth: 300,
		
		fadeDelay: 200,
		
		defaultControlWidth: 400,
		
		showText: function(content, text_align) {
			if(typeof text_align == 'undefined') {
				text_align = 'center';
			} else {
				switch(text_align) {
					case 'left':
					case 'center':
						break;
					default:
						text_align = 'center';
						break;
				}
			}
			$('#modal #modal-content').append(content);
			$('#modal .container').width(modal.textWidth);
			$('#modal .container').css({
										'height': 'auto',
										'padding': modal.textPadding,
										'text-align': text_align,
										'top': modal.textTop
			});
			$('#modal').css('position', 'fixed').fadeIn(modal.fadeDelay);
			modal.bindCloseModal();
		},
		
		aboutModal: function() {		
			var controllerIP = "";
			if( controls.controllers.ip == "" ) {
				controllerIP = "No controller detected!"
			} else {
				controllerIP = "Controller found at IP Address: " + controls.controllers.ip;			
			}

			var content = '<div style="text-align: center;"><img src="./images/k9logo.png" width="100px">';
			content += '<h1>About Open VetSim Canine Simulator</h1></div><br/>';
			content += 'Release 2.42<br/>';
			content += 'Instructor Interface Release 2.42-WVS<br/>';
			content += 'Win Vet Sim Release ' + simmgr.wvsVersion + '<br/>';
			content += controllerIP + '<br/>';
			content += 'Controller Firmware Version:  ' + controls.controllers.fwVers + '<br/>';
			content += '------------------------------------<br/>';
			content += 'Tech Support: <a href="mailto: tech@k9cprtrainer.dog?subject=Open Vet Sim Tech Request">tech@k9cprtrainer.dog</a><br/>';
			content += '------------------------------------<br/>';
			content += 'Documentation can be found at <a href="https://vetsim.net" target="_blank">https://vetsim.net</a><br/>';
			content += 'Additional information can be found at <a href="https://vetsim.org" target="_blank">https://vetsim.org</a><br/>';
			content += '------------------------------------<br/>';
			content += 'All software, hardware, and mechanical designs are released under the GNU open source license.&nbsp&nbsp;';
			content += '<a href="https://k9cprtrainer.dog" target="_blank">https://www.k9cprtrainer.dog</a><br/>';
			this.showText(content, 'left');
			$('#modal .container').width('500px');
		},
		
		heartRate: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetSingleControlContent.php',
				type: 'post',
				async: false,
				data: {ModalTitle: 'Set Heart Rate', ControlTitle: "Heart Rate", ModalUnits: controls.heartRate.modalUnitsLabel},
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						modal.bindCloseModal();
						
						modal.initSingleSlider('heartRate');
						
						$('.strip-value').val(controls.heartRate.value);
						
						// bind apply button
						$('.modal-button.apply').click(function() {
							controls.heartRate.setHeartRate();
							modal.closeModal();
						});
						
						// bind change in new value
						$('.strip-value.new').change(controls.heartRate.validateNewValue);
						
						// bind increment and decrement
						$('.control-incr-decr-rate.decr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) - 1);
							controls.heartRate.validateNewValue();
						});
						$('.control-incr-decr-rate.incr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) + 1);
							controls.heartRate.validateNewValue();
						});
						
						// bind change of slider
						controls.heartRate.slideBar.slider({
							slide: function( sliderEvent, sliderUI ) {
								$('.strip-value.new').val( sliderUI.value );
							}
						});

					}
				}
			});
		},
		
		heartRhythm: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetHeartRhythmContent.php',
				type: 'post',
				async: false,
				data: {
						currentECG: controls.heartRhythm.currentRhythm, 
						currentAmplitude: controls.heartRhythm.vfibAmplitude, 
						currentPulse: controls.heartRhythm.vpcResponse, 
						currentPulseFrequency: controls.heartRhythm.vpcFrequency, 
						PEA: controls.heartRhythm.pea,
						arrest: controls.heartRhythm.arrest,
				},
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						modal.bindCloseModal();
						
						// heart rhythm controls
						controls.heartRhythm.setHeartRhythmModal();
						
						// see if we are in r on t, adjust minimum value and value accordingly
						var modalMinValue = (controls.heartRhythm.currentRhythm == 'vtach3') ? controls.heartRate.rOnTMinValue : controls.heartRate.normalMinValue;
						var modalValue = controls.heartRate.value;
						if(modalValue < modalMinValue) {
							modalValue = modalMinValue;
						}
						
						// bind controls
						// add step, min and max
/*
						$('.control-slider-1').attr({
							'step': controls.heartRate.increment,
							'min': modalMinValue,
							'max': controls.heartRate.maxValue
						}).val(modalValue);
			
						// bind controls
						controls.heartRate.slideBar = $(".control-slider-1").slider({
							'step': controls.heartRate.increment,
							'min': modalMinValue,
							'max': controls.heartRate.maxValue,
							'value': modalValue
						});
						
						$('.strip-value').val(modalValue);
*/
							var ecgMin = controls.heartRate.normalMinValue;
							var ecgValue = controls.heartRate.value;

						// bind controls
						$('.control-slider-1').val(ecgValue);
						controls.heartRate.slideBar = $(".control-slider-1").slider({
							value: ecgValue,
							min: ecgMin,
							max: controls.heartRate.maxValue,
							step: 1,
							slide: function(event, ui) {
								$('.strip-value.new').val(ui.value);
							}
						});
						$('.strip-value').val(ecgValue);





						
						// bind apply button
						$('.modal-button.apply').click(function() {
							controls.heartRate.setHeartRate();
							
							// send values to sim mgr
							simmgr.sendChange({
												'set:cardiac:rhythm': $('select.ecg-select option:selected').val(),
												'set:cardiac:vpc': $('select.pulse-select option:selected').val(),
												'set:cardiac:pea': ($('input#PEA').is(':checked') == true) ? 1 : 0,
												'set:cardiac:arrest': ($('input#arrest').is(':checked') == true) ? 1 : 0,
												'set:cardiac:vpc_freq': $('select.frequency-select option:selected').val(),
												'set:cardiac:vfib_amplitude': $('select.amplitude-select option:selected').val(),
												'set:cardiac:rate': $('.strip-value.new').val()												
											});
							
							modal.closeModal();
						});
						
						// bind change in new value
						$('.strip-value.new').change(controls.heartRate.validateNewValue);
						
						// bind increment and decrement
						$('.control-incr-decr-rate.decr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) - 1);
							controls.heartRate.validateNewValue();
						});
						$('.control-incr-decr-rate.incr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) + 1);
							controls.heartRate.validateNewValue();
						});
						
						// bind ecg rhythm select
						$('select.ecg-select').change(function() {
							var ecgMin = controls.heartRate.normalMinValue;
							var ecgValue = controls.heartRate.value;
							if($(this).children('option:selected').val() == 'vtach3') {
								ecgMin = controls.heartRate.rOnTMinValue;
								if(ecgValue < controls.heartRate.rOnTMinValue) {
									ecgValue = controls.heartRate.rOnTMinValue;
								}
							} else if($(this).children('option:selected').val() != 'asystole' && $(this).children('option:selected').val() != 'vfib') {
								if(controls.heartRhythm.currentRhythm == 'asystole' || controls.heartRhythm.currentRhythm == 'vfib') {
									ecgValue = 100;
								}
							}
							controls.heartRhythm.setHeartRhythmModal();

							// bind controls
							$('.control-slider-1').val(ecgValue);
							controls.heartRate.slideBar = $(".control-slider-1").slider({
								value: ecgValue,
								min: ecgMin,
								max: controls.heartRate.maxValue,
								step: 1,
								slide: function(event, ui) {
									$('.strip-value.new').val(ui.value);
								}
							});
							$('.strip-value').val(ecgValue);
						});						
					}
				}
			});
		},

		awRR: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetSingleControlContent.php',
				type: 'post',
				async: false,
				data: {ModalTitle: 'Set Respiration Rate', ControlTitle: "Respiration Rate", ModalUnits: controls.awRR.modalUnitsLabel},
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						modal.bindCloseModal();

						modal.initSingleSlider('awRR');
						
						$('.strip-value').val(controls.awRR.modalRate);
						
						// bind apply button
						$('.modal-button.apply').click(function() {
							controls.awRR.setRespRate();
							modal.closeModal();
						});
						
						// bind change in new value
						$('.strip-value.new').change(controls.awRR.validateNewValue);
						
						// bind increment and decrement
						$('.control-incr-decr-rate.decr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) - 1);
							controls.awRR.validateNewValue();
						});
						$('.control-incr-decr-rate.incr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) + 1);
							controls.awRR.validateNewValue();
						});
						
						// bind change of slider
						controls.awRR.slideBar.slider({
							slide: function( sliderEvent, sliderUI ) {
								$('.strip-value.new').val( sliderUI.value );
							}
						});
					}
				}
			});
		},
		
		SpO2: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetSingleControlContent.php',
				type: 'post',
				async: false,
				data: {ModalTitle: 'Set SpO<sub>2</sub>', ControlTitle: "SpO<sub>2</sub>", ModalUnits: controls.SpO2.modalUnitsLabel},
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						modal.bindCloseModal();
						
						modal.initSingleSlider('SpO2');

						$('.strip-value').val(controls.SpO2.value);
						
						// bind apply button
						$('.modal-button.apply').click(function() {
							rate = $('.strip-value.new').val();
							time = $('.transfer-time').val();

							simmgr.sendChange( { 'set:respiration:spo2' : rate, 'set:respiration:transfer_time' : time } );
							modal.closeModal();
						});
						
						// bind change in new value
						$('.strip-value.new').change(controls.SpO2.validateNewValue);
						
						// bind increment and decrement
						$('.control-incr-decr-rate.decr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) - 1);
							controls.SpO2.validateNewValue();
						});
						$('.control-incr-decr-rate.incr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) + 1);
							controls.SpO2.validateNewValue();
						});
						
						// bind change in slider
						controls.SpO2.slideBar.slider({
							slide: function( sliderEvent, sliderUI ) {
								$('.strip-value.new').val( sliderUI.value );
							}
						});
					}
				}
			});
		},
		
		etCO2: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetSingleControlContent.php',
				type: 'post',
				async: false,
				data: {ModalTitle: 'Set etCO<sub>2</sub>', ControlTitle: "etCO<sub>2</sub>", ModalUnits: controls.etCO2.modalUnitsLabel},
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						modal.bindCloseModal();
						
						modal.initSingleSlider('etCO2');

						$('.strip-value').val(controls.etCO2.value);
						
						// bind apply button
						$('.modal-button.apply').click(function() {
							rate = $('.strip-value.new').val();
							time = $('.transfer-time').val();

							simmgr.sendChange( { 'set:respiration:etco2' : rate, 'set:respiration:transfer_time' : time } );
							modal.closeModal();
						});
						
						// bind change in new value
						$('.strip-value.new').change(controls.etCO2.validateNewValue);
						
						// bind increment and decrement
						$('.control-incr-decr-rate.decr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) - 1);
							controls.etCO2.validateNewValue();
						});
						$('.control-incr-decr-rate.incr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) + 1);
							controls.etCO2.validateNewValue();
						});
						
						// bind change in slider
						controls.etCO2.slideBar.slider({
							slide: function( sliderEvent, sliderUI ) {
								$('.strip-value.new').val( sliderUI.value );
							}
						});

					}
				}
			});
		},
		
		respRhythm: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetEtCO2WaveformContent.php',
				type: 'post',
				async: false,
				data: {
					currentWaveform: (controls.etCO2 && controls.etCO2.waveformType) ? controls.etCO2.waveformType : 'normal'
				},
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						modal.bindCloseModal();

						modal.initSingleSlider('etCO2');

						$('.strip-value').val(controls.etCO2.value);

						// bind apply button
						$('.modal-button.apply').click(function() {
							var waveform = $('select.co2-waveform-select option:selected').val();
							var etco2val = $('.strip-value.new').val();
							var transferTime = $('.transfer-time option:selected').val();

							simmgr.sendChange({
								'set:respiration:co2_waveform': waveform,
								'set:respiration:etco2': etco2val,
								'set:respiration:transfer_time': transferTime
							});
							modal.closeModal();
						});

						// bind change in new value
						$('.strip-value.new').change(controls.etCO2.validateNewValue);

						// bind increment and decrement
						$('.control-incr-decr-rate.decr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) - 1);
							controls.etCO2.validateNewValue();
						});
						$('.control-incr-decr-rate.incr-rate').click(function() {
							$('.strip-value.new').val(parseInt($('.strip-value.new').val()) + 1);
							controls.etCO2.validateNewValue();
						});

						// bind change of slider
						controls.etCO2.slideBar.slider({
							slide: function( sliderEvent, sliderUI ) {
								$('.strip-value.new').val( sliderUI.value );
							}
						});
					}
				}
			});
		},

		Tperi: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetTperiControlContent.php',
				type: 'post',
				async: false,
				data: {ModalTitle: 'Set Tperi', ControlTitle: "Tperi", ModalUnits: controls.Tperi.modalUnitsLabel},
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						modal.bindCloseModal();
						
						modal.initSingleSlider('Tperi');

						parseFloat( $('.strip-value').val( controls.Tperi.value ) ).toFixed( 1 );
						
						$('select.tperi-units-select option').attr("selected", false);
						$('select.tperi-units-select option[value=' + controls.Tperi.currentUnits + ']').attr("selected", true);						
						controls.Tperi.setModalValues( controls.Tperi.currentUnits );
						
						// apply slider response
						$('.control-slider-1').slider({
							slide: function( slideEvent, slideUI ) {
								$( '.strip-value.new' ).val( slideUI.value );
							}
						});
						
						// bind apply button
						$('.modal-button.apply').click(function() {
//							controls.Tperi.value = parseFloat($('.strip-value.new').val());
//							controls.Tperi.displayValue();
							localStorage.tperiUnits = controls.Tperi.currentUnits = $('select.tperi-units-select option:selected').val();
							// convert if necessary
							var TperiValue = $('.strip-value.new').val();
							if( localStorage.tperiUnits == 'C' ) {
								TperiValue = controls.Tperi.centToFahr( $('.strip-value.new').val() );
							} 
							
							simmgr.sendChange( { 'set:general:temperature' : parseFloat( TperiValue ) * 10, 
												 'set:general:transfer_time' : $('.transfer-time option:selected').val(),
												  'set:general:temperature_units' : localStorage.tperiUnits } );
							modal.closeModal();
						});
						
						// bind change in new value
						$('.strip-value.new').change(controls.Tperi.validateNewValue);
						
						// bind increment and decrement
						$('.control-incr-decr-rate.decr-rate').click(function() {
							$('.strip-value.new').val( (parseFloat($('.strip-value.new').val()) - controls.Tperi.increment).toFixed(1) );
							controls.Tperi.validateNewValue();							
						});
						$('.control-incr-decr-rate.incr-rate').click(function() {
							$('.strip-value.new').val( (parseFloat($('.strip-value.new').val()) + controls.Tperi.increment).toFixed(1) );
							controls.Tperi.validateNewValue();
						});
						
						// bind change of units
						$('select.tperi-units-select').change(function() {
							controls.Tperi.setModalValues( $(this).val() );
						});
					}
				}
			});
		},
		
		chestRise: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetChestRiseControlContent.php',
				type: 'post',
				async: false,
				data: {ModalTitle: 'Control Chest Movement', ControlTitle: "Chest Movement", ChestRise: controls.chestRise.active},
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						modal.bindCloseModal();
						
						// bind change in control
						$('.modal-button.apply').click(function() {
							simmgr.sendChange({'set:respiration:chest_movement': ($('select.chest-rise').children('option:selected').val() == 'true') ? 1 : 0});
							modal.closeModal();
						});

						// bind change in checst movement
						$('select.chest-rise').change(function() {
//							var chestMovement = ($(this).children('option:selected').val() == 'true') ? 1 : 0;
//							simmgr.sendChange({'set:respiration:chest_movement': chestMovement});
						});
					
					}
				}
			});
		},

		pulseStrength: function(side, pulseType) {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetPulseStrengthControlContent.php',
				type: 'post',
				async: false,
				data: {s: side, p: pulseType, PulseStrength: controls.pulseStrength[side][pulseType].value},
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						modal.bindCloseModal();
						
						// set checkbox
						$('input.pulse-strength').prop('checked', false);
						$('input.pulse-strength[value=' + controls.pulseStrength[side][pulseType].value + ']').prop('checked', true);
						
						// bind change
						$('input.pulse-strength').change(function() {
//							simmgr.sendChange({'set:cardiac:pulse_strength': $(this).val()});
						});
						
						// volume change
						// NOTE:  volume in this context is referring to touch sensitivity
						$('#volume-controls').css({
													'float': 'none',
													'margin': '0 auto'
													});
						$('.volume-setting').html(controls.pulse[side][pulseType].sensitivity);
						
						// add step, min and max
						$("#volume-slider").attr({
							min: controls.pulse.volumeMinValue,
							max: controls.pulse.volumeMaxValue,
							step: controls.pulse.volumeIncrement,
						}).val(controls.pulse[side][pulseType].sensitivity);
						
						// bind controls
						controls.pulse.slideBar = $("#volume-slider").slider({
							min: controls.pulse.volumeMinValue,
							max: controls.pulse.volumeMaxValue,
							step: controls.pulse.volumeIncrement,
							value: controls.pulse[side][pulseType].sensitivity
						});
						
						$('#volume-slider').slider({
							slide: function( slideEvent, slideUI ) {
								$('.volume-setting').html( slideUI.value );
							}
						});

						
						// bind change in control
						$('.modal-button.apply').click(function() {
							if(side == 'left') {
								if(pulseType == 'femoral') {
									simmgr.sendChange({'set:cardiac:left_femoral_pulse_strength': $('input.pulse-strength:checked').val()});
									simmgr.sendChange({'set:cardiac:left_femoral_pulse_sensitivity': $('#volume-slider').slider( "value" )});
								} else {
									simmgr.sendChange({'set:cardiac:left_dorsal_pulse_strength': $('input.pulse-strength:checked').val()});								
									simmgr.sendChange({'set:cardiac:left_dorsal_pulse_sensitivity': $('.volume-setting').html()});
								}
							} else if(side == 'right') {
								if(pulseType == 'femoral') {
									simmgr.sendChange({'set:cardiac:right_femoral_pulse_strength': $('input.pulse-strength:checked').val()});
									simmgr.sendChange({'set:cardiac:right_femoral_pulse_sensitivity': $('.volume-setting').html()});
								} else {
									simmgr.sendChange({'set:cardiac:right_dorsal_pulse_strength': $('input.pulse-strength:checked').val()});								
									simmgr.sendChange({'set:cardiac:right_dorsal_pulse_sensitivity': $('.volume-setting').html()});
								}							
							}
							
							/*
							const params = [];
							obj = {['set:cardiac:' + side + '_' + pulseType + '_pulse_strength'] : $('input.pulse-strength:checked').val()};
							params.push(obj);
console.dir(params);
							simmgr.sendChange({params});
							*/
							modal.closeModal();
						});

					}
				}
			});
		},
		
		nbp: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetNBPControlContent.php',
				type: 'post',
				async: false,
				data: {ModalTitle: 'Set Non Invasive BP'},
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						$('#modal .container').css('top', '100px');
						modal.bindCloseModal();
						
						// init values
						$('.strip-value.systolic').val(parseInt(controls.nbp.systolicValue));
						$('.strip-value.diastolic').val(parseInt(controls.nbp.diastolicValue));
						$('.strip-value.linked-hr').val(parseInt(controls.nbp.reportedHRValue));
						$('#nbp-control-coupled').prop('checked', controls.nbp.coupled);
						$('select.read-time option[value=' + controls.nbp.nibp_freq + ']').attr('selected', true);
						
						// bind controls
						$(".control-slider-1.systolic").attr({
							min: controls.nbp.minSystolicValue,
							max: controls.nbp.maxSystolicValue,
							step: controls.nbp.increment,
						}).val(controls.nbp.systolicValue);
						
						// bind controls
						controls.nbp.slideBarSystolic = $(".control-slider-1.systolic").slider({
							min: controls.nbp.minSystolicValue,
							max: controls.nbp.maxSystolicValue,
							step: controls.nbp.increment,
							value: controls.nbp.systolicValue
						});
						
						// change in systolic value
						$(".control-slider-1.systolic").slider({
							slide: function( slideEvent, slideUI ) {
								var slideDifference =  slideUI.value - $('.strip-value.new.systolic').val();
								$('.strip-value.new.systolic').val( slideUI.value );
								controls.nbp.setDiastolicValue( slideDifference );						
							}
							
						});
												
						$(".control-slider-1.diastolic").attr({
							min: controls.nbp.minDiastolicValue,
							max: controls.nbp.maxDiastolicValue,
							step: controls.nbp.increment,
						}).val(controls.nbp.diastolicValue);
						
						// bind controls
						controls.nbp.slideBarDiastolic = $(".control-slider-1.diastolic").slider({
							min: controls.nbp.minDiastolicValue,
							max: controls.nbp.maxDiastolicValue,
							step: controls.nbp.increment,
							value: controls.nbp.diastolicValue
						});
						
						// change in diastolic value
						$(".control-slider-1.diastolic").slider({
							slide: function( slideEvent, slideUI ) {
								var slideDifference =  slideUI.value - $('.strip-value.new.diastolic').val();
								$('.strip-value.new.diastolic').val( slideUI.value );
								controls.nbp.setSystolicValue( slideDifference );	
							}
						});

						// linked hr
						$(".control-slider-1.linked-hr").attr({
							min: controls.heartRate.minValue,
							max: controls.heartRate.maxValue,
							step: controls.heartRate.increment
						}).val(controls.nbp.reportedHRValue);
						
						// bind controls
						controls.nbp.slideBarLinkedHR = $(".control-slider-1.linked-hr").slider({
							min: controls.heartRate.minValue,
							max: controls.heartRate.maxValue,
							step: controls.heartRate.increment,
							value: controls.nbp.reportedHRValue
						});
						
						// change in linked hr value value
						$(".control-slider-1.linked-hr").slider({
							slide: function( slideEvent, slideUI ) {
								var slideDifference =  slideUI.value - $('.strip-value.new.linked-hr').val();
								controls.nbp.previousReportedHRValue = slideUI.value;
								$('.strip-value.new.linked-hr').val( slideUI.value );
							}
						});
						
						// set disabled linkd hr control
						$('#nbp-control-coupled-hr').prop('checked', controls.nbp.linkedHR);
						//controls.nbp.linkedHRControl();
						$('.strip-value.current.linked-hr').val($('.strip-value.new.linked-hr').val());
						
						// bind change in new value
						$('.strip-value.new.systolic').change(function() {
							controls.nbp.validateNewValue('systolic');
							controls.nbp.updateSlideBar('diastolic');
						});
						$('.strip-value.new.diastolic').change(function() {
							controls.nbp.validateNewValue('diastolic');
							controls.nbp.updateSlideBar('systolic');
						});
						
						// bind change in coupled checkbox
						$('#nbp-control-coupled').change(function() {
							if($(this).is(':checked') == true) {
								controls.nbp.coupled = true;
							} else {
								controls.nbp.coupled = false;
							}
						});
						
						// bind change in linked HR checkbox
						$('#nbp-control-coupled-hr').change(function() {
							if($(this).is(':checked') == true) {
								controls.nbp.linkedHR = true;
							} else {
								controls.nbp.linkedHR = false;
							}
							controls.nbp.linkedHRControl();
						});
						
						// bind increment and decrement
						$('.control-incr-decr-rate.decr-rate.systolic').click(function() {
							$('.strip-value.new.systolic').val((parseInt($('.strip-value.new.systolic').val()) - controls.nbp.increment));
							controls.nbp.validateNewValue('systolic');
							controls.nbp.updateSlideBar('diastolic');
						});
						$('.control-incr-decr-rate.incr-rate.systolic').click(function() {
							$('.strip-value.new.systolic').val((parseInt($('.strip-value.new.systolic').val()) + controls.nbp.increment));
							controls.nbp.validateNewValue('systolic');
							controls.nbp.updateSlideBar('diastolic');
						});
						$('.control-incr-decr-rate.decr-rate.diastolic').click(function() {
							$('.strip-value.new.diastolic').val((parseInt($('.strip-value.new.diastolic').val()) - controls.nbp.increment));
							controls.nbp.validateNewValue('diastolic');
							controls.nbp.updateSlideBar('systolic');
						});
						$('.control-incr-decr-rate.incr-rate.diastolic').click(function() {
							$('.strip-value.new.diastolic').val((parseInt($('.strip-value.new.diastolic').val()) + controls.nbp.increment));
							controls.nbp.validateNewValue('diastolic');
							controls.nbp.updateSlideBar('systolic');
						});
						$('.control-incr-decr-rate.decr-rate.linked-hr').click(function() {
							$('.strip-value.new.linked-hr').val((parseInt($('.strip-value.new.linked-hr').val()) - controls.nbp.increment));
							controls.nbp.validateNewLinkedHRValue();
						});
						$('.control-incr-decr-rate.incr-rate.linked-hr').click(function() {
							$('.strip-value.new.linked-hr').val((parseInt($('.strip-value.new.linked-hr').val()) + controls.nbp.increment));
							controls.nbp.validateNewLinkedHRValue();
						});
												
						// bind change in control
						$('.modal-button.apply').click(function() {
							//controls.nbp.systolicValue = $('.strip-value.new.systolic').val();
							//controls.nbp.diastolicValue = $('.strip-value.new.diastolic').val();
							
							// if hr controls are not linked, save reported value as previous.
							if(controls.nbp.linkedHR == true) {
							
							} else {
							
							}
							
							//controls.nbp.reportedHRValue = $('.strip-value.new.linked-hr').val();
							
							// update displayed values for NBP
							//controls.nbp.updateDisplayedNBP();
							
							// report dis, sys, and linked HR
							simmgr.sendChange({
												'set:cardiac:bps_dia': $('.strip-value.new.diastolic').val(), 
												'set:cardiac:bps_sys': $('.strip-value.new.systolic').val(),
											    'set:cardiac:nibp_rate': $('.strip-value.new.linked-hr').val(),
												'set:cardiac:nibp_freq': $('.read-time option:selected').val(),
												'set:cardiac:nibp_linked_hr': ($('#nbp-control-coupled-hr').is(':checked')) ? 1 : 0,
												'set:cardiac:transfer_time': $('.transfer-time option:selected').val()
											});
							modal.closeModal();
						});
					}
				}
			});
		},
		
		vocals: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetVocalsControlContent.php',
				type: 'post',
				async: false,
				dataType: 'json',
				data: {'vocals': JSON.stringify(scenario.scenarioVocals)},
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						
						// highlight previous vocal file
						$('#vocal-list li a span').each(function() {
							if($(this).parent().attr('data-filename') == controls.vocals.fileName) {
								$(this).addClass('selected');
								controls.vocals.audio.src = BROWSER_SCENARIOS + scenario.currentScenarioFileName + '/vocals/' + controls.vocals.fileName;
								controls.vocals.audio.loop = false;
							}
						});
						
						// clear out repeat
						controls.vocals.repeat = false;

						// adjust css
						$('.control-modal-div').css({'height': 'auto', 'text-align': 'left'});
						
						// bind filename click
						$('#vocal-list li a').click(function() {
							controls.vocals.fileName = $(this).attr('data-filename');
							$('#vocal-list li a span').removeClass('selected');
							$(this).children('span').addClass('selected');
							controls.vocals.audio.src = BROWSER_SCENARIOS + scenario.currentScenarioFileName + '/vocals/' + controls.vocals.fileName;
							simmgr.sendChange({
								'set:vocals:filename': controls.vocals.fileName
							});

						});
						$('#vocal-list li a').dblclick(function() {
							controls.vocals.fileName = $(this).attr('data-filename');
							$('#vocal-list li a span').removeClass('selected');
							$(this).children('span').addClass('selected');
							controls.vocals.audio.src = BROWSER_SCENARIOS + scenario.currentScenarioFileName + '/vocals/' + controls.vocals.fileName;
							controls.vocals.audio.load();
							controls.vocals.audio.addEventListener('ended', simmgr.endAudio );
							controls.vocals.audio.play();
							simmgr.sendChange({
								'set:vocals:filename': controls.vocals.fileName,
								'set:vocals:play': 1
							});

						});
						
						// play button
						$('#audio-control-play').click(function() {
							if(controls.vocals.fileName != '' && controls.vocals.mute != true) {
								controls.vocals.audio.load();
								controls.vocals.audio.addEventListener('ended', simmgr.endAudio );
								controls.vocals.audio.play();
								simmgr.sendChange({'set:vocals:play': 1});								
							}
						});
						
						// stop button
						$('#audio-control-stop').click(function() {
							if(controls.vocals.fileName != '') {
								controls.vocals.audio.load();
								controls.vocals.repeat = false;
								$('#audio-control-repeat img').removeClass('selected');							
								controls.vocals.audio.loop = false;
								simmgr.sendChange({'set:vocals:play': 0});
							}
						});
						
						// repeat button
						$('#audio-control-repeat').click(function() {
							if(controls.vocals.repeat == false) {
								controls.vocals.repeat = true;
								
								// set repeat bit
								simmgr.sendChange({'set:vocals:repeat': 1});
							} else {
								controls.vocals.repeat = false;
								
								// clear repeat bit
								simmgr.sendChange({'set:vocals:repeat': 0});
							}
							controls.vocals.displayRepeat();
						});
						
						// volume control
						$("#volume-slider").attr({
							'min': controls.vocals.minValue,
							'max': controls.vocals.maxValue,
							'step': controls.vocals.increment
						}).val(controls.vocals.value);
						$('.volume-setting').html($('#volume-slider').val());
						
						// bind controls
						controls.vocals.slideBar = $("#volume-slider").slider({
							'min': controls.vocals.minValue,
							'max': controls.vocals.maxValue,
							'step': controls.vocals.increment,
							'value': controls.vocals.value
						});
						
						$('#volume-slider').slider({
							slide: function( slideEvent, slideUI ) {
								$('.volume-setting').html( slideUI.value );
								simmgr.sendChange({'set:vocals:volume': slideUI.value });
							}
						});
						
						// mute button
						$('#mute-volume').prop('checked', controls.vocals.mute);
						
						// mute change
						$('#mute-volume').change(function() {
							if($(this).prop('checked') == true) {
								controls.vocals.mute = true;

								// set mute
								simmgr.sendChange({'set:vocals:mute': 1});
								// mute
								controls.vocals.audio.mute = true;
								
							} else {
								controls.vocals.mute = false;
					
								// clear mute
								simmgr.sendChange({'set:vocals:mute': 0});								
								// mute
								controls.vocals.audio.mute = false;
							}
							$('#mute-volume').prop('checked', controls.vocals.mute);
							controls.vocals.displayMute();							
							controls.vocals.slideBar.slider("option", "disabled", controls.vocals.mute);
						});
						
						// init mute display
						controls.vocals.slideBar.slider("option", "disabled", controls.vocals.mute);
						
						// bind close of modal to stop sound
						$('a.close_modal, button.cancel').click(function() {
							if(controls.vocals.fileName != '') {
								controls.vocals.audio.load();
								controls.vocals.repeat = false;
								$('#audio-control-repeat img').removeClass('selected');							
								controls.vocals.audio.loop = false;
							}
							modal.closeModal();
						});						
					}
				}
			});
		},
		
		leftLung: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetLungSoundContent.php',
				type: 'post',
				async: false,
				dataType: 'json',
				data: {'side': 'left', 'fileName': controls.leftLung.fileName},
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						$('#modal .container').css('width', '300px');
						$('#modal .container .control-modal-div').css('width', '300px');
						$('#volume-controls').css({
													'float': 'none',
													'margin': '0 auto'
													});
						$('.volume-setting').html(controls.leftLung.value);
						modal.initLungSoundSlider('left');
						
						// init mute button
						$('#mute-volume').prop('checked', controls.leftLung.mute);
						
						// init slidebar
						controls.leftLung.displayMute();							
						
						// mute change
						$('#mute-volume').change(function() {
							if($(this).prop('checked') == true) {
								controls.leftLung.mute = true;
							} else {
								controls.leftLung.mute = false;							
							}
							$('#mute-volume').prop('checked', controls.leftLung.mute);
							controls.leftLung.displayMute();							
//							simmgr.sendChange({'set:respiration:left_lung_sound_mute': (controls.leftLung.mute == true) ? 1 : 0});						
						});
						
						// change of sound select
						$('#sound-select').change(function() {
							controls.leftLung.fileName = $(this).children('option:selected').val();
//							simmgr.sendChange({'set:respiration:left_lung_sound': controls.leftLung.fileName});						
						});
						
						// bind change to apply button
						$('button.apply').click(function() {
							simmgr.sendChange({'set:respiration:left_lung_sound_mute': (controls.leftLung.mute == true) ? 1 : 0});						
							simmgr.sendChange({'set:respiration:left_lung_sound': $('#sound-select').children('option:selected').val()});												
							simmgr.sendChange({'set:respiration:left_lung_sound_volume': $('#volume-slider').slider("value")});
							modal.closeModal();
						});
						
						modal.bindCloseModal();
					}
				}
			});
		},
		
		rightLung: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetLungSoundContent.php',
				type: 'post',
				async: false,
				dataType: 'json',
				data: {'side': 'right', 'fileName': controls.rightLung.fileName},
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						$('#modal .container').css('width', '300px');
						$('#modal .container .control-modal-div').css('width', '300px');
						$('#volume-controls').css({
													'float': 'none',
													'margin': '0 auto'
													});
						$('.volume-setting').html(controls.rightLung.value);
						modal.initLungSoundSlider('right');
						
						// mute button
						$('#mute-volume').prop('checked', controls.rightLung.mute);
						
						// init slidebar
						controls.rightLung.displayMute();							
						
						// mute change
						$('#mute-volume').change(function() {
							if($(this).prop('checked') == true) {
								controls.rightLung.mute = true;
							} else {
								controls.rightLung.mute = false;							
							}
							$('#mute-volume').prop('checked', controls.rightLung.mute);
							controls.rightLung.displayMute();							
//							simmgr.sendChange({'set:respiration:right_lung_sound_mute': (controls.rightLung.mute == true) ? 1 : 0});						
						});
						
						// change of sound select
						$('#sound-select').change(function() {
							controls.rightLung.fileName = $(this).children('option:selected').val();
//							simmgr.sendChange({'set:respiration:right_lung_sound': controls.rightLung.fileName});						
						});
						
						// bind change to apply button
						$('button.apply').click(function() {
							simmgr.sendChange({'set:respiration:right_lung_sound_mute': (controls.rightLung.mute == true) ? 1 : 0});						
							simmgr.sendChange({'set:respiration:right_lung_sound': $('#sound-select').children('option:selected').val()});												
							simmgr.sendChange({'set:respiration:right_lung_sound_volume': $('#volume-slider').slider("value")});
							modal.closeModal();
						});
						
						modal.bindCloseModal();
					}
				}
			});
		},

		heartSound: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetHeartSoundContent.php',
				type: 'post',
				async: false,
				dataType: 'json',
				data: {'soundName': controls.heartSound.soundName},
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						$('#modal .container').css('width', '300px');
						$('#modal .container .control-modal-div').css('width', '300px');
						$('#volume-controls').css({
													'float': 'none',
													'margin': '0 auto'
													});
						$('.volume-setting').html(controls.heartSound.value);
						
						// add step, min and max
						$("#volume-slider").attr({
							min: controls.heartSound.minValue,
							max: controls.heartSound.maxValue,
							step: controls.heartSound.increment,
						}).val(controls.heartSound.value);
						
						// bind controls
						controls.heartSound.slideBar = $("#volume-slider").slider({
							min: controls.heartSound.minValue,
							max: controls.heartSound.maxValue,
							step: controls.heartSound.increment,
							value: controls.heartSound.value
						});
						
						$('#volume-slider').slider({
							slide: function( slideEvent, slideUI ) {
								$('.volume-setting').html( slideUI.value );
							}
						});
						
						// mute button
						$('#mute-volume').prop('checked', controls.heartSound.mute);
						
						// init slidebar
						controls.heartSound.displayMute();							
						
						// mute change
						$('#mute-volume').change(function() {
							if($(this).prop('checked') == true) {
								controls.heartSound.mute = true;
							} else {
								controls.heartSound.mute = false;							
							}
							$('#mute-volume').prop('checked', controls.heartSound.mute);
//							simmgr.sendChange({'set:cardiac:heart_sound_mute': (controls.heartSound.mute == true) ? 1 : 0});
							controls.heartSound.displayMute();
						});
						
						// change of sound select
						$('#sound-select').change(function() {
//							simmgr.sendChange({'set:cardiac:heart_sound': $(this).children('option:selected').val()});
						});
						
						// bind change to apply button
						$('button.apply').click(function() {
							simmgr.sendChange({'set:cardiac:heart_sound_volume': $('#volume-slider').slider("value")});
							simmgr.sendChange({'set:cardiac:heart_sound_mute': (controls.heartSound.mute == true) ? 1 : 0});
							simmgr.sendChange({'set:cardiac:heart_sound': $('#sound-select').children('option:selected').val()});
							modal.closeModal();
						});

						modal.bindCloseModal();
					}
				}
			});
		},
		
		showLog: function() {
			var response = {
				html: '<h1 id="modal-title">Event Log</h1>' + 
										'<hr / class="modal-divider">' +
										'<div class="control-modal-div">' +
											$('#event-monitor').html() +
											'<div class="clearer"></div>' +
										'</div>'
			};

			modal.showModal(response);
			$('#modal .container').css('width', '800px');
			$('#modal .container .control-modal-div').css({
				'width': '800px',
				'height': '300px',
				'overflow': 'scroll'
			});
			$('#modal .container .control-modal-div table').css({
				width: '100%'
			});
			$('#modal .container .control-modal-div table tr td').css({
				'text-align': 'left'
			});
			$('#modal .container .control-modal-div table tr:nth-child(2n+1)').css({
				'background-color': '#CCCCCC'
			});
			modal.bindCloseModal();
		},

		showEvents: function() {
			var response = {
				html: '<h1 id="user-table-title">Event Library (Assigned Hot Key)</h1>' + 
										'<hr / class="modal-divider">' +
										'<div class="control-modal-div">' +
											$('#event-library').html() +
											'<div class="clearer"></div>' +
										'</div>'
			};

			modal.showModal(response);
			$('#modal .container').css({'width': '1000px', top: '50px'});
			$('#modal .container .control-modal-div').css({
				'width': '1000px',
				'height': '400px',
				'overflow': 'auto'
			});
			modal.bindCloseModal();
		},

		showUsers: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetUserTableContent.php',
				type: 'post',
				async: false,
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						$('#modal .container').css('width', '900px');
						$('#modal .container .control-modal-div').css('width', '900px');
						$('#modal-content').css('margin-top', '0');
						modal.bindCloseModal();
					}
				}
			});
		},
		
		manageScenarios: function() {
			$.ajax({
				url: BROWSER_AJAX + 'ajaxGetScenarioTableContent.php',
				type: 'post',
				async: false,
				dataType: 'json',
				success: function(response) {
					if(response.status == AJAX_STATUS_OK) {
						modal.showModal(response);
						$('#modal .container').css('width', '900px');
						$('#modal .container .control-modal-div').css('width', '900px');
						$('#modal-content').css({
							'margin-top': '0',
							'max-height': '600px',
							'overflow-y': 'scroll'
						});
						modal.bindCloseModal();
						
						$('#scenario-file-select').change(function() {
							$('#scenario-submit').trigger("click");	
							modal.closeModalFast();
							modal.ajaxWait();
						});
					}
				}
			});
		},


		/********************* Utils for modals *******************/

		bindCloseModalAudio: function() {
			$('a.close_modal, button.cancel').click(function() {
				controls.vocals.audio.loop = false;
				controls.vocals.repeat = false;
				controls.vocals.audio.load();				
				modal.closeModal();
			});
		},
		
		bindCloseModal: function() {
			$('a.close_modal, button.cancel').click(modal.closeModal);
		},
		
		showModal: function(response) {
			$('#modal-content').html(response.html);
			$('#modal').css('position', 'fixed').fadeIn(modal.fadeDelay);
			$('#modal .container').css('height', 'auto');
		},
		
		ajaxWait: function() {
			$('#modal .close_modal').hide();
			$('#modal #modal-content').append('<img class="image_modal modal_content" src="' + BROWSER_IMAGES + 'ajax_loader.gif" alt="Product Image">');
			$('#modal .container').width(modal.textWidth);
			$('#modal .container').css({
										'height': '150px',
										'padding': modal.textPadding,
										'text-align': 'center',
										'top': modal.textTop,
										'background-color': '#FFFFFF' 
			});
			$('#modal img').css('margin', 'auto');
			$('#modal').css('position', 'fixed').show();					
		},

		closeModal: function() {
			$('#modal').fadeOut(modal.fadeDelay,
				function() {
					$('#modal-content').empty();
					$('#modal .close_modal').show();
					$('#modal .container').css('width', '400px');
					$('#modal .container .control-modal-div').css('width', '345px');					
				}
			);
		},
		closeModalFast: function() {
			$('#modal').hide();
			$('#modal-content').empty();
			$('#modal .close_modal').show();
		},
		
		initSingleSlider: function(controlType) {			
			if(typeof controls[controlType] == 'undefined') {
				controlType = 'awRR';
			}
			
			
			var initValue = 0;
			// if awrr then use modal rate
			if(controlType == 'awRR') {
				// set value
				initValue = controls.awRR.modalRate;
			} else {
				// set value
				initValue = controls[controlType].value;				
			}
			
			// set min and max
			$('.control-slider-1').attr({
				'step': controls[controlType].increment,
				'min': controls[controlType].minValue,
				'max': controls[controlType].maxValue
			});	
						
			// bind controls
			controls[controlType].slideBar = $(".control-slider-1").slider({
				'step': controls[controlType].increment,
				'min': controls[controlType].minValue,
				'max': controls[controlType].maxValue,
				'value': initValue
			});
		}, 
		
		initLungSoundSlider: function(lungSelect) {
			if(typeof lungSelect == 'undefined') {
				lungSelect = 'left';
			}
			
			if(lungSelect != 'left' && lungSelect != 'right') {
				lungSelect = 'left';
			}
			
			// add step, min and max
			$("#volume-slider").attr({
				'min': controls[lungSelect + 'Lung'].minValue,
				'max': controls[lungSelect + 'Lung'].maxValue,
				'step': controls[lungSelect + 'Lung'].increment
			}).val(controls[lungSelect + 'Lung'].value);
			
			// bind controls
			controls[lungSelect + 'Lung'].slideBar = $("#volume-slider").slider({
				'min': controls[lungSelect + 'Lung'].minValue,
				'max': controls[lungSelect + 'Lung'].maxValue,
				'step': controls[lungSelect + 'Lung'].increment,
				'value': controls[lungSelect + 'Lung'].value
			});
			
			$('#volume-slider').slider({
				slide: function( slideEvent, slideUI ) {
					$('.volume-setting').html( slideUI.value );
				}
			});
		}
	}
