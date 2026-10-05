/*
sim-ii: Copyright (C) 2019  VetSim, Cornell University College of Veterinary Medicine Ithaca, NY

See gpl.html
*/
	var buttons = {
		disconnectColor: "#B31B1B",
		connectColor: "green",
		
		init: function() {
			// init colors and label
			buttons.setVSButton("ekg");
			buttons.setVSButton("SpO2");
			buttons.setVSButton("Tperi");
			buttons.setVSButton("CO2");
			buttons.setVSButton("bpcuff");
			buttons.setPACButton();
			buttons.setABPButton();
			buttons.setCPRButton();
			
			// bind button events
			$('#button-ekg').click(function() {
				buttons.bindVSButton("ekg");
			});
			$('#button-SpO2').click(function() {
				buttons.bindVSButton("SpO2");
			});
			$('#button-Tperi').click(function() {
				buttons.bindVSButton("Tperi");
			});
			$('#button-CO2').click(function() {
				buttons.bindVSButton("CO2");
			});
			$('#button-bpcuff').click(function() {
				buttons.bindVSButton("bpcuff");
			});
			$('#button-pac').click(function() {
				buttons.bindPACButton();
			});
			$('#button-abp').click(function() {
				buttons.bindABPButton();
			});
			
			// remove border from nibp button and bind action
			$('#button-nbp').css('border', 'none');
			$('#button-nbp').click(function() {
				if(controls.nbp.nibp_read != 1) {
					simmgr.sendChange({'set:cardiac:nibp_read': 1});					
				}
			});
			
		},
		
		setVSButton: function(buttonType) {
			if(controls[buttonType].leadsConnected == false) {
				$('#button-' + buttonType).css({
					'background-color': buttons.disconnectColor
					}).prop('title', controls[buttonType].disconnectHTML);
			} else {
				$('#button-' + buttonType).css({
					'background-color': buttons.connectColor
					}).prop('title', controls[buttonType].connectHTML);			
			}
		},
		
		// The PA catheter is a probe like the others, but its state lives in
		// controls.pac.placed rather than a leadsConnected flag - placing one adds a
		// waveform channel rather than just un-blanking a value - so it needs its own
		// pair rather than going through setVSButton / bindVSButton.
		setPACButton: function() {
			if(controls.pac.placed == false) {
				$('#button-pac').css({
					'background-color': buttons.disconnectColor
					}).prop('title', controls.pac.disconnectHTML);
			} else {
				$('#button-pac').css({
					'background-color': buttons.connectColor
					}).prop('title', controls.pac.connectHTML);
			}
		},

		bindPACButton: function() {
			simmgr.sendChange({'set:cardiac:pac_placed': (controls.pac.placed == true) ? 0 : 1});
		},

		// The arterial line (ABP). Same reason as the PA catheter for its own pair:
		// its state is controls.abp.lineConnected, not a leadsConnected flag. The
		// line can also be placed from the ABP waveform dialog; both send the same
		// command, and this button follows whichever was used.
		setABPButton: function() {
			if(controls.abp.lineConnected == false) {
				$('#button-abp').css({
					'background-color': buttons.disconnectColor
					}).prop('title', controls.abp.disconnectHTML);
			} else {
				$('#button-abp').css({
					'background-color': buttons.connectColor
					}).prop('title', controls.abp.connectHTML);
			}
		},

		bindABPButton: function() {
			simmgr.sendChange({'set:cardiac:abp_line': (controls.abp.lineConnected == true) ? 0 : 1});
		},

		setCPRButton: function() {
			if(controls.cpr.inProgress == false) {
				$('#button-cpr').attr('src', BROWSER_IMAGES + 'empty.png');
			} else {
				$('#button-cpr').attr('src', BROWSER_IMAGES + 'heart.png');
			}
		},
		
		bindVSButton: function(buttonType) {
				var value = 0;
				if(controls[buttonType].leadsConnected == false) {
					value = 1;
				}
				
				// send command based on button type
				if(buttonType == 'ekg') {
					simmgr.sendChange({'set:cardiac:ecg_indicator': value});
				} else if(buttonType == 'SpO2') {
					simmgr.sendChange({'set:respiration:spo2_indicator': value});					
				} else if(buttonType == 'CO2') {
					simmgr.sendChange({'set:respiration:etco2_indicator': value});										
				} else if(buttonType == 'bpcuff') {
					simmgr.sendChange({'set:cardiac:bp_cuff': value});										
				} else if(buttonType == 'Tperi') {
					simmgr.sendChange({'set:general:temperature_enable': value});										
				}
		}
	}