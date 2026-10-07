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
			
			// the tiles are role="button": Enter or Space works like a click
			$('#sensor-bar .sensor-tile').on('keydown', function(e) {
				if( e.key == 'Enter' || e.key == ' ' ) {
					e.preventDefault();
					$(this).trigger('click');
				}
			});
			
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
		
		// The sensor name for a tile's tooltip: the scenario's <control> <title>
		// when it has one (profile.js writes it into the hidden #button-X-title),
		// else the default in ii.php.
		tileName: function(id) {
			var t = $('#button-' + id + '-title').text();
			return String(t || '').trim();
		},

		// Show a tile on or off and set its tooltip, e.g. "ECG - Disconnect ECG Leads".
		setTile: function(id, on, actionText) {
			var name = buttons.tileName(id);
			$('#button-' + id)
				.toggleClass('is-on', on == true)
				.attr('aria-pressed', on ? 'true' : 'false')
				.prop('title', name ? name + ' \u2013 ' + actionText : actionText);
		},

		setVSButton: function(buttonType) {
			var on = ( controls[buttonType].leadsConnected != false );
			buttons.setTile(buttonType, on,
				on ? controls[buttonType].connectHTML : controls[buttonType].disconnectHTML);
		},
		
		// The PA catheter is a probe like the others, but its state lives in
		// controls.pac.placed rather than a leadsConnected flag - placing one adds a
		// waveform channel rather than just un-blanking a value - so it needs its own
		// pair rather than going through setVSButton / bindVSButton.
		setPACButton: function() {
			var on = ( controls.pac.placed == true );
			buttons.setTile('pac', on, on ? controls.pac.connectHTML : controls.pac.disconnectHTML);
		},

		bindPACButton: function() {
			simmgr.sendChange({'set:cardiac:pac_placed': (controls.pac.placed == true) ? 0 : 1});
		},

		// The arterial line (ABP). Same reason as the PA catheter for its own pair:
		// its state is controls.abp.lineConnected, not a leadsConnected flag. The
		// line can also be placed from the ABP waveform dialog; both send the same
		// command, and this button follows whichever was used.
		setABPButton: function() {
			var on = ( controls.abp.lineConnected == true );
			buttons.setTile('abp', on, on ? controls.abp.connectHTML : controls.abp.disconnectHTML);
		},

		bindABPButton: function() {
			simmgr.sendChange({'set:cardiac:abp_line': (controls.abp.lineConnected == true) ? 0 : 1});
		},

		// Comps: grey heart when idle, red heart with hands while compressions run.
		setCPRButton: function() {
			var on = ( controls.cpr.inProgress == true );
			$('#button-cpr').toggleClass('is-on', on)
				.prop('title', on ? 'Chest compressions running' : 'Chest compressions');
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