<?php
/*
sim-remote: Mobile/tablet remote control interface for OpenVetSim
Copyright (C) 2024  Cornell University College of Veterinary Medicine

Simplified init — no database, no login required.
All requests are treated as authenticated (same trust model as the
local PHP built-in server used by sim-ii when running from Application Support).
*/

session_start();

define('DIR_SEP', '/');
define('AJAX_STATUS_OK',    0);
define('AJAX_STATUS_FAIL',  1);

// Document root is the OpenVetSim web root (parent of sim-remote/)
$docRoot = rtrim($_SERVER['DOCUMENT_ROOT'], '/');

define('SERVER_SCENARIOS',  $docRoot . '/scenarios/');
define('SERVER_SIM_LOGS',   $docRoot . '/simlogs/');

// The C++ status daemon always listens on localhost:40845
define('SIMMGR_CGI_URL', 'http://127.0.0.1:40845/simstatus.cgi');
