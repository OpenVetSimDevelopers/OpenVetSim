<?php
ini_set('display_errors', 'On');
error_reporting(E_ALL & ~E_DEPRECATED);
/*
ii.php: 

Copyright (C) 2019-2021  VetSim, Cornell University College of Veterinary Medicine Ithaca, NY

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

	// ii-php: Instructor interface

	require_once('init.php');
	
	if ( ! $noDB )
	{
		$status = adminClass::isUserLoggedIn();
		if($status === FALSE) {
			header('location: index.php');
		}
	}
	$userRow = adminClass::getUserRowFromSession();	
	$userName = $userRow['UserFirstName'] . " " . $userRow['UserLastName'];
	$uid = $userRow['UserID'];
	$sessionID = session_id();
	  
	$uploadErrorCode = FILE_NO_ERROR;

	// If Demo user, then we use a temporary directory for Scenarios
	// Otherwise, the standard directory
	if ( $uid == 5 )
	{
		define("SERVER_ACTIVE_SCENARIOS", SERVER_DEMO_SCENARIOS . $sessionID . DIRECTORY_SEPARATOR);
		define("BROWSER_ACTIVE_SCENARIOS",BROWSER_DEMO_SCENARIOS . $sessionID . DIRECTORY_SEPARATOR);

	}
	else
	{
		define("SERVER_ACTIVE_SCENARIOS", SERVER_SCENARIOS );
		define("BROWSER_ACTIVE_SCENARIOS", BROWSER_SCENARIOS );
	}
	
	// are deleting a scenario?
	$deleteScenarioDir = dbClass::valuesFromGet('ddir');
	if($deleteScenarioDir != '') {
		if(fileClass::deleteDir(SERVER_ACTIVE_SCENARIOS . $deleteScenarioDir)) {
			$uploadErrorCode = SHOW_SCENARIO_MANAGER;
		} 
	}
	
	// process POST and see if we added a new scenario
	$scenarioDir = '';
	if(isset($_POST['scenario-submit']) === TRUE) {
		// check for $_FILES error codes
		$fileUploadError = $_FILES['scenario-file-select']['error'];
		if($fileUploadError == UPLOAD_ERR_OK) {
			// delete temp directory
			fileClass::deleteDir(TMP_SCENARIO_DIR);
			
			// make temp directory and unpack archive
			@mkdir(TMP_SCENARIO_DIR, 0777, TRUE );

			// attempt to extract the zip
			$scenarioZip = new ZipArchive;
			$resource = $scenarioZip->open($_FILES['scenario-file-select']['tmp_name']);
			if ($resource === TRUE) {
				$scenarioZip->extractTo(TMP_SCENARIO_DIR);
				$scenarioZip->close();
				
				fileClass::setDirModeRecursive(TMP_SCENARIO_DIR, 0777);
				$uploadErrorCode = FILE_EXTRACT_ZIP_OK;
			} else {
				$uploadErrorCode = FILE_EXTRACT_ZIP_FAIL;
				fileClass::deleteDir(TMP_SCENARIO_DIR);
			}			
		}
		
		// validate archive if extract is OK
		if($uploadErrorCode == FILE_EXTRACT_ZIP_OK) {
			if(!fileClass::validateScenarioArchive()) {
				$uploadErrorCode = FILE_SCENARIO_INVALID;				
				fileClass::deleteDir(TMP_SCENARIO_DIR);
			} else {
				// check for duplicate scenario directories
				$parts = pathinfo($_FILES['scenario-file-select']['name']);
				if(is_dir(SERVER_ACTIVE_SCENARIOS . $parts['filename'])) {
					$uploadErrorCode = FILE_SCENARIO_DUP;
					$scenarioDir = $parts['filename'];
				} else {
					// move the temp directory to a new scenario
					fileClass::copyDir(TMP_SCENARIO_DIR, SERVER_ACTIVE_SCENARIOS . $parts['filename'] . '/', 0777);
					fileClass::deleteDir(TMP_SCENARIO_DIR);					
				}
			}
		}
/*	
		$parts = pathinfo($_FILES['scenario-file-select']['name']);
		$ext = $parts['extension'];
		if($ext == 'zip') {
			if(is_dir(SERVER_ACTIVE_SCENARIOS . $parts['filename'])) {
				$dupScenario = 1;
				fileClass::deleteDir(TMP_SCENARIO_DIR);
				$tmpFileName = pathinfo($_FILES['scenario-file-select']['tmp_name']);
				@mkdir(TMP_SCENARIO_DIR, 0777);
				move_uploaded_file($_FILES['scenario-file-select']['tmp_name'], TMP_SCENARIO_DIR . $_FILES['scenario-file-select']['name']);
				$scenarioDir = $parts['filename'];
			} else {
				$scenarioZip = new ZipArchive;
				$resource = $scenarioZip->open($_FILES['scenario-file-select']['tmp_name']);
				if ($resource === TRUE) {
					@mkdir(TMP_SCENARIO_DIR, 0777);
					$scenarioZip->extractTo(TMP_SCENARIO_DIR);
					$scenarioZip->close();
					
					$fileListArray = fileClass::getSPLFileList(TMP_SCENARIO_DIR);
					foreach($fileListArray as $fileName) {
						chmod($fileName, 0777);
					}
					
					// copy from temp directory to new scenario folder
					fileClass::copyDir(TMP_SCENARIO_DIR, SERVER_ACTIVE_SCENARIOS . $parts['filename'] . '/', 0777);
					fileClass::deleteDir(TMP_SCENARIO_DIR);
					$scenarioClick = 1;
				} else {
					$invalidScenario = 1;
				}
			}
		} else {
			$invalidScenario = 1;
		}
*/
	}
	
	// get scenario list
	$scenarioNameArray = [];
	$scenarioFolderList = is_dir(SERVER_ACTIVE_SCENARIOS) ? scandir(SERVER_ACTIVE_SCENARIOS) : [];
	$scenarioContent = '';
	foreach($scenarioFolderList as $key => $scenarioFolder) {
		if(is_dir(SERVER_ACTIVE_SCENARIOS . $scenarioFolder) === TRUE) {
			if( $scenarioFolder == '.' || $scenarioFolder == '..' || $scenarioFolder == '.git' ) {
				continue;
			}
			
			// does the folder name have any embedded spaces?
			if( strpos( $scenarioFolder, " " ) !== FALSE ) {
				$newScenarioFolderName = str_replace( " ", "_", $scenarioFolder );
				rename( SERVER_ACTIVE_SCENARIOS . $scenarioFolder, SERVER_ACTIVE_SCENARIOS . $newScenarioFolderName );
				$scenarioFolder = $newScenarioFolderName;
			}
			
			if(file_exists(SERVER_ACTIVE_SCENARIOS . $scenarioFolder . DIRECTORY_SEPARATOR . 'main.xml') === TRUE) {
				$scenarioHeader = scenarioXML::getScenarioHeaderArray($scenarioFolder . DIRECTORY_SEPARATOR . 'main');
				$fileName = $scenarioFolder . DIRECTORY_SEPARATOR . 'main';
				$scenarioHeaderArray = scenarioXML::getScenarioHeaderArray($fileName);
					
				// add error message for invalid main.xml
				if( gettype($scenarioHeaderArray) != "array" ) {
					printf("<span style='color:red;'>Error in $scenarioFolder/main.xml</span>");
				} else {
					$titleVal = $scenarioHeaderArray['title'];
				$titleStr = is_array($titleVal) ? ($titleVal['name'] ?? reset($titleVal)) : (string)$titleVal;
				$scenarioNameArray[$titleStr] = $scenarioFolder;
				}
			}
		}
	}

	// sort the scenario names
	if (!isset($scenarioNameArray)) $scenarioNameArray = [];
	ksort($scenarioNameArray);
			
	foreach($scenarioNameArray as $scenarioName => $scenarioFolder) {
		$scenarioContent .= '
			<option value="' . $scenarioFolder . '">';
		$scenarioContent .= $scenarioName;
		$scenarioContent .= '</option>
		';
	}
