<?php
/*
sim-remote: sendChange.php
Forwards parameter-change GET arguments to the C++ daemon on localhost:40845.
The mobile browser POSTs JSON; we rebuild the query string and GET the daemon.
*/
require_once('../init.php');

header('Content-Type: application/json');
header('Cache-Control: no-cache');

// Accept params either as GET query string or JSON body
$params = [];

// JSON body (preferred from fetch API)
$body = file_get_contents('php://input');
if ($body !== '') {
    $decoded = json_decode($body, true);
    if (is_array($decoded)) {
        $params = $decoded;
    }
}

// Fall back to GET params
if (empty($params)) {
    $params = $_GET;
}

if (empty($params)) {
    echo json_encode(['status' => AJAX_STATUS_FAIL, 'error' => 'No params']);
    exit();
}

$query = http_build_query($params);
$url   = SIMMGR_CGI_URL . '?' . $query;

$ctx = stream_context_create(['http' => [
    'timeout'       => 3,
    'ignore_errors' => true,
]]);

$result = @file_get_contents($url, false, $ctx);

if ($result === false) {
    echo json_encode(['status' => AJAX_STATUS_FAIL, 'error' => 'Cannot reach OpenVetSim daemon']);
} else {
    echo json_encode(['status' => AJAX_STATUS_OK]);
}
