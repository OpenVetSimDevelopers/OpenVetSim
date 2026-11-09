<#
ovs-diagnose.ps1 - see what OpenVetSim is doing when it stops responding (Windows)

Two ways to run it. Open PowerShell in the folder holding this file, then:

  WATCH a long scenario (start it when the scenario starts, leave it running):
      powershell -ExecutionPolicy Bypass -File .\ovs-diagnose.ps1 -Watch

    Every 30 seconds it records whether the simulator answers and how fast,
    and the simulator's CPU time, memory, handles, threads and connections,
    to Desktop\OVS-watch-<date-time>.csv. A count that keeps climbing, or an
    answer that gets slower, shows what is running out before the hang.
    Stop it with Ctrl+C.

  SNAPSHOT when it has hung (before you restart anything):
      powershell -ExecutionPolicy Bypass -File .\ovs-diagnose.ps1

    Writes a folder Desktop\OVS-diagnostics-<date-time> with a summary, the
    simulator's thread list, its connections and the end of its logs.

It changes nothing and needs no administrator rights.
#>
param(
    [switch]$Watch,
    [int]$IntervalSeconds = 30
)

$EnginePort = 40845
$PhpPort    = 8081
$Desktop    = [Environment]::GetFolderPath('Desktop')
$Stamp      = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogDirs    = @(
    (Join-Path $env:PUBLIC 'OpenVetSim\simlogs'),
    (Join-Path $env:USERPROFILE 'Documents\Claude OVS\simlogs')
)

function Probe([string]$url) {
    # Returns @{ Status = 'OK' | 'TIMEOUT' | 'REFUSED' | 'ERROR'; Ms = time taken }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $req = [Net.WebRequest]::Create($url)
        $req.Timeout = 5000
        $req.ReadWriteTimeout = 5000
        $resp = $req.GetResponse()
        $resp.Close()
        $status = 'OK'
    } catch {
        $msg = $_.Exception.ToString()
        if ($msg -match 'timed out|Timeout') { $status = 'TIMEOUT' }
        elseif ($msg -match 'refused|actively refused') { $status = 'REFUSED' }
        else { $status = 'ERROR' }
    }
    $sw.Stop()
    return @{ Status = $status; Ms = [int]$sw.ElapsedMilliseconds }
}

