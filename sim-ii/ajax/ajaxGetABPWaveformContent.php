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

	// ajaxGetABPWaveformContent.php: AJAX call to fetch the modal for the arterial
	// (direct) blood pressure waveform type and arterial line state.
	//
	// The pressures themselves are not set here - they are the same
	// cardiac.bps_sys / bps_dia the NIBP dialog sets. The arterial line displays
	// them continuously; this dialog selects the morphology and whether the line
	// is placed.

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
	$lineConnected = dbClass::valuesFromPost('lineConnected');
	$lineChecked = ($lineConnected == '1') ? ' checked="checked"' : '';

	$content = '
		<h1 id="modal-title">Arterial Blood Pressure</h1>

		<hr class="modal-divider clearer" />
		<div class="control-modal-div clearer modal-block-auto">
			<p class="modal-section-title">Waveform Type</p>
			<select class="abp-waveform-select modal-select">
				' . controls::getABPWaveformDropDown($currentWaveform) . '
			</select>
			<p class="modal-note">Overdamped and Underdamped are measurement artifacts:
				the displayed pressures deviate from the values you set.</p>
		</div>

		<hr class="modal-divider clearer" />
		<div class="control-modal-div clearer modal-block-auto">
			<p class="modal-section-title">Arterial Line</p>
			<label class="modal-checkbox-label">
				<input type="checkbox" class="abp-line-check"' . $lineChecked . '>Line placed and transducer zeroed
			</label>
			<p class="modal-note">Unchecked, the student monitor shows a blank strip and
				dashes. The instructor interface always shows the waveform.</p>
		</div>

		<hr class="modal-divider clearer" />
		<p class="modal-note">Pressure values are set from the NIBP control.</p>

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