?>
<!DOCTYPE html>
<html>
	<head>
		<?php require_once(SERVER_INCLUDES . "header.php"); ?>
		<?php
		// This is forTeleSim
//		exec("simSoundInit" );
	/*
		if ( file_exists("../sim-sounds/soundList.php" ) )
		{
			require_once("../sim-sounds/soundList.php" );
			echo "<script type='text/javascript' src='".BROWSER_SCRIPTS."simsound.js'></script>\n";
		}
	*/
		// End TeleSim
		?>
		<script type="text/javascript">
			var uploadErrorCode = <?= $uploadErrorCode; ?>;
			var userID = <?= $uid ?>;
			var noDB = <?= $noDB ?>;
			window.vitalsWindow = 0;
			
			document.cookie = "userID="+userID+"; path=/";
			var isVitalsMonitor = 0;	// Student Display Flag
			$(document).ready(function() {
window.name = "OpenVetSim II";
console.log("Window name: " + window.name);

				// hide debrief menu item
				$('.logout.debrief').hide();
				
				if ( noDB )
				{
					$("#logout_close").click(function() {
						if ( confirm("This will close the Simulator Application. Is this what you want to do?" ) )
						{
							simmgr.running = 0;
							var data = {'close': 565}
							$.ajax({
								url: BROWSER_CGI + 'simstatus.cgi',
								type: 'get',
								dataType: 'json',
								data: data,
								success: function(response,  textStatus, jqXHR ) {
									if ( typeof(response.close) !== 'undefined' && response.close == 565 )
									{
										// make sure vitals exists and is open
										if( typeof( window.vitalsWindow ) === 'object' && !window.vitalsWindow.closed ) {
											window.vitalsWindow.close();
										}
										// make sure diag exists and is open
										if( typeof( simmgr.diagWindow ) === 'object' && !simmgr.diagWindow.closed ) {
											simmgr.diagWindow.close();
										}
										window.close(); 

									}
									else
									{
										alert("Application Close Failed" );
									}
								},
								error: function( jqXHR,  textStatus,  errorThrown){
									console.log("error: "+textStatus+" : "+errorThrown );
								}
							});		
						}
					});
				}
				
				// init menu
				menu.init();
				
				// init profile data
				scenario.loadScenario();
				profile.init();
				
				chart.init();
				
				controls.heartRate.init();
				controls.awRR.init();
				controls.SpO2.init();
				controls.etCO2.init();
				controls.Tperi.init();
				controls.nbp.init();
				controls.pulse.init();
				buttons.init();
				events.init();
				scenario.init();
				telesim.init();
//				media.init();
//				log.init();

				// init patient info
				profile.initPatientInfo();
				controls.heartRhythm.calculateVPCFreq();
console.log(controls['awRR'].increment);
				// init displayed values
				$('#vs-heartRhythm p.display-rate').html(controls.heartRate.value);
				$('#vs-awRR p.display-rate').html(controls.awRR.value);
				
				// demo controls -- will be removed for production
				// demo beat now
				/*
				$('#switch-ekg-now').click(function() {
					if(chart.ekg.rhythmIndex == 0) {
						chart.ekg.rhythmIndex = 1;
					} else if(chart.ekg.rhythmIndex == 1) {
						chart.ekg.rhythmIndex = 2;
					} else {
						chart.ekg.rhythmIndex = 0;
					}
					chart.ekg.length = chart.ekg.rhythm[chart.ekg.rhythmIndex].length
				});
				$('#ekg-sound').click(function() {
					if($(this).hasClass('play') == true) {
						controls.heartRate.audio.play();
						$(this).removeClass('play').addClass('pause');
						$(this).html('Turn EKG Sound OFF!');
						chart.ekg.beepFlag = true;
					} else {
						$(this).removeClass('pause').addClass('play');
						$(this).html('Turn EKG Sound ON!');
						chart.ekg.beepFlag = false;
					}
				
				});
				
				$('#switch-resp-now').click(function() {
					if(chart.resp.rhythmIndex == 0) {
						chart.resp.rhythmIndex = 1;
					} else {
						chart.resp.rhythmIndex = 0;
					}
					chart.resp.length = chart.resp.rhythm[chart.resp.rhythmIndex].length
				});
				*/
				simmgr.init();
				hotkeys.init();
				controls.cpr.init();
				controls.manualRespiration.init();
				
				if(uploadErrorCode == <?= FILE_EXTRACT_ZIP_OK; ?>) {
					$('#scenario-click').click();
				}
				
				// duplicate scenario?
				if(uploadErrorCode == <?= FILE_SCENARIO_DUP; ?>) {
					if(confirm('Duplicate scenario...overwrite?')) {
						scenario.addScenario('<?= $scenarioDir; ?>');
					}
				} else if(uploadErrorCode == <?= FILE_EXTRACT_ZIP_FAIL; ?> || uploadErrorCode == <?= FILE_SCENARIO_INVALID; ?>) {
					alert("Invalid scenario zip file.");
				}
			});
			
			function burgerTransform(x) {
				x.classList.toggle("change");
				$( ".subnav" ).slideToggle();
			}

		</script>
	</head>
	<body>
		<div id="sitewrapper">
			<div id="admin-nav">
				<h1>Open VetSim Instructor Interface</h1>
				<!-- <h1>Open VetSim Instructor Interface - V<?= VERSION_MAJOR . '.' . VERSION_MINOR; ?></h1> -->
				<!-- <h1 class="welcome-title">Welcome <?= $userName; ?></h1> -->
				<div class="profile-display scenario">
					Scenario: 
					<span id="scenario-name-display">Default Scenario</span>
					&nbsp;&nbsp;|&nbsp;&nbsp;Scene:&nbsp;<span id="scene-name">Test</span>&nbsp;-&nbsp;<span id="scene-id">1</span>
				</div>
				<ul id="main-nav">
					<!-- <li class="with-sub-nav">
						<a href="javascript:void(2);">File</a>
						<ul class="sub-nav">
							<li><a href="javascript: void(2);">File Another Item</a></li>
							<li><a href="javascript: void(2);">File Another Item</a></li>
							<li><a href="javascript: void(2);">File Another Item</a></li>
							<li><a href="javascript: void(2);">File Another Item</a></li>
						</ul>
					</li>
					<li class="with-sub-nav">
						<a href="javascript:void(2);">Settings</a>
						<ul class="sub-nav">
							<li><a href="javascript: void(2);">Settings Another Item</a></li>
							<li><a href="javascript: void(2);">Settings Another Item</a></li>
							<li><a href="javascript: void(2);">Settings Another Item</a></li>
							<li><a href="javascript: void(2);">Settings Another Item</a></li>
						</ul>
					</li> -->
					<!-- <li >
						<a href="javascript:void(2);" onclick="modal.showUsers();">Users</a>
					</li> -->
					<li >
						<a href="javascript:void(2);" onclick="window.vitalsWindow = window.open('vitals.php','vitals','resizable');">Vitals</a>
					</li>
					<!-- <li class="tele-sim disabled">
						<a href="javascript:void(2);" onclick="telesim.toggleTeleSim(); return false;">Enable TeleSim</a>
					</li> -->
					<li class="menu-events">
						<a href="javascript:void(2);" onclick="modal.showEvents(); return false;">Events (Hot Keys)</a>
					</li>
					<li class="logout burger-div">
						<div class="burger" onclick="burgerTransform(this)">
							<div class="bar1"></div>
							<div class="bar2"></div>
							<div class="bar3"></div>
						</div>												
					</li>
					<!-- <li class="logout">
						<a href="../../editor/editor.php"  class="event-link breath-link">Editor</a>						
					</li> -->
					<li class="logout start-comps perm-hotkey">
						<a href="javascript: void(2);"  class="event-link cpr-link">Start Comps (c)</a>						
					</li>
					<li class="logout manual-breath perm-hotkey">
						<a href="javascript: void(2);"  class="event-link breath-link">Manual Breath (b)</a>						
					</li>
				</ul>
			</div>
			<div class="subnav">
				<div class="subnav-content">
					<a href="javascript: void(2);" onclick="modal.manageScenarios();" class="event-link" id="scenario-click">Scenarios</a>
					<a href="javascript: void(2);" onclick="modal.aboutModal();" class="event-link" id="about-click">About</a>
					<a href="/sim-player/player.php" class="event-link">Debrief</a>	
					<a href="javascript: void(2);" class="event-link" id="logout_close">Close</a>
				</div>
			</div>

			<div id="mannequin" class="clearer float-left ii-border">
				<h1>Non Vital Controls</h1>
				<h2 id="button-palpate-title" class="nvs-button"></h2>
				<img class="nvs-button" id="button-palpate" src="<?= BROWSER_IMAGES; ?>palpate.png" alt="Palpate Icon">
				<h2 id="button-cpr-title" class="nvs-button"></h2>
				<img class="nvs-button" id="button-cpr" src="<?= BROWSER_IMAGES; ?>empty.png" alt="CPR Icon">
				<h2 id="button-SpO2-title" class="nvs-button"></h2>
				<img class="nvs-button" id="button-SpO2" src="<?= BROWSER_IMAGES; ?>spo2.png" alt="SpO2 Icon">
				<h2 id="button-ekg-title" class="nvs-button"></h2>
				<img class="nvs-button" id="button-ekg" src="<?= BROWSER_IMAGES; ?>ekg.png" alt="EKG Icon">
				<h2 id="button-Tperi-title" class="nvs-button"></h2>
				<img class="nvs-button" id="button-Tperi" src="<?= BROWSER_IMAGES; ?>Tperi.png" alt="Temperature Icon">
				<h2 id="button-CO2-title" class="nvs-button"></h2>
				<img class="nvs-button" id="button-CO2" src="<?= BROWSER_IMAGES; ?>co2.png" alt="CO2 Icon">
				<h2 id="button-bpcuff-title" class="nvs-button"></h2>
				<img class="nvs-button" id="button-bpcuff" src="<?= BROWSER_IMAGES; ?>bpcuff.png" alt="bpcuff Icon">
				
				<!-- PEA and Cardiac Arrest Indicators -->
				<h2 id="indicator-pea">PEA</h2>
				<h2 id="indicator-arrest">Arrest</h2>

				<div id="vocals-dog-control" class="dog-control">
					<a class="control-title" id="vocals-dog-control-title" href="javascript: void(2)" onclick="modal.vocals(); return false;">Vocals</a>
					<a class="control-tele-sim" id="vocals-dog-control-icon" href="javascript: void(2);" onclick="modal.vocals(); return false;"><img src="" width="" title="" alt=""></a>
					<a class="sound-mute" id="vocals-mute" href="javascript: void(2)" onclick="modal.vocals(); return false;"><img src="<?= BROWSER_IMAGES; ?>sound_mute.png"></a>
				</div>
				<div id="left-femoral-pulse-dog-control" class="dog-control">
					<a class="control-title" id="left-femoral-pulse-dog-control-title" href="javascript: void(2)" onclick="modal.pulseStrength('left', 'femoral'); return false;">Pulse Strength</a>
					<a class="control-tele-sim" id="left-femoral-pulse-dog-control-icon" href="javascript: void(2);" onclick="modal.pulseStrength('left', 'femoral'); return false;"><img src="" width="" title="" alt=""></a>
				</div>
				<div id="right-femoral-pulse-dog-control" class="dog-control">
					<a class="control-title" id="right-femoral-pulse-dog-control-title" href="javascript: void(2)" onclick="modal.pulseStrength('right', 'femoral'); return false;">Pulse Strength</a>
					<a class="control-tele-sim" id="right-femoral-pulse-dog-control-icon" href="javascript: void(2);" onclick="modal.pulseStrength('right', 'femoral'); return false;"><img src="" width="" title="" alt=""></a>
				</div>
				<div id="left-dorsal-pulse-dog-control" class="dog-control">
					<a id="left-dorsal-pulse-dog-control-title" href="javascript: void(2)" onclick="modal.pulseStrength('left', 'dorsal'); return false;">Pulse Strength</a>
				</div>
				<div id="right-dorsal-pulse-dog-control" class="dog-control">
					<a id="right-dorsal-pulse-dog-control-title" href="javascript: void(2)" onclick="modal.pulseStrength('right', 'dorsal'); return false;">Pulse Strength</a>
				</div>
				<div id="left-lung-dog-control" class="dog-control">
					<a class="control-title" id="left-lung-dog-control-title" href="javascript: void(2)" onclick="modal.leftLung(); return false;">Left Lung</a>
					<a class="control-tele-sim" id="left-lung-dog-control-icon" href="javascript: void(2);" onclick="modal.leftLung(); return false;"><img src="" width="" title="" alt=""></a>
					<a class="sound-mute" id="left-lung-mute" href="javascript: void(2)" onclick="modal.leftLung(); return false;"><img src="<?= BROWSER_IMAGES; ?>sound_mute.png"></a>
				</div>
				<div id="right-lung-dog-control" class="dog-control">
					<a class="control-title" id="right-lung-dog-control-title" href="javascript: void(2)" onclick="modal.rightLung(); return false;">Right Lung</a>
					<a class="control-tele-sim" id="right-lung-dog-control-icon" href="javascript: void(2);" onclick="modal.rightLung(); return false;"><img src="" width="" title="" alt=""></a>
					<a class="sound-mute" id="right-lung-mute" href="javascript: void(2)" onclick="modal.rightLung(); return false;"><img src="<?= BROWSER_IMAGES; ?>sound_mute.png"></a>
				</div>
				<div id="heart-sound-dog-control" class="dog-control">
					<a class="control-tele-sim" id="heart-sound-dog-control-icon" href="javascript: void(2)" onclick="modal.heartSound(); return false;"><img src="" width="" title="" alt=""></a>
					<a class="control-title" id="heart-sound-dog-control-title" href="javascript: void(2)" onclick="modal.heartSound(); return false;">Heart Sound</a>
					<a class="sound-mute" id="heart-sound-mute" href="javascript: void(2)" onclick="modal.heartSound(); return false;"><img src="<?= BROWSER_IMAGES; ?>sound_mute.png"></a>
				</div>
				<div id="chest-dog-control" class="dog-control">
					<a class="control-title" id="chest-dog-control-title" href="javascript: void(2)" onclick="modal.chestRise(); return false;">Chest Movement</a>
					<a class="control-tele-sim" id="chest-dog-control-icon" href="javascript: void(2);" onclick="modal.chestRise(); return false;"><img src="" width="" title=""></a>
				</div>
			</div>
			
			<div id="vsm" class="float-left ii-border">
				<h1><span id="startStopButton">VS</span> Monitor</h1>
				<div id="vs-left-col">
					<canvas id="vs-trace-1" class="vs-trace" width="500" height="125" onclick="modal.heartRhythm(); return false;"></canvas>
					<canvas id="vs-trace-2" class="vs-trace" width="500" height="125" onclick="modal.respRhythm(); return false;"></canvas>
				</div>
				<div id="vs-right-col">
					<div class="vs-controls clearer">
						<a href="javascript: void(0)" onclick="modal.heartRhythm(); return false;" class="strip-label color-green">HR</a>
					</div>
					<div id="vs-heartRhythm" class="vs-controls">
						<a href="javascript: void(0)" onclick="modal.heartRate(); return false;" class="display-rate color-green">70</a>
					</div>
					<div class="vs-controls clearer">
						<a href="javascript: void(0)" onclick="modal.respRhythm(); return false;" class="strip-label color-white">ETCO<sub>2</sub></a>
					</div>
					<div id="vs-etCO2" class="vs-controls">
						<a href="javascript: void(0)" onclick="modal.etCO2(); return false;" class="display-rate color-white">75</a>
					</div>
				</div>
				<div class="wide-col">
					<div class="alt-control control-Tperi">
						<a class="alt-control-title color-blue" href="javascript: void(0)" onclick="modal.Tperi(); return false;">Temp</a>
						<a class="alt-control-rate color-blue" href="javascript: void(0)" onclick="modal.Tperi(); return false;" id="display-Tperi">123</a>
					</div>
					<div class="alt-control awRR">
						<a class="alt-control-title color-white" href="javascript: void(0)" onclick="modal.awRR(); return false;">awRR</a>
						<a class="alt-control-rate color-white" href="javascript: void(0)" onclick="modal.awRR(); return false;">123</a>
					</div>
					<div class="alt-control with-sub SpO2">
						<a class="alt-control-title color-yellow" href="javascript: void(0)" onclick="modal.SpO2(); return false;">SpO<sub>2</sub></a>
						<a id="display-SpO2" class="alt-control-rate color-yellow" href="javascript: void(0)" onclick="modal.SpO2(); return false;">123</a>
					</div>
					<div id="vs-nbp" class="alt-control">
						<a class="alt-control-title color-red" href="javascript: void(0)" onclick="modal.nbp(); return false;">NIBP</a>
						<a id="display-nbp" class="alt-control-rate nbip color-red" href="javascript: void(0)" onclick="modal.nbp(); return false;"><span id="displayed-systolic">140</span>/<span id="displayed-diastolic">75</span> (<span id="displayed-meanNBP">80</span>) <span class="nbip-label">mmHg</span></a>
						<a id="display-nbp-hr" class="alt-control-rate color-red" href="javascript: void(0)" onclick="modal.nbp(); return false;"><span style="font-size: 18px;">PR</span> <span id="displayed-reportedHR">75</span></a>
						<button id="button-nbp" class="scenario-button red-button">Read NIBP</button>
					</div>
				</div>
				<!-- <div class="float-left ii-border button demo-button">
					<button id="switch-ekg-now">Switch EKG Patterns!</button>
					<button id="ekg-sound" class="pause">Turn EKG Sound Off!</button>
					<button id="switch-resp-now">Switch Resp Patterns!</button>
				</div> -->
			</div>
			