function TcpStates([int]$port) {
    # Counts of connections on the port, by which end and state, e.g.
    # "server-ESTABLISHED=3 server-CLOSE_WAIT=12". Reads netstat rather than
    # Get-NetTCPConnection, which fails on some PCs reading the State field.
    $states = foreach ($line in (netstat -ano)) {
        $f = $line.Trim() -split '\s+'
        if ($f.Count -lt 4 -or $f[0] -ne 'TCP') { continue }
        if ($f[1] -match ":$port$")     { 'server-' + $f[3] }
        elseif ($f[2] -match ":$port$") { 'client-' + $f[3] }
    }
    if (-not $states) { return '' }
    ($states | Group-Object | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ' '
}

$StatusUrl = "http://127.0.0.1:$EnginePort/simstatus.cgi?status=1"

# ---------------------------------------------------------------- watch mode
if ($Watch) {
    $csv = Join-Path $Desktop "OVS-watch-$Stamp.csv"
    'time,engine,engine_ms,cpu_seconds,memory_mb,handles,threads,php_handles,connections_40845' |
        Out-File -FilePath $csv -Encoding ascii
    Write-Host "Recording every $IntervalSeconds s to $csv - press Ctrl+C to stop."
    while ($true) {
        $p   = Probe $StatusUrl
        $e   = Get-Process WinVetSim -ErrorAction SilentlyContinue | Select-Object -First 1
        $php = Get-Process php -ErrorAction SilentlyContinue | Select-Object -First 1
        $row = @(
            (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'),
            $p.Status, $p.Ms,
            $(if ($e) { [int]$e.TotalProcessorTime.TotalSeconds } else { '' }),
            $(if ($e) { [int]($e.WorkingSet64 / 1MB) } else { '' }),
            $(if ($e) { $e.HandleCount } else { 'NOT RUNNING' }),
            $(if ($e) { $e.Threads.Count } else { '' }),
            $(if ($php) { $php.HandleCount } else { '' }),
            ('"' + (TcpStates $EnginePort) + '"')
        ) -join ','
        $row | Out-File -FilePath $csv -Append -Encoding ascii
        Write-Host $row
        Start-Sleep -Seconds $IntervalSeconds
    }
}

# ------------------------------------------------------------- snapshot mode
$Out = Join-Path $Desktop "OVS-diagnostics-$Stamp"
New-Item -ItemType Directory -Path (Join-Path $Out 'logs') -Force | Out-Null
$Summary = Join-Path $Out 'summary.txt'
function Say([string]$s) { $s | Tee-Object -FilePath $Summary -Append }
function Section([string]$s) { Say ''; Say "==== $s ====" }

Section 'When and where'
Say (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
Say ((Get-CimInstance Win32_OperatingSystem).Caption + ' ' + [Environment]::OSVersion.Version)
Say ('Last boot: ' + (Get-CimInstance Win32_OperatingSystem).LastBootUpTime)

Section 'Is the simulator answering? (3 tries, 5 s limit each)'
Say 'TIMEOUT = simulator running but stuck; REFUSED = simulator not running'
1..3 | ForEach-Object {
    $p = Probe $StatusUrl
    Say ("engine :$EnginePort  {0,-8} {1} ms" -f $p.Status, $p.Ms)
}
$p = Probe "http://127.0.0.1:$PhpPort/sim-ii/css/common.css"
Say ("PHP    :$PhpPort   {0,-8} {1} ms" -f $p.Status, $p.Ms)

Section 'Processes'
$procs = Get-Process WinVetSim, php, OpenVetSim -ErrorAction SilentlyContinue
$procs | Select-Object Name, Id,
    @{n='CPU s';     e={[int]$_.TotalProcessorTime.TotalSeconds}},
    @{n='Memory MB'; e={[int]($_.WorkingSet64 / 1MB)}},
    @{n='Handles';   e={$_.HandleCount}},
    @{n='Threads';   e={$_.Threads.Count}},
    StartTime |
    Format-Table -AutoSize | Out-String -Width 200 | ForEach-Object { Say $_ }

$engine = Get-Process WinVetSim -ErrorAction SilentlyContinue | Select-Object -First 1
if ($engine) {
    Section 'Simulator CPU over 5 seconds'
    $t0 = $engine.TotalProcessorTime.TotalMilliseconds
    Start-Sleep -Seconds 5
    $engine.Refresh()
    $used = [int]($engine.TotalProcessorTime.TotalMilliseconds - $t0)
    Say "$used ms of CPU in 5000 ms  (about 0 = waiting on something; about 5000 = stuck in a loop)"

    Section 'Simulator threads -> threads.txt'
    # WaitReason can only be read from a thread that is waiting
    $wait = @{n='WaitReason'; e={ if ([string]$_.ThreadState -eq 'Wait') { [string]$_.WaitReason } else { '' } }}
    $engine.Threads | Select-Object Id, ThreadState, $wait,
        @{n='CPU ms'; e={[int]$_.TotalProcessorTime.TotalMilliseconds}}, StartTime |
        Format-Table -AutoSize | Out-String -Width 200 |
        Out-File (Join-Path $Out 'threads.txt') -Encoding ascii
    ($engine.Threads | Select-Object ThreadState, $wait | Group-Object ThreadState, WaitReason |
        ForEach-Object { "$($_.Count) x $($_.Name)" }) | ForEach-Object { Say $_ }
} else {
    Say 'WinVetSim is NOT RUNNING'
}

Section 'Connections on the simulator ports'
foreach ($port in 40845, 40844, $PhpPort) { Say ("{0}: {1}" -f $port, (TcpStates $port)) }
netstat -ano | Select-String ":40845|:40844|:8081" |
    Out-File (Join-Path $Out 'netstat.txt') -Encoding ascii

Section 'Logs'
$n = 0
foreach ($d in $LogDirs) {
    if (-not (Test-Path $d)) { continue }
    $n++
    Say "found: $d"
    $tag = "dir$n"
    if (Test-Path "$d\vetsim.log") { Get-Content "$d\vetsim.log" -Tail 5000 | Out-File "$Out\logs\$tag-vetsim-tail.log" -Encoding utf8 }
    if (Test-Path "$d\php.log")    { Get-Content "$d\php.log"    -Tail 1000 | Out-File "$Out\logs\$tag-php-tail.log"    -Encoding utf8 }
    Get-ChildItem "$d\20*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending |
        Select-Object -First 3 | ForEach-Object { Copy-Item $_.FullName "$Out\logs\$tag-$($_.Name)" }
}

Section 'One more step, by hand'
Say 'Make a dump of the simulator so its threads can be read:'
Say '  Task Manager > Details > right-click WinVetSim.exe > Create memory dump file'
Say '  (older Windows: "Create dump file"). Copy the .DMP it names into this folder.'
Say ''
Say "Saved to: $Out"
Start-Process explorer.exe $Out
