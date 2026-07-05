/*
sim-ii: Copyright (C) 2019  VetSim, Cornell University College of Veterinary Medicine Ithaca, NY

See gpl.html
*/
/* 
	simmgr Communications

	There are two basic modes for this class:
	
	After init, this class will poll the simmgr via AJAX to
	fetch parameter changes for display. It will push sync
	signals to the EKG and Respiration strip charts.
	
	The AJAX call is to the cgi function: simstatus.cgi
*/

var simmgr = {
	statusTimer : 0,
	quickTimer : 0,
	breathCount : 0,
	pulseCount : 0,
	pulseCountVpc: 0,
	quickInterval : 40,
	statusInterval : 500,
	longStatusInterval : 500,
	running : 0,
	audioPlayStarted : 0,
	mediaPlayStarted : 0,
	timeStamp: 0,
	cardiacResponse: {},
	respResponse: {},
	timeCount: 0,
	ctrlWindow: {},
	wvsVersion: 0,
	
	init : function() {
		console.log("simmgr: init" );
		console.log("simmgr: is local display: "  + simmgr.isLocalDisplay());
		if(typeof userID != "undefined") {
			console.log("uid: " + userID );
			if ( userID == 5 )
			{
				// This is the Demo user
				simmgr.quickInterval = 200;
			}
		}
		
		// Set the interval faster if the client is the local vitals display
		if ( simmgr.isLocalDisplay() )
		{
			simmgr.quickInterval = 15;
		}

		simmgr.quickTimer = setTimeout(function() { simmgr.getQuickStatus(); }, simmgr.quickInterval );
		simmgr.statusTimer = setTimeout(function() { simmgr.getStatus(); }, simmgr.statusInterval );
		simmgr.running = 1;
		
		// bind demo button to start and stop polling of sim mgr
		$("#startStopButton").click(function(){
			if ( simmgr.running == 0 )
			{
				simmgr.running = 1;
				simmgr.quickTimer = setTimeout(function() { simmgr.getQuickStatus(); }, simmgr.quickInterval );
				simmgr.statusTimer = setTimeout(function() { simmgr.getStatus(); }, simmgr.statusInterval );
				$("#startStopButton").css({color:'#FFFFFF'});
			}
			else 
			{
				simmgr.running = 0;
				clearTimeout(simmgr.quickTimer );
				clearTimeout(simmgr.statusTimer );
				$("#startStopButton").css({color:'#555555'});
			}
		});
		
		// This call will periodically tap the server to prevent PHP session timeouts.
		simmgr.tapHost();
	},
	
	getQuickStatus : function () {
		if ( simmgr.running < 1 )
		{
			return;
		}
		// get unique time stamp
		simmgr.timeStamp = new Date().getTime();
		//console.log(BROWSER_CGI + "simstatus.cgi  quick" );
		$.ajax({
			url: BROWSER_CGI + 'simstatus.cgi',
			type: 'get',
			dataType: 'json',
			data: { qstat : simmgr.timeStamp },
			success: function(response,  textStatus, jqXHR ) {
				
				if ( response.respiration.breathCount != simmgr.breathCount )
				{
					simmgr.breathCount = response.respiration.breathCount;
					simmgr.respResponse.inhalation_duration = response.respiration.inhalation_duration;
					simmgr.respResponse.exhalation_duration = response.respiration.exhalation_duration;
					simmgr.respResponse.rate = response.respiration.rate;
					if( controls.manualRespiration.inProgress == false ) {
						controls.awRR.setSynch();
					}
				}
				if ( simmgr.isTeleSim() || simmgr.isLocalDisplay() )
				{
					if ( response.cardiac.pulseCount != simmgr.pulseCount )
					{
						simmgr.pulseCount = response.cardiac.pulseCount;
						controls.heartRate.setSynch();
						
						// kill vpc if any
						chart.status.cardiac.vpcSynch = false;
						chart.ekg.vpcCount = 0;
					}
					
					if ( response.cardiac.pulseCountVpc != simmgr.pulseCountVpc )
					{
						simmgr.pulseCountVpc = response.cardiac.pulseCountVpc;
						
						// kick off vpc cycle...always will happen for local display
						controls.heartRate.isVPCCycle();
					}
				}
				/******** defib exit ************/
				if(typeof(response.defibrillation.shock) != "undefined" && chart.ekg.rhythmIndex == 'defib' && response.defibrillation.shock == 0) {
console.log('defib: here');
					controls.defib.shock = 0;
					chart.ekg.rhythmIndex = controls.heartRhythm.currentRhythm;
					chart.updateEkgWaveform(chart.ekg.rhythmIndex, chart.heartRate);
				}
				
				if( simmgr.timeCount > 4 ) {
					const timeOfDay = new Date();
					$('#clock').html( timeOfDay.toLocaleTimeString("en-GB") );
					simmgr.timeCount = 0;
				}
				simmgr.timeCount++;


			},

			error: function( jqXHR,  textStatus,  errorThrown){
				console.log("error: "+textStatus+" : "+errorThrown );
			},
			complete: function(jqXHR,  textStatus ){
				if ( simmgr.running == 1 )
				{
					simmgr.quickTimer = setTimeout(function() { simmgr.getQuickStatus(); }, simmgr.quickInterval );
				}
			}
		});			
	},
	
	getStatus : function () {
		if ( simmgr.running < 1 )
		{
			return;
		}
		// get unique time stamp
		simmgr.timeStamp = new Date().getTime();
		$.ajax({
			url: BROWSER_CGI + 'simstatus.cgi',
			type: 'get',
			dataType: 'json',
			data: { status: simmgr.timeStamp },
			success: function(response,  textStatus, jqXHR ) {
				//console.log("status returns length: ", response.length );
				if ( simmgr.isLocalDisplay() )
				{
/*
					if ( response.respiration.breathCount != simmgr.breathCount )
					{
						if ( ( response.respiration.breathCount - simmgr.breathCount ) > 1 )
						{
							$("#outputDiv1").text("Resp "+ response.respiration.breathCount+" : "+simmgr.breathCount );
						}
						simmgr.breathCount  = response.respiration.breathCount;
						controls.awRR.setSynch();
					}
*/
					if ( response.cardiac.pulseCount != simmgr.pulseCount )
					{
						if ( ( response.cardiac.pulseCount - simmgr.pulseCount ) > 1 )
						{
							$("#outputDiv2").text("Heart "+ response.cardiac.pulseCount+" : "+simmgr.pulseCount );
						}
						simmgr.pulseCount = response.cardiac.pulseCount;
						controls.heartRate.setSynch();
					}
				}
								
				/************ cardiac **************/
				if ( typeof(response.cardiac) != "undefined" )
				{
					if ( ( typeof(response.cardiac.rate) != "undefined" ) && ( response.cardiac.rate != controls.heartRate.value ) && controls.cpr.inProgress == false )
					{
						// update saved response record for cardiac params
						simmgr.cardiacResponse = response.cardiac;
/*
						controls.heartRate.setHeartRateValue(simmgr.cardiacResponse.rate );
						if(simmgr.cardiacResponse.rhythm == 'vtach3') {
							// pre calculate R on T based on heart rate
							chart.initVtach3();
						}
						chart.updateCardiac(simmgr.cardiacResponse );
						chart.status.cardiac.synch == false;
						chart.ekg.patternIndex = 0;
						clearTimeout(controls.heartRate.beatTimeout);
						controls.heartRate.setSynch();
*/
//						chart.updateCardiacRate();
						
						// calculate new period count for new rate
						chart.ekg.periodCount = Math.round(((60 / response.cardiac.rate) * 1000) / chart.ekg.drawInterval);
//console.log('Pixel: ' + chart.ekg.pixelCount);
//console.log('Period: ' + chart.ekg.periodCount);
						if(controls.heartRate.value == 0) {
							chart.updateCardiacRate();
						}
//console.log('Current rate: ' + controls.heartRate.value);
//console.log('New rate: ' + simmgr.cardiacResponse.rate);
					} else {
						// set period count to 0 to indicate no new rate ready
						chart.ekg.periodCount = 0;
					}
					
					// avg rate
					if(typeof(response.cardiac.avg_rate) != "undefined" && response.cardiac.avg_rate != controls.heartRate.avg_rate) {
						controls.heartRate.avg_rate = response.cardiac.avg_rate;
						controls.heartRate.displayValue();
					}
					
					
					// cardiac nbp
					if ( ( typeof(response.cardiac.bps_sys) != "undefined" ) && ( response.cardiac.bps_dia != "undefined" ) )
					{
						controls.nbp.diastolicValue = response.cardiac.bps_dia;
						controls.nbp.systolicValue = response.cardiac.bps_sys;
						
						// see if we are linked to main HR
						if(controls.nbp.linkedHR == true) {
							controls.nbp.reportedHRValue = response.cardiac.rate;
						} else {
							controls.nbp.reportedHRValue = response.cardiac.nibp_rate;
						}
						
						// only update reading when requested.
						controls.nbp.updateDisplayedNBP();
					}
					
					// ekg indicator
					if(typeof(response.cardiac.ecg_indicator) != "undefined") {
						var changed = false;
						if( response.cardiac.ecg_indicator == 1) {
							if ( controls.ekg.leadsConnected == false ) {
								changed = true;
								if( profile.isVitalsMonitor == true ) {
									chart.initStrip('ekg');
								}
							}
							controls.ekg.leadsConnected = true;
						} else {
							if ( controls.ekg.leadsConnected == true ) {
								changed = true;
								if( profile.isVitalsMonitor == true ) {
									chart.initStrip('ekg');
									chart.ekg.ctx.clearRect(0, 0, chart.ekg.width + 10, chart.ekg.height);
								}
							}
							controls.ekg.leadsConnected = false;					
						}
						if ( changed ) {
							controls.heartRate.displayValue();
						}
						buttons.setVSButton('ekg');
					}

					// bp cuff
					if(typeof(response.cardiac.bp_cuff) != "undefined") {
						if( response.cardiac.bp_cuff == 1) {
							controls.bpcuff.leadsConnected = true;
							$('#button-nbp').show();
						} else {
							controls.bpcuff.leadsConnected = false;					
							$('#button-nbp').hide();
						}
						buttons.setVSButton('bpcuff');
					}
					
					// linked hr
					if(typeof(response.cardiac.nibp_linked_hr) != "undefined") {
						if( response.cardiac.nibp_linked_hr == 1) {
							controls.nbp.linkedHR = true;
						} else {
							controls.nbp.linkedHR = false;
						}
					}
					
					// read nibp
					if(typeof(response.cardiac.nibp_read) != "undefined" && controls.bpcuff.leadsConnected == true) {
						if( response.cardiac.nibp_read == 1) {
							$('#button-nbp').css('background-color', buttons.disconnectColor);
							$('#nibp-read-in-progress').toggle();
						} else {
							$('#button-nbp').css('background-color', buttons.connectColor);							
						}
						
						if(response.cardiac.nibp_read != controls.nbp.nibp_read) {
							// flag that we need to display nibp on the student monitor
							// when read goes from 1 to 0
							// assume read can only take place when cuff is attached
							if(response.cardiac.nibp_read == 0 && controls.nbp.nibp_read == 1) {
								// cleared out when displaying nibp
								controls.nbp.display_student_nibp = true;
							}
							
							controls.nbp.nibp_read = response.cardiac.nibp_read;
							controls.nbp.updateDisplayedNBP();
							$('#nibp-read-in-progress').hide();							
						}
					}
					
					// nibp frequency
					if(typeof(response.cardiac.nibp_freq) != "undefined") {
						controls.nbp.nibp_freq = response.cardiac.nibp_freq;
					}
					
					/***** heart sounds *****/
					// heart sound name
					if(typeof(response.cardiac.heart_sound) != "undefined") {
						controls.heartSound.soundName = response.cardiac.heart_sound;
						
						if ( typeof(simsound) != 'undefined' )
						{
							simsound.lookupHeartSound();
						}

					}

					// heart sound mute
					if(typeof(response.cardiac.heart_sound_mute) != "undefined") {
						// change value only if necessary
						if(response.cardiac.heart_sound_mute == 1 && controls.heartSound.mute == false) {
//							controls.heartSound.mute = true;
//							$('#heart-sound-mute').show();
							
							// force heart sound to not mute
							simmgr.sendChange({'set:cardiac:heart_sound_mute': 0});
						} else if(response.cardiac.heart_sound_mute == 0 && controls.heartSound.mute == true) {
							controls.heartSound.mute = false;							
							$('#heart-sound-mute').hide();
						}
					}
					
					// heart sound volume
					if(typeof(response.cardiac.heart_sound_volume) != "undefined") {
						controls.heartSound.value = response.cardiac.heart_sound_volume;
					}
					
					// pulse strength
					if(typeof(response.cardiac.left_femoral_pulse_strength) != "undefined") {
						controls.pulseStrength.left.femoral.value = response.cardiac.left_femoral_pulse_strength;
					}
					if(typeof(response.cardiac.right_femoral_pulse_strength) != "undefined") {
						controls.pulseStrength.right.femoral.value = response.cardiac.right_femoral_pulse_strength;
					}
					if(typeof(response.cardiac.left_dorsal_pulse_strength) != "undefined") {
						controls.pulseStrength.left.dorsal.value = response.cardiac.left_dorsal_pulse_strength;
					}
					if(typeof(response.cardiac.right_dorsal_pulse_strength) != "undefined") {
						controls.pulseStrength.right.dorsal.value = response.cardiac.right_dorsal_pulse_strength;
					}
					
					// pulse sensitivity
					if(typeof(response.cardiac.left_femoral_pulse_sensitivity) != "undefined") {
						controls.pulse.left.femoral.sensitivity = response.cardiac.left_femoral_pulse_sensitivity;
					}
					if(typeof(response.cardiac.right_femoral_pulse_sensitivity) != "undefined") {
						controls.pulse.right.femoral.sensitivity = response.cardiac.right_femoral_pulse_sensitivity;
					}
					if(typeof(response.cardiac.left_dorsal_pulse_sensitivity) != "undefined") {
						controls.pulse.left.dorsal.sensitivity = response.cardiac.left_dorsal_pulse_sensitivity;
					}
					if(typeof(response.cardiac.right_dorsal_pulse_sensitivity) != "undefined") {
						controls.pulse.right.dorsal.sensitivity = response.cardiac.right_dorsal_pulse_sensitivity;
					}
					
					
					/***** heart rhythm *****/
					// heart ecg pattern selection
					if(typeof(response.cardiac.rhythm) != "undefined" && controls.heartRhythm.currentRhythm != response.cardiac.rhythm) {
						// if previous pattern was asystole && heart rate was 0 then set heart rate to 100.
//						if(controls.heartRhythm.currentRhythm == 'asystole' && response.cardiac.rate == 0) {
//							simmgr.sendChange({'set:cardiac:rate': 100});
//						}
						
						controls.heartRhythm.currentRhythm = response.cardiac.rhythm;
						chart.ekg.rhythmIndex = response.cardiac.rhythm;
						chart.updateCardiac(response.cardiac );
						controls.heartRate.displayValue();
						
						// set minimum heart rate
						if(response.cardiac.rhythm == 'vtach3') {
							controls.heartRate.minValue = controls.heartRate.rOnTMinValue;
							if(controls.heartRate.value < controls.heartRate.minValue) {
								simmgr.sendChange( { 'set:cardiac:rate' : controls.heartRate.minValue } );
								controls.heartRate.setHeartRateValue(controls.heartRate.minValue);
							}
						} else {
							controls.heartRate.minValue = controls.heartRate.normalMinValue;						
						}


						// calculate afib delays — multipliers applied to the nominal RR interval.
						// Range [0.8, 1.2] keeps the mean at 1.0 (average rate = set rate) while
						// ensuring the minimum interval (0.8×) always exceeds the complex duration
						// (0.75× of period), preventing truncated complexes that skew the HR display low.
						if(response.cardiac.rhythm == 'afib') {
							chart.afib.delay = new Array;
							for(var index = 0; index <= chart.afib.delayCount; index++) {
								chart.afib.delay[index] = parseFloat((0.8 + Math.random() * 0.4).toFixed(2));
 							}
						} else if(response.cardiac.rhythm == 'vtach3') {
							// pre calculate R on T based on heart rate
							chart.initVtach3();
							chart.updateCardiac(response.cardiac );
						}
					}
					
					// heart pea
					if(typeof(response.cardiac.pea) != "undefined") {
						if(response.cardiac.pea == 1) {
							controls.heartRhythm.pea = true;
							$('#indicator-pea').show();
						} else {
							controls.heartRhythm.pea = false;						
							$('#indicator-pea').hide();
						}
					}
					
					// heart arrest
					if(typeof(response.cardiac.arrest) != "undefined" && response.cardiac.arrest != controls.heartRhythm.arrest) {
						if(response.cardiac.arrest == 1) {
							controls.heartRhythm.arrest = true;
							$('#indicator-arrest').show();
						} else {
							controls.heartRhythm.arrest = false;						
							$('#indicator-arrest').hide();
						}
						controls.SpO2.displayValue();
					}
					
					// heart vpc
					if(typeof(response.cardiac.vpc) != "undefined" && response.cardiac.vpc != controls.heartRhythm.vpcResponse) {
						controls.heartRhythm.vpcResponse = response.cardiac.vpc;
						if(response.cardiac.vpc != 'none') {
							var responseArray = response.cardiac.vpc.split("-");
							
							if( !(simmgr.isLocalDisplay()) ) {
								controls.heartRhythm.vpcCount = responseArray[1];
							} else {
								controls.heartRhythm.vpcCount = 1;							
							}
							if(responseArray[0] == 1) {
								controls.heartRhythm.vpc = "vpc1";
							} else {
								controls.heartRhythm.vpc = "vpc2";							
							}
							
							// init params
							chart.updateCardiac(response.cardiac);
						} else {
							controls.heartRhythm.vpcCount = 0;
						}
					}
					
					// heart vfib amplitude
					if(typeof(response.cardiac.vfib_amplitude) != "undefined") {
						controls.heartRhythm.vfibAmplitude = response.cardiac.vfib_amplitude;
						switch(controls.heartRhythm.vfibAmplitude) {
							case 'low':
								chart.fibDivide = 4;
								break;
							case 'med':
							case 'medium':
								chart.fibDivide = 2.5;
								break;
							case 'high':
							default:
								chart.fibDivide = 1;
								break;						
						}
					}
					
					// heart vpc frequency
					if(typeof(response.cardiac.vpc_freq) != "undefined" && controls.heartRhythm.vpcFrequency != response.cardiac.vpc_freq) {
						controls.heartRhythm.vpcFrequency = response.cardiac.vpc_freq;
						controls.heartRhythm.calculateVPCFreq();
					}
					
					
				}
				
				/************ general **************/
				// temperature Tperi
				if ( ( typeof(response.general) != "undefined" ) && ( typeof(response.general.temperature) != "undefined" ) )
				{
					var temperature = response.general.temperature / 10;
					if ( temperature != controls.Tperi.value )
					{
						controls.Tperi.setValue(temperature );
						controls.Tperi.displayValue();
					}
				}
				
				// temperature units
				if(typeof(response.general.temperature_units) != "undefined") {
					if( response.general.temperature_units != controls.Tperi.currentUnits ) {
						controls.Tperi.currentUnits = response.general.temperature_units;
						controls.Tperi.displayValue();
					} 
				}

				// temperature display
				if(typeof(response.general.temperature_enable) != "undefined") {
					if( response.general.temperature_enable == 1) {
						controls.Tperi.leadsConnected = true;
					} else {
						controls.Tperi.leadsConnected = false;					
					}
					buttons.setVSButton('Tperi');
					controls.Tperi.displayValue();
				}
				
				// WVS Version
				if(typeof(response.general.wvs_version) != "undefined") {
					simmgr.wvsVersion = response.general.wvs_version;
				}
				
				// telesim
				if(typeof(response.telesim) != "undefined" ) {
/*					if( response.telesim.enable != localStorage.telesim && profile.isVitalsMonitor ) {
						telesim.setTeleSim( response.telesim.enable );
					}
*/
					if( profile.isVitalsMonitor ) {
						if( response.telesim.enable == 0 && $('.telesim-right').is(':visible') ) {
							telesim.setTeleSim( 0 );
						} else if( response.telesim.enable == 1 && $('.telesim-right').is(':hidden') ) {
							telesim.setTeleSim( 1 );						
						}
					}
					
					// select
//console.log('--------------');
//console.log('Next 0: ' + telesim.imageNext[0]);
//console.dir(response.telesim[0]);
//console.log('Next 1: ' + telesim.imageNext[1]);
//console.dir(response.telesim[1]);
					if ( typeof(response.telesim[0]) !== 'undefined' )
					{
						if( response.telesim[0].next != telesim.imageNext[0] && typeof telesim.imageList[0] != "undefined" ) {
							telesim.imageNext[0] = response.telesim[0].next;
							telesim.processTelesimCommand( response.telesim, 0 );
						}
						
						if( response.telesim[1].next != telesim.imageNext[1] && typeof telesim.imageList[1] != "undefined" ) {
							telesim.imageNext[1] = response.telesim[1].next;
							telesim.processTelesimCommand( response.telesim, 1 );
						}
					}
					
				}

				/************ vocals **************/
				if(typeof(response.vocals) != "undefined" ) {
					// filename
					if(typeof(response.vocals.filename) != "undefined") {
						controls.vocals.fileName = response.vocals.filename;
					}
					
					// repeat
					if(typeof(response.vocals.repeat) != "undefined" && response.vocals.repeat == 1) {
						controls.vocals.repeat = true;
						controls.vocals.displayRepeat();
					} else {
						controls.vocals.repeat = false;					
						controls.vocals.displayRepeat();
					}
					
					// mute
					if(typeof(response.vocals.mute) != "undefined") {
						if(response.vocals.mute == 1) {
							controls.vocals.mute = true;
						} else {
							controls.vocals.mute = false;					
						}
						controls.vocals.displayMute();
					}
					
					// volume
					if(typeof(response.vocals.volume) != "undefined") {
						controls.vocals.value = response.vocals.volume;
					}
					
					// Play/Stop control
					if(typeof(response.vocals.play) != "undefined") {
						controls.vocals.play = response.vocals.play;
						// Local Display Only section

						if ( simmgr.isLocalDisplay() ) {
							if(response.vocals.play == 1) {
								// First, prevent replay
								if ( simmgr.audioPlayStarted == 1 ) {
									// Do nothing, wait for play to clear
								}
								else {
									// Play current sound
									simmgr.audioPlayStarted = 1;
									controls.vocals.audio.src = BROWSER_SCENARIOS + scenario.currentScenarioFileName + '/vocals/' + controls.vocals.fileName;
									controls.vocals.audio.load();
									controls.vocals.audio.play();
								}
							}
							else {
								if ( simmgr.audioPlayStarted == 1 ) {
									// Play has cleared, so stop and allow restart
									controls.vocals.audio.pause();
									controls.vocals.audio.currentTime = 0;
									controls.vocals.audio.src = "";
								}
								simmgr.audioPlayStarted = 0;
							}
						}
						// End Local Display Only
					}
				}
				
				/************ media **************/
				if(typeof(response.media) != "undefined" ) {
					// filename
					if(typeof(response.media.filename) != "undefined") {
						controls.media.fileName = response.media.filename;
					}
					if(typeof(response.media.play) !== 'undefined' && profile.isVitalsMonitor)
					{
						if ( ( response.media.play == 1 ) && ( simmgr.mediaPlayStarted == 0 ) )
						{

							// Start new media display. Base action on file type
							var fileName = controls.media.fileName;
							var fileExt = fileName.split('.')[fileName.split('.').length - 1].toLowerCase();
							switch ( fileExt )
							{
								// Image files - List from https://www.library.cornell.edu/preservation/tutorial/presentation/table7-1.html
								case 'jpg': case 'jpeg': case 'jif': case 'jfif':
								case 'png':	case 'gif':	case 'tif': case 'tiff':
								case 'jp2': case 'jpx': case 'j2k': case 'j2c':
								case 'fpx':	case 'pcd':	case 'pdf':
									
									// Create a window the full size of the image. Scale down to fit in screen (if larger)
									$('#media-video').remove();
									$('#media-overlay').remove();
									$('body').append("<img id='media-overlay' src='"+ BROWSER_SCENARIOS + scenario.currentScenarioFileName + '/media/' + controls.media.fileName + "'>" );
									$('#media-overlay').on('load', function() {
										var margintop = 0;
										var marginleft = 0;
										var iHeight = $('#media-overlay').height();
										var bHeight = $('body').height();
										if (iHeight < bHeight) {
											margintop = (bHeight - iHeight) / 2;
										}
										var iWidth = $('#media-overlay').width();
										var bWidth = $('body').width();
										if (iWidth < bWidth) {
											marginleft = (bWidth - iWidth) / 2;
										}
										$('#media-overlay').css({'margin-left': marginleft + 'px', 'margin-top' : margintop + 'px' } );

//										$('#media-overlay').css({
//											'margin-left': '100px',
//											'margin-top': '10px',
//											'max-height': 'none',
//											'max-width': 'none',
//											'height': ($('#vsm').height() - 50) + 'px'
//										});
									});
									$('#media-overlay').draggable();
									break;
								
								// Video file
								
								case 'mp4': case 'webm': case 'ogg':
									$('#media-video').remove();
									$('#media-overlay').remove();
									var vcontrol = "controls autoplay";
									var vheight;
									var vwidth;
									if ( simmgr.isLocalDisplay() ) {
										vwidth=1280;
										vheight=960;
									}
									else {
										vwidth=640;
										vheight=480;
									}
									$('body').append("<video id='media-overlay' width='"+vwidth+"' height='"+vheight+"' "+vcontrol+" ><source src='"
											+ BROWSER_SCENARIOS + scenario.currentScenarioFileName + '/media/' + controls.media.fileName +
											"' type='video/"+fileExt+"'>Browser does not support this video tag ("+fileExt+")</video>");
									var margintop = ($(window).height() - (vheight+200) ) / 2;
									if ( margintop < 0 ) {
										margintop = 0;
									}
									var marginleft = ($(window).width() - vwidth ) / 2;
									$('#media-overlay').css({'margin-left': marginleft, 'margin-top' : margintop, 'cursor' : 'pointer' } );
									$('#media-overlay').draggable();
									break;
							
							}
							simmgr.mediaPlayStarted = 1;
						}
						else if ( ( response.media.play == 0 ) && ( simmgr.mediaPlayStarted == 1 ) )
						{
							$('#media-overlay').remove();
							$('#media-video').remove();
							simmgr.mediaPlayStarted = 0;
						}
					}
				}
				/************ respiration **************/
				if(typeof(response.respiration) != "undefined" ) {
					// awRR
					if(typeof(response.respiration.awRR) != "undefined") {
						simmgr.respResponse = response.respiration;
						if(typeof simmgr.respResponse.awRR != "undefined") {
							controls.awRR.value = simmgr.respResponse.awRR;
						}
						controls.awRR.displayValue();

// console.log('New respiration: ' + simmgr.respResponse.awRR);
// console.log('Old respiration: ' + controls.awRR.value);
//						if( simmgr.respResponse.awRR != controls.awRR.value ) {
//							if(controls.awRR.value == 0) {
//								chart.updateRespRate();
//							} else {
//								chart.resp.periodCount = Math.round(((60 / simmgr.respResponse.awRR) * 1000) / chart.resp.drawInterval);
// console.log("New period count: " + chart.resp.periodCount);
//							}
//						} else {
 //							chart.resp.periodCount = 0;
//						}
					}
					else
					{
						console.log("no respiration awRR" );
					}
					
					// modal awRR rate (may be different from displayed awRR due to manual breaths)
					if(typeof(response.respiration.rate) != "undefined") {
						if( response.respiration.rate != controls.awRR.modalRate ) {
							controls.awRR.modalRate = response.respiration.rate;
							if ( typeof(simsound) != 'undefined' )
							{
								simsound.lookupLungSound();
							}
						}
					}
					
					// spo2
					if(typeof(response.respiration.spo2) != "undefined") {
						var spo2Rate = response.respiration.spo2;
						if ( spo2Rate != controls.SpO2.value )
						{
							controls.SpO2.value = response.respiration.spo2;
							controls.SpO2.displayValue();
						}
					}

					// etco2
					if (typeof(response.respiration.etco2) != "undefined" && ( controls.manualRespiration.inProgress == false) ) {
						var etCO2Rate = response.respiration.etco2;
						if(etCO2Rate != controls.etCO2.value) {
							controls.etCO2.changeInProgressStatus = ETCO2_NEW_VALUE_ENTERED;
// debug
/*
if( profile.isVitalsMonitor ) {
	console.log("**************************");
	console.log("Vitals new: " + etCO2Rate);
	console.log("Vitals old: " + controls.etCO2.value);
	console.log("Vitals rhythm index: " + chart.resp.rhythmIndex);
	console.log("awrr: " + controls.awRR.value);
	console.log("Manual Breath Count: " + chart.resp.manualBreathDisplayCount);
}
*/
							// set new value of ETCO2
							controls.etCO2.value = response.respiration.etco2;
							
							// display if not vitals
							// vitals display of ETCO2 is controlled in chart.js
							if( ! profile.isVitalsMonitor ) {
								controls.etCO2.displayValue();
							}

/*
							if(chart.resp.rhythmIndex == 'low' || 
								chart.resp.rhythmIndex == 'rest' || 
								( controls.awRR.value == 0 && chart.resp.manualBreathDisplayCount > 1 ) || 
								( chart.resp.manualBreathDisplayCount == 0 && !profile.isVitalsMonitor ) || 
								( controls.heartRhythm.arrest && profile.isVitalsMonitor ) ||
								profile.isVitalsMonitor == false  ) {
								controls.etCO2.changeInProgressStatus = ETCO2_NEW_WAVEFORM_IN_PROGRESS;
//								controls.etCO2.displayValue();
//								chart.getETC02MaxDisplay();
							}
*/
						}
					}
					
					// co2 waveform type
					if(typeof(response.respiration.co2_waveform) != "undefined" && response.respiration.co2_waveform !== "") {
						controls.etCO2.waveformType = response.respiration.co2_waveform;
					}

					// etco2 indicator
					if(typeof(response.respiration.etco2_indicator) != "undefined") {
						var changed = false;
						if( response.respiration.etco2_indicator == 1) {
							if ( controls.CO2.leadsConnected == false ) {
								changed = true;
								if( profile.isVitalsMonitor == true ) {
									chart.initStrip('resp');
								}
							}
							controls.CO2.leadsConnected = true;
						} else {
							if ( controls.CO2.leadsConnected == true ) {
								changed = true;
								if( profile.isVitalsMonitor == true ) {
									chart.initStrip('resp');
									chart.resp.ctx.clearRect(0, 0, chart.resp.width + 10, chart.resp.height);
								}
							}
							controls.CO2.leadsConnected = false;					
						}
						if ( changed ) {
							if( controls.CO2.leadsConnected == true ) {
								chart.resp.rrBlankCount = 2;
							}
							controls.awRR.displayValue();
							if( !profile.isVitalsMonitor ) {
								controls.etCO2.displayValue();						
							} else {
								$('#vs-etCO2 a').html('---<span class="vs-upper-label"> mmHg</span>');				
							}
						}
						buttons.setVSButton('CO2');
					}
					
					// spo2 indicator
					if(typeof(response.respiration.spo2_indicator) != "undefined") {
						var changed = false;
						if( response.respiration.spo2_indicator == 1) {
							if ( controls.SpO2.leadsConnected == false ) {
								changed = true;
							}
							controls.SpO2.leadsConnected = true;
						} else {
							if ( controls.SpO2.leadsConnected == true ) {
								changed = true;
							}
							controls.SpO2.leadsConnected = false;					
						}
						if ( changed ) {
							controls.SpO2.displayValue();
						}
						buttons.setVSButton('SpO2');
					}
					
					// manual breath
					if(typeof(response.respiration.manual_count) != "undefined") {
						controls.manualRespiration.serverCount = response.respiration.manual_count;
						if(controls.manualRespiration.serverCount == 0) {	// Allow reset to zero at start of new scene
							controls.manualRespiration.iiCount = 0;
						}
						else if(controls.manualRespiration.serverCount != controls.manualRespiration.iiCount) {
							controls.manualRespiration.manualBreath();
						}
					}
					
					/***** Left Lung *****/
					// left lung sound
					if(typeof(response.respiration.left_lung_sound) != "undefined") {
						if ( controls.leftLung.fileName != response.respiration.left_lung_sound )
						{
							controls.leftLung.fileName = response.respiration.left_lung_sound;
							if ( typeof(simsound) != 'undefined' )
							{
								simsound.lookupLungSound();
							}
						}
					}
					
					// left lung mute
					if(typeof(response.respiration.left_lung_sound_mute) != "undefined") {
						if(response.respiration.left_lung_sound_mute == 1) {
//							controls.leftLung.mute = true;
//							$('#left-lung-mute').show();
							// force mute to false
							console.log("Found left_lung_sound_mute == 1, set to zero" );
							simmgr.sendChange({'set:respiration:left_lung_sound_mute': 0});						
						} else {
							controls.leftLung.mute = false;
							$('#left-lung-mute').hide();						
						}
					}
					
					// left lung volume
					if(typeof(response.respiration.left_lung_sound_volume) != "undefined") {
						controls.leftLung.value = response.respiration.left_lung_sound_volume;
					}
					
					/***** Right Lung *****/
					// right lung sound
					if(typeof(response.respiration.right_lung_sound) != "undefined") {
						controls.rightLung.fileName = response.respiration.right_lung_sound;
					}
					
					// right lung mute
					if(typeof(response.respiration.right_lung_sound_mute) != "undefined") {
						if(response.respiration.right_lung_sound_mute == 1) {
//							controls.rightLung.mute = true;
//							$('#right-lung-mute').show();
							// force mute to false
							console.log("Found right_lung_sound_mute == 1, set to zero" );
							simmgr.sendChange({'set:respiration:right_lung_sound_mute': 0});						
						} else {
							controls.rightLung.mute = false;
							$('#right-lung-mute').hide();						
						}
					}
					
					// right lung volume
					if(typeof(response.respiration.right_lung_sound_volume) != "undefined") {
						controls.rightLung.value = response.respiration.right_lung_sound_volume;
					}
					
					// chest movement
					if(typeof(response.respiration.chest_movement) != "undefined" && response.respiration.chest_movement == 1) {
						controls.chestRise.active = true;
					} else {
						controls.chestRise.active = false;					
					}

				}
				else
				{
					console.log("no respiration" );
				}
				/************ scenario **************/
				// check for scenario parse error
				if( typeof(response.scenario.error_message) != "undefined" ) {
					alert(response.scenario.error_message);
				}
				
				if( ( typeof(response.scenario) != '"undefined"' )  ){
					if(typeof(response.scenario.runtimeScenario) != "undefined" ) {
						$('#scenario-running-time').html(response.scenario.runtimeScenario);
					}
					if(typeof(response.scenario.runtimeScene) != "undefined" ) {
						$('#scene-running-time').html(response.scenario.runtimeScene);
					}
					
					// scenario state
					if(typeof response.scenario.state != "undefined") {
						// normalize result, see if there was a change
						var newScenarioState = response.scenario.state.toUpperCase();
						if(scenario.currentScenarioState != scenario.scenarioState[newScenarioState]) {
							$('.logout.debrief').hide();
							switch(newScenarioState) {
								case 'STOPPED':
									$('#clock').hide();
									scenario.currentScenarioState = scenario.scenarioState.STOPPED;
									if ( profile.isVitalsMonitor == false ) {
										scenario.stopScenario();
									} else {
										controls.nbp.displayNIBPDashes();
									}
console.log("New scenario state STOPPED");
									$('.logout.debrief').show();
									break;
								
								case 'PAUSED':
									$('#clock').hide();
									scenario.currentScenarioState = scenario.scenarioState.PAUSED;
									if ( profile.isVitalsMonitor == false ) {
										scenario.pauseScenario();
									}
									profile.removePatientInfo();
console.log("New scenario state PAUSED");
									break;
								
								case 'RUNNING':
									$('#clock').show();
									scenario.currentScenarioState = scenario.scenarioState.RUNNING;
									if ( profile.isVitalsMonitor == false ) {
										scenario.continueScenario();
									}
									profile.removePatientInfo();
console.log("New scenario state RUNNING");
									break;
								
								default:
									$('#clock').hide();
									break;
							}
						}
					}
					
					// scenario selection
					if(typeof(response.scenario.active) != "undefined" && response.scenario.active != scenario.currentScenarioFileName) {
						scenario.currentScenarioFileName = response.scenario.active;
						scenario.loadScenario();
						if ( profile.isVitalsMonitor == false ) { 
							scenario.init();
						}
						profile.init();
						if ( profile.isVitalsMonitor == false ) { 
							events.init();
						}
						profile.initPatientInfo();
						media.init();
						telesim.init();
					}
					
					if ( profile.isVitalsMonitor == false ) {
						// scenario scene name
						if( typeof(response.scenario.scene_name) != "undefined") {
							$('#scene-name').html(response.scenario.scene_name);
						}
						
						// scenario scene number
						if( typeof(response.scenario.scene_id) != "undefined") {
							$('#scene-id').html(response.scenario.scene_id);
						}
					
						// scenario record
						if(typeof(response.scenario.record) != "undefined" && response.scenario.record == 1) {
							scenario.startVideoWithScenario = true;
						} else {
							scenario.startVideoWithScenario = false;
						}
						$('#start-video').attr('checked', scenario.startVideoWithScenario);
					}
				}
				
				/************ event log **************/
				if( typeof(response.logfile) != "undefined" ) {
					if(typeof(response.logfile.filename) != "undefined" && typeof(response.logfile.lines_written) != "undefined") {
						if( (response.logfile.filename != events.currentLogFileName) || (response.logfile.lines_written != events.currentLogRecord) ) {
							events.currentLogFileName = response.logfile.filename;
							events.currentLogRecord = response.logfile.lines_written;
							events.addEventsFromLog();
						}
					}
				}
				
				/************ cpr **************/
				if(( typeof(response.cpr.compression) != "undefined" ) &&  response.cpr.compression != controls.cpr.inProgress) {
					if(response.cpr.compression == 0) {
						controls.cpr.inProgress = false;
						$('#vs-trace-1').attr('onclick', 'modal.heartRhythm();');
						if ( typeof(response.cardiac.rate) !== 'undefined' )
						{
							controls.heartRate.setHeartRateValue(response.cardiac.rate );
							if ( typeof(response.cardiac.rhythm) !== 'undefined' )
							{
								if(response.cardiac.rhythm == 'vtach3') {
									// pre calculate R on T based on heart rate
									chart.initVtach3();
								}
							}
						}
						
						// stop timer for cpr HR display
						controls.heartRate.updateCPRDisplay();

					} else {
						controls.cpr.inProgress = true;
//						$('#vs-trace-1').attr('onclick', 'javascript:void(2);');
						
						// start timer for cpr HR display
						controls.heartRate.updateCPRDisplay();
						
						//Clear HR display
						controls.heartRate.blankHR();
					}
					controls.cpr.setCPRState();
					chart.updateCardiac(response.cardiac);
				}
				
				if(( typeof(response.cpr.running) != "undefined" ) &&  response.cpr.running != controls.cpr.running) {
					controls.cpr.running = response.cpr.running;
				}

				
				/************ pulse palpation **************/
/*
				if(typeof(response.pulse.position) != "undefined" && response.pulse.position != controls.pulse.position) {
					controls.pulse.position = response.pulse.position;
					controls.pulse.setPalpateColor();
				}
				if(typeof(response.pulse.pressure) != "undefined" && response.pulse.pressure != controls.pulse.pressure) {
					controls.pulse.pressure = response.pulse.pressure;
					controls.pulse.setPalpateColor();
				}
*/
				if(typeof(response.pulse.left_femoral) != "undefined" && response.pulse.left_femoral != controls.pulse.left_femoral) {
					controls.pulse.left_femoral = response.pulse.left_femoral;
					controls.pulse.setPulseLabelColor('left-femoral', controls.pulse.left_femoral);
					controls.pulse.setPalpateColor();
				}
				if(typeof(response.pulse.right_femoral) != "undefined" && response.pulse.right_femoral != controls.pulse.right_femoral) {
					controls.pulse.right_femoral = response.pulse.right_femoral;
					controls.pulse.setPulseLabelColor('right-femoral', controls.pulse.right_femoral);
					controls.pulse.setPalpateColor();
				}
				if(typeof(response.pulse.left_dorsal) != "undefined" && response.pulse.left_dorsal != controls.pulse.left_dorsal) {
					controls.pulse.left_dorsal = response.pulse.left_dorsal;
					controls.pulse.setPulseLabelColor('left-dorsal', controls.pulse.left_dorsal);
					controls.pulse.setPalpateColor();
				}
				if(typeof(response.pulse.right_dorsal) != "undefined" && response.pulse.right_dorsal != controls.pulse.right_dorsal) {
					controls.pulse.right_dorsal = response.pulse.right_dorsal;
					controls.pulse.setPulseLabelColor('right-dorsal', controls.pulse.right_dorsal);
					controls.pulse.setPalpateColor();
				}

				
				/************ pulse strength **************/
				if(typeof(response.cardiac.left_femoral_pulse_strength) != "undefined" && response.cardiac.left_femoral_pulse_strength != controls.pulseStrength.left.femoral.value) {
					controls.pulseStrength.left.femoral.value = response.cardiac.left_femoral_pulse_strength;
				}
				if(typeof(response.cardiac.right_femoral_pulse_strength) != "undefined" && response.cardiac.right_femoral_pulse_strength != controls.pulseStrength.right.femoral.value) {
					controls.pulseStrength.right.femoral.value = response.cardiac.right_femoral_pulse_strength;
				}
				if(typeof(response.cardiac.left_dorsal_pulse_strength) != "undefined" && response.cardiac.left_dorsal_pulse_strength != controls.pulseStrength.left.dorsal.value) {
					controls.pulseStrength.left.dorsal.value = response.cardiac.left_dorsal_pulse_strength;
				}
				if(typeof(response.cardiac.right_dorsal_pulse_strength) != "undefined" && response.cardiac.right_dorsal_pulse_strength != controls.pulseStrength.right.dorsal.value) {
					controls.pulseStrength.right.dorsal.value = response.cardiac.right_dorsal_pulse_strength;
				}
				
				/************ defib **************/
				if(typeof(response.defibrillation.shock) != "undefined" && response.defibrillation.last != controls.defib.last) {
					if(response.defibrillation.last == 0) {
						controls.defib.last = 0;
					} else {
						controls.defib.shock = response.defibrillation.shock;
						if(controls.defib.shock == 1) {
							controls.defib.last = response.defibrillation.last;
							chart.ekg.length = chart.ekg.rhythm['defib'].length;
							chart.ekg.patternIndex = 0;
							chart.ekg.rhythmIndex = 'defib';
						}
					}
				}

				/************ controller ip **************/
				if(typeof(response.controllers) != "undefined" && typeof(response.controllers[1]) != "undefined" && response.controllers[1] != controls.controllers.ip) {
					controls.controllers.ip = response.controllers[1];
					if( controls.controllers.ip == "" ) {
						$('#controller-ip').html("No controller found");
					}
					else
					{
						var str = "Controller found at IP address:<br>";
						jQuery.each(response.controllers, function(){
							str += '<a href="javascript:void(0);" onClick=PopupCenter(\'http://'+this+'\',\'ctlStatus'+this+'\',\'448\',\'448\'); return false;">'+this+'</a><br>';
									   
						});
						$('#controller-ip').html(str);
						
						// call fetch version
						$.ajax({
							url: '../sim-ii/ajax/ajaxGetCntrlStat.php',
							type: 'get',
							dataType: 'json',
							data: { ip : controls.controllers.ip },
							success: function(response,  textStatus, jqXHR ) {
								if( response.ver != "no data" && response.ver != 'failed' ) {
									controls.controllers.fwVers = response.ver;
								} else {
									controls.controllers.fwVers = "Controller not found";
								}
							}
						});

						
					}
				}
				/************ auscultation **************/
				if(typeof(response.auscultation) != "undefined" ) {
					controls.auscultation = response.auscultation;
					
					// has auscultation been cancelled
					if( response.auscultation.side == 0 ) {
						telesim.clearAuscultation();	
					} else {
						var coord = response.auscultation.side + '-' + response.auscultation.row + '-' + response.auscultation.col;
						telesim.setAuscultation( coord );
					}
				}
				if ( simmgr.running < 1 )
				{
					simmgr.running = 1;
					clearTimeout(simmgr.quickTimer );
					clearTimeout(simmgr.statusTimer );
					simmgr.quickTimer = setTimeout(function() { simmgr.getQuickStatus(); }, simmgr.quickInterval );
					simmgr.statusTimer = setTimeout(function() { simmgr.getStatus(); }, simmgr.statusInterval );
				}
			},

			error: function( jqXHR,  textStatus,  errorThrown){
				console.log("AJAX error: ", textStatus, errorThrown );
				if ( textStatus == "error" )
				{
					simmgr.running = -1;
					$(".welcome-title").html("The Server is not responding" ).css({'color':'red'});
					simmgr.statusTimer = setTimeout(function() { simmgr.getStatus(); }, simmgr.longStatusInterval );
				}
			},
			complete: function(jqXHR,  textStatus ){
				if ( simmgr.running == 1 )
				{
					simmgr.statusTimer = setTimeout(function() { simmgr.getStatus(); }, simmgr.statusInterval );
				}
			}
		});			
	},
	
	// After audio play, clear the play controller (II only). Allow a 2 second lag
	endAudio : function() {
		setTimeout(function(){
			if ( controls.vocals.play == 1 )	// Only clear if still set.
			{
				simmgr.sendChange({
					'set:vocals:play': 0
				});
			}
		}, 2000 );
	},
	
	// Generic routine to change Instructor parameters. 'data' is an array of parameters and values
	sendChange : function (data ) {
//		if ( simmgr.running < 1)
//		{
//			return;
//		}
		$.ajax({
			url: BROWSER_CGI + 'simstatus.cgi',
			type: 'get',
			dataType: 'json',
			data: data,
			success: function(response,  textStatus, jqXHR ) {
			},
			error: function( jqXHR,  textStatus,  errorThrown){
				console.log("error: "+textStatus+" : "+errorThrown );
			}
		});			
	},
	
	// PHP call to maintain login
	tapHost : function ( ) {
		
		if ( simmgr.running < 1 )
		{
			return;
		}
		$.ajax({
			url: BROWSER_AJAX + 'ajaxTap.php',
			type: 'post',
			complete: function() {
				setTimeout(function() { simmgr.tapHost(); }, 600000 );	// Run very 10 minutes
			}
		});			
	},
	
	isLocalDisplay: function()
	{
		return ( SERVER_ADDR == REMOTE_ADDR );
	},
	
	isTeleSim: function()
	{
		if ( typeof(localStorage.telesim) !== "undefined"  && localStorage.telesim == 1 )
		{
			return ( true );
		}
		return ( false );
	},
	
	resetQuickInterval: function()
	{
		if ( simmgr.isLocalDisplay() )
		{
			if ( simmgr.isTeleSim() )
			{
				simmgr.quickInterval = 40;
			}
			else
			{
				simmgr.quickInterval = 15;
			}
		}
		else if ( typeof userID != "undefined" && userID == 5 )
		{
			// This is the Demo user
			simmgr.quickInterval = 200;
		}
		else
		{
			simmgr.quickInterval = 40;
		}
	}
}

// pop up center for controller IP
// From http://www.xtf.dk/2011/08/center-new-popup-window-even-on.html
function PopupCenter(url, title, w, h) {  
    // Fixes dual-screen position                         Most browsers      Firefox  
    var dualScreenLeft = window.screenLeft != undefined ? window.screenLeft : screen.left;  
    var dualScreenTop = window.screenTop != undefined ? window.screenTop : screen.top;  
              
    width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;  
    height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;  
              
    var left = ((width / 2) - (w / 2)) + dualScreenLeft;  
    var top = ((height / 2) - (h / 2)) + dualScreenTop; 
    simmgr.diagWindow = window.open(url, 'diag', 'width=' + w + ', height=' + h + ', top=' + top + ', left=' + left); 
  
    // Puts focus on the newWindow  
    if (window.focus) {  
        simmgr.diagWindow.focus();
    }
}


