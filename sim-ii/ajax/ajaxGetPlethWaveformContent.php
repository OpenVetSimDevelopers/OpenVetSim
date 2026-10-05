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

	// ajaxGetPlethWaveformContent.php: AJAX call to fetch the modal for the
	// plethysmograph waveform type.
	//
	// The SpO2 value itself is not set here - that is the SpO2 control. This
	// dialog only chooses the shape of the pulse oximetry trace.

	// init
	require_once("../init.php");
	$returnVal = array();

	// is user logged in
	if(adminClass::isUserLoggedIn() === FALSE) {
		$returnVal['status'] = AJAX_STATUS_LOGIN_FAIL;
		echo json_encode($returnVal);
		exit();
	}

	$currentWaveform = dbClass::valuesFromPost('currentWaveform');
	if(empty($currentWaveform)) {
		$currentWaveform = 'normal';
	}

	$content = '
		<h1 id="modal-title">Plethysmograph Waveform</h1>

		<hr class="modal-divider clearer" />
		<div class="control-modal-div clearer modal-block-auto">
			<p class="modal-section-title">Waveform Type</p>
			<select class="pleth-waveform-select modal-select">
				' . controls::getPlethWaveformDropDown($currentWaveform) . '
			</select>
			<p class="modal-note">Poor Perfusion draws a blunt, low-amplitude pulse.
				Artifact draws a non-pulsatile trace, for a patient with no detectable
				pulse or a probe placement that cannot read.</p>
		</div>

		<hr class="modal-divider clearer" />
		<p class="modal-note">The SpO<sub>2</sub> value is set from the SpO<sub>2</sub> control.</p>

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
