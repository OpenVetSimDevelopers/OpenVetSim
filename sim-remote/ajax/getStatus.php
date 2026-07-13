<?php
/*
sim-remote: getStatus.php
Proxies a status request to the C++ daemon on localhost:40845 and returns
the JSON response to the mobile browser. This keeps port 40845 off the
network — the phone only ever talks to port 8081.
*/
require_once('../init.php');

header('Content-Type: application/json');
header('Cache-Control: no-cache');

$url = SIMMGR_CGI_URL . '?status=' . time();

$ctx = stream_context_create(['http' => [
    'timeout'        => 3,
    'ignore_errors'  => true,
]]);

$result = @file_get_contents($url, false, $ctx);

if ($result === false) {
    echo json_encode(['error' => 'Cannot reach OpenVetSim daemon']);
} else {
    echo $result;
}