<!--			<div id="telesim-top" class="float-left ii-border telesim-right" style="background-image: url('<?= BROWSER_SCENARIOS; ?>/default/images/top-dog.png')">
				<div class="ausc-hotspot" data-coord="1-1-1" style="top: 75px; left: 100px;">1</div>
				<div class="ausc-hotspot" data-coord="1-2-1" style="top: 75px; left: 125px;">2</div>
				<div class="ausc-hotspot" data-coord="1-3-1" style="top: 100px; left: 100px;">3</div>
				<div class="ausc-hotspot" data-coord="1-4-1" style="top: 100px; left: 125px;">4</div>
			</div> -->
			<div id="telesim-0" class="float-left ii-border telesim-right">
				<select id="telesim-select-0" class="telesim-select">
					<option value="">Please select</option>
				</select>
			</div>
			<div id="telesim-1" class="float-left ii-border telesim-right">
				<select id="telesim-select-1" class="telesim-select">
					<option value="">Please select</option>
				</select>
				<div id="telesim-size" class="expand">+</div>
			</div>
			
			<div id="media-col">
				<div id="scenario-select" class="float-left clearer ii-border">
					<h2 class="float-left clearer">Scenario Select:</h2>
					<select class=" clearer float-left">
						<?= $scenarioContent; ?>
					</select>
					<button id="scenario-button" class="scenario-button float-left">Start Scenario</button>
					<h2 id="scenario-video-label">Start Video With Scenario</h2>
					<input type="checkbox" id="start-video" class="float-left">
					<p id="scenario-run-time" class="clearer float-left">Scenario Running time:</p><p class="float-left" id="scenario-running-time">01:01</p>
					<p id="scene-run-time" class="clearer float-left">Scene Running time:</p><p class="float-left" id="scene-running-time">01:00</p>
					<button id="scenario-terminate-button" class="scenario-button float-left">Terminate Scenario</button>
				</div>
				<div id="media-select" class="float-left clearer ii-border">
					<h2 class="float-left clearer">Media Select:</h2>
					<select class="clearer float-left">
					</select>
					<button id="media-button" class="scenario-button float-left">Show Media</button>
				</div>
				<div id="controller-ip">
					No controller found
				</div>
			</div>
			<div id="event-monitor" class="float-right ii-border">
				<table>
				</table>
			</div>
			<div id="comment-box" class="float-left ii-border">
				<input type="text" id="comment-input" value="Please enter comment for log">
				<button id="comment-button" class="scenario-button float-left">Log Comment</button>				
			</div>
			<div id="event-library" class="float-left"></div>

			<div class="clearer"></div>

		<!-- Video recording wait overlay — shown while OBS starts recording -->
		<div id="video-wait-overlay">
			<div class="video-wait-spinner"></div>
			<p>Waiting for video recording to start&hellip;</p>
		</div>

		<!-- Video recording stop overlay — shown while OBS finishes writing the file -->
		<div id="video-stop-overlay">
			<div class="video-wait-spinner"></div>
			<p>Stopping video recording&hellip;</p>
			<p class="video-stop-sub">Please wait until recording has finished before beginning debriefing.</p>
		</div>

		</div> <!-- sitewrapper -->
		
		<!-- Modal -->
		<div id="modal">
			<div class="container">
				<div id="modal-content">
				</div>
				<a class="close_modal" href="javascript: void(2);">
					<img src="<?= BROWSER_IMAGES; ?>x.png" alt="Close Modal">
				</a>
			</div>
		</div>
	</body>
</html>
