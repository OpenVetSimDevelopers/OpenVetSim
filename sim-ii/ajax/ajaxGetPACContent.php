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

	// ajaxGetPACContent.php: AJAX call to fetch the pulmonary artery (Swan-Ganz)
	// catheter modal.
	//
	// Unlike the arterial line, which reads pressures set elsewhere, the right
	// heart pressures belong to this catheter - nothing else in the simulator
	// models them - so they are set here alongside the tip position.
	//
	// Withdrawing the catheter removes the waveform strip entirely and the other
	// channels re-divide the space.

	// init
	require_once("../init.php");
	$returnVal = array();

	// is user logged in
	if(adminClass::isUserLoggedIn() === FALSE) {
		$returnVal['status'] = AJAX_STATUS_LOGIN_FAIL;
		echo json_encode($returnVal);
		exit();
	}

	$currentPosition = dbClass::valuesFromPost('currentPosition');
	if(empty($currentPosition)) {
		$currentPosition = 'cvp';
	}
	$placed = dbClass::valuesFromPost('placed');
	$placedChecked = ($placed == '1') ? ' checked="checked"' : '';

	// Pressures. Fall back to normal canine values if the post is empty.
	$raMean    = (int)dbClass::valuesFromPost('raMean');
	$rvSys     = (int)dbClass::valuesFromPost('rvSys');
	$rvDia     = (int)dbClass::valuesFromPost('rvDia');
	$paSys     = (int)dbClass::valuesFromPost('paSys');
	$paDia     = (int)dbClass::valuesFromPost('paDia');
	$wedgeMean = (int)dbClass::valuesFromPost('wedgeMean');

	if($raMean    <= 0) { $raMean    = 5;  }
	if($rvSys     <= 0) { $rvSys     = 25; }
	if($rvDia     <= 0) { $rvDia     = 5;  }
	if($paSys     <= 0) { $paSys     = 25; }
	if($paDia     <= 0) { $paDia     = 12; }
	if($wedgeMean <= 0) { $wedgeMean = 9;  }

	$content = '
		<h1 id="modal-title">PA Catheter</h1>

		<hr class="modal-divider clearer" />
		<div class="control-modal-div clearer modal-block-auto">
			<p class="modal-section-title">Catheter</p>
			<label class="modal-checkbox-label">
				<input type="checkbox" class="pac-placed-check"' . $placedChecked . '>Catheter placed
			</label>
			<p class="modal-note">With no catheter placed the waveform strip is removed
				and the remaining waveforms expand to fill the space.</p>
		</div>

		<hr class="modal-divider clearer" />
		<div class="control-modal-div clearer modal-block-auto">
			<p class="modal-section-title">Tip Position</p>
			<select class="pac-position-select modal-select">
				' . controls::getPACPositionDropDown($currentPosition) . '
			</select>
			<p class="modal-note">Advance through the positions to simulate floating the
				catheter. The right ventricle is recognised by diastole falling to
				baseline; the pulmonary artery by diastole stepping back up.</p>
		</div>

		<hr class="modal-divider clearer" />
		<div class="control-modal-div clearer modal-block-auto">
			<p class="modal-section-title">Right Heart Pressures (mmHg)</p>
			<div class="modal-field-row">
				<label class="modal-field-label">RA / CVP mean</label>
				<input type="number" class="pac-ra-mean modal-number" min="0" max="40" value="' . $raMean . '">
			</div>
			<div class="modal-field-row">
				<label class="modal-field-label">RV systolic</label>
				<input type="number" class="pac-rv-sys modal-number" min="0" max="120" value="' . $rvSys . '">
			</div>
			<div class="modal-field-row">
				<label class="modal-field-label">RV diastolic</label>
				<input type="number" class="pac-rv-dia modal-number" min="0" max="40" value="' . $rvDia . '">
			</div>
			<div class="modal-field-row">
				<label class="modal-field-label">PA systolic</label>
				<input type="number" class="pac-pa-sys modal-number" min="0" max="120" value="' . $paSys . '">
			</div>
			<div class="modal-field-row">
				<label class="modal-field-label">PA diastolic</label>
				<input type="number" class="pac-pa-dia modal-number" min="0" max="80" value="' . $paDia . '">
			</div>
			<div class="modal-field-row">
				<label class="modal-field-label">Wedge (PAWP) mean</label>
				<input type="number" class="pac-wedge-mean modal-number" min="0" max="60" value="' . $wedgeMean . '">
			</div>
			<p class="modal-note">Normal dog: RA 5, RV 25/5, PA 25/12, PAWP 9. PA systolic
				normally equals RV systolic, and PA diastolic normally sits close to the
				wedge pressure - the pressure scale auto-ranges to whatever you set.</p>
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
