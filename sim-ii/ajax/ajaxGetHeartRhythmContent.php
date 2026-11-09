<?php
/*
sim-ii

Copyright (C) 2019  VetSim, Cornell University College of Veterinary Medicine Ithaca, NY

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>
*/

	// ajaxGetHeartRythmContent.php: AJAX call to fetch the modal for Heart Rythm controls


	// init
	require_once("../init.php");
	$returnVal = array();

	// is user logged in
	if(adminClass::isUserLoggedIn() === FALSE) {
		$returnVal['status'] = AJAX_STATUS_LOGIN_FAIL;
		echo json_encode($returnVal);
		exit();
	}
	
	// ecg waveforms
	
	$currentECG = dbClass::valuesFromPost('currentECG');
	$currentPulse = dbClass::valuesFromPost('currentPulse');
	$currentAmplitude = dbClass::valuesFromPost('currentAmplitude');
	$currentPulseFrequency = dbClass::valuesFromPost('currentPulseFrequency');
	$currentPEA = dbClass::valuesFromPost('PEA');
	$currentArrest = dbClass::valuesFromPost('arrest');
	$currentAvbRatio = (int)dbClass::valuesFromPost('currentAvbRatio');
	$currentAtrialRate = (int)dbClass::valuesFromPost('currentAtrialRate');
	if($currentAvbRatio < 2) {
		$currentAvbRatio = 3;
	}
	if($currentAtrialRate <= 0) {
		$currentAtrialRate = 120;
	}
	
	// create PEA value
	if($currentPEA == 'true') {
		$PEAChecked = ' checked="checked" ';
	} else {
		$PEAChecked = '';
	}
	
	// create arrest value
	if($currentArrest == 'true') {
		$arrestChecked = ' checked="checked" ';
	} else {
		$arrestChecked = '';
	}
	
	// generate ecg dropdown
	
	$content = '
		<h1 id="modal-title">Set Heart Rhythm</h1>

		<hr class="modal-divider clearer" />
		<div class="control-modal-div heart-rhythm ecg clearer">
			<p class="modal-section-title">Select ECG</p>
			<select class="ecg-select modal-select">
				' . controls::getECGDropDown($currentECG) . '
			</select>
		</div>		
		<div class="control-modal-div heart-rhythm amplitude">
			<p class="modal-section-title">Amplitude</p>
			<select class="amplitude-select modal-select">
				' . controls::getVFIBAmplitudeDropDown($currentAmplitude) . '
			</select>
		</div>		
		<div class="control-modal-div heart-rhythm pea">
			<p class="modal-section-title">PEA</p>
			<input type="checkbox" value="yes" ' . $PEAChecked . ' name="PEA" id="PEA">
		</div>
		<div class="control-modal-div heart-rhythm pea">
			<p class="modal-section-title">Arrest</p>
			<input type="checkbox" value="yes" ' . $arrestChecked . ' name="arrest" id="arrest">
		</div>
		<div class="control-modal-div heart-rhythm pulses clearer">
			<p class="modal-section-title">VPC</p>
			<select class="pulse-select modal-select">
				' . controls::getPulseDropDown($currentPulse) . '
			</select>
		</div>		
		<div class="control-modal-div heart-rhythm frequency">
			<p class="modal-section-title">VPC Frequency</p>
			<select class="frequency-select modal-select">
				' . controls::getPulseFrequencyDropDown($currentPulseFrequency) . '
			</select>			
		</div>
		<div class="control-modal-div heart-rhythm avb-ratio clearer">
			<p class="modal-section-title">P waves : QRS</p>
			<select class="avb-ratio-select modal-select">
				' . controls::getAvbRatioDropDown($currentAvbRatio) . '
			</select>
		</div>
		<div class="control-modal-div heart-rhythm atrial-rate clearer">
			<p class="modal-section-title">Atrial (P wave) rate, BPM</p>
			<input type="number" class="atrial-rate-input modal-select" min="20" max="300" step="1" value="' . $currentAtrialRate . '">
		</div>
		
		
		<hr class="modal-divider clearer" />
		<h2 class="modal-section-title">Heart Rate (BPM)</h2>
		<div class="control-modal-div">
			<p class="modal-input-label">Current</p>
			<p class="modal-input-label new-value">New</p>
			<a class="control-incr-decr-rate decr-rate" href="javascript: void(2);"><<</a>
			<input value="0" class="strip-value current" readonly="readonly" disabled="disabled">

			<!-- old slider -->
			<!-- <div class="control-slider-1"></div>
			<input value="0" class="strip-value new"> -->
			
			<!-- New slider -->
			<div value="0" class="control-slider-1 float-left" data-highlight="true"></div>		
			<input value="0" class="strip-value new">
			
			<a class="control-incr-decr-rate incr-rate" href="javascript: void(2);">>></a>
			<div class="clearer"></div>
		</div>

		<hr class="modal-divider" />
		<div class="control-modal-div">
			<button class="red-button modal-button apply">Apply</button>
			<button class="red-button modal-button cancel">Cancel</button>
		</div>
	';


	$returnVal['status'] = AJAX_STATUS_OK;
	$returnVal['html'] = $content;
	echo json_encode($returnVal);
	exit();


?>