<?php
/*
sim-remote: getScenarios.php
Scans the scenarios/ directory and returns a JSON array of
{ dir, name, description } objects, sorted by scenario name.
*/
require_once('../init.php');

header('Content-Type: application/json');
header('Cache-Control: no-cache');

if (!is_dir(SERVER_SCENARIOS)) {
    echo json_encode(['status' => AJAX_STATUS_FAIL, 'error' => 'Scenarios folder not found']);
    exit();
}

$entries = scandir(SERVER_SCENARIOS);
$scenarios = [];

foreach ($entries as $dir) {
    if ($dir === '.' || $dir === '..' || $dir === '.git') continue;
    $fullPath = SERVER_SCENARIOS . $dir;
    if (!is_dir($fullPath)) continue;

    // Try to read the scenario title from the main XML file
    $name        = $dir;   // fallback: use directory name
    $description = '';

    foreach (['main.xml', 'main.sce', 'main'] as $candidate) {
        $xmlFile = $fullPath . DIR_SEP . $candidate;
        if (!file_exists($xmlFile)) continue;

        $xml = @simplexml_load_file($xmlFile);
        if ($xml === false) continue;

        // OpenVetSim scenario XML: <scenario><header><title><name>...</name></title></header>...
        if (!empty($xml->header->title->name)) {
            $name = (string)$xml->header->title->name;
        } elseif (!empty($xml->header->title)) {
            $name = (string)$xml->header->title;
        }
        if (!empty($xml->header->description)) {
            $description = (string)$xml->header->description;
        }
        break;
    }

    $scenarios[$name] = ['dir' => $dir, 'name' => $name, 'description' => $description];
}

// Sort by display name
ksort($scenarios);

echo json_encode(['status' => AJAX_STATUS_OK, 'scenarios' => array_values($scenarios)]);
