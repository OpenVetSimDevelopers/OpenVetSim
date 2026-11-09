# ============================================================================
# download-php.ps1
#
# Downloads a PHP 8.x NTS CLI for Windows and places it in
# OpenVetSim\build\bin\PHP8.0\ where the simulation engine looks for PHP
# (see WebSrv.cpp findPhpPath()).
#
# Downloads from the official PHP for Windows release server:
#   https://windows.php.net/downloads/releases/
#
# The ZIP contains php.exe plus its required DLLs. The electron-builder
# config bundles the entire PHP8.0\ directory, so end users get everything
# they need inside the installer with no separate runtime to install.
#
# PHP version notes:
#   PHP 8.3.x  →  php-8.3.x-nts-Win32-vs16-x64.zip  (VS2019 runtime)
#   PHP 8.4.x  →  php-8.4.x-nts-Win32-vs17-x64.zip  (VS2022 runtime)
#
# Minimum versions: 8.4.27 / 8.3.36 (21 Oct 2026), which fix CVE-2026-109618
# and CVE-2026-109619, two critical remote-code-execution flaws. Nothing older
# is ever installed - not from the server, and not from -PhpZipPath. Raise
# $MinPatch below when a later security release comes out.
#
# If the download server is unreachable, supply a pre-downloaded zip:
#   .\scripts\download-php.ps1 -PhpZipPath "C:\Downloads\php-8.3.x-nts-Win32-vs16-x64.zip"
#
# Usage (from the repo root in PowerShell):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\scripts\download-php.ps1
#
# Run this once before:
#   npm run dist:win   (packaging a distributable installer)
#   npm start          (development mode, if PHP is not installed system-wide)
# ============================================================================

param(
    # Optional: path to a pre-downloaded PHP NTS x64 zip
    [string] $PhpZipPath = ''
)

$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = Split-Path -Parent $ScriptDir
$Dest       = Join-Path $RepoRoot 'OpenVetSim\build\bin\PHP8.0'

$BaseUrl = 'https://windows.php.net/downloads/releases'

# Branches to use, in order of preference, with the Visual C++ runtime each is
# built with and the oldest patch release that is safe to bundle. 8.3 first:
# it is what the Mac build bundles (download-php.sh), so both platforms run
# the PHP the web pages are tested on; it has security fixes until the end of
# 2027. 8.4 is the fallback.
$Branches = @(
    @{ Minor = '8.3'; Vs = 'vs16'; MinPatch = 36 },
    @{ Minor = '8.4'; Vs = 'vs17'; MinPatch = 27 }
)

function Get-MinVersion([string] $minor) {
    foreach ($b in $Branches) { if ($b.Minor -eq $minor) { return [version]("$minor." + $b.MinPatch) } }
    return $null
}

# Unpack a zip to a temporary folder, check the php.exe in it is a fixed
# release, and only then replace $Dest. A bad or old zip never touches the
# PHP already there.
function Install-PhpZip([string] $zip, [string] $expectedSha256) {
    if ($expectedSha256) {
        $actual = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash
        if ($actual -ne $expectedSha256.ToUpper()) {
            throw "SHA-256 of $zip does not match the server's checksum - download corrupt or tampered with. Nothing was changed."
        }
        Write-Host "  SHA-256 verified."
    }

    $stage = Join-Path ([System.IO.Path]::GetTempPath()) ("ovs-php-" + [guid]::NewGuid())
    Expand-Archive -Path $zip -DestinationPath $stage -Force
    try {
        $exe = Join-Path $stage 'php.exe'
        if (-not (Test-Path $exe)) { throw "No php.exe at the top of $zip. Nothing was changed." }

        $ver = (& $exe -r 'echo PHP_VERSION;').Trim()
        if ($LASTEXITCODE -ne 0 -or -not $ver) {
            throw "php.exe from $zip would not run (a missing Visual C++ runtime?). Nothing was changed."
        }
        $parsed = [version]($ver -replace '[^0-9.].*$', '')
        $minor  = "$($parsed.Major).$($parsed.Minor)"
        $min    = Get-MinVersion $minor
        if (-not $min) {
            throw "PHP $ver is not a supported branch (8.3 or 8.4). Nothing was changed."
        }
        if ($parsed -lt $min) {
            throw "PHP $ver is older than $min, which fixes critical security flaws. Refusing to install it. Nothing was changed."
        }

        # Replace the old PHP entirely, so no DLL or extension from an older
        # release is left behind next to the new php.exe.
        # (copied, not moved: the temp folder may be on another drive)
        if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
        New-Item -ItemType Directory -Force -Path $Dest | Out-Null
        Copy-Item -Path (Join-Path $stage '*') -Destination $Dest -Recurse -Force
        Write-Host ""
        Write-Host "Done. PHP $ver is ready at:"
        Write-Host "  $Dest\php.exe"
    } finally {
        if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    }
}

# -- Manual bypass: user supplied a pre-downloaded zip -------------------------
if ($PhpZipPath -ne '') {
    if (-not (Test-Path $PhpZipPath)) {
        Write-Error "Supplied zip not found: $PhpZipPath"
        exit 1
    }
    Write-Host "Using pre-downloaded PHP zip: $PhpZipPath"
    Install-PhpZip $PhpZipPath ''
    exit 0
}

# -- Find the newest fixed release ---------------------------------------------
$FoundUrl = $null; $FoundVersion = $null; $FoundAsset = $null; $FoundSha = $null

# 1. The server's own list of current releases (gives the checksum too).
#    Builds are listed per runtime, e.g. "nts-vs17-x64", each with a zip path.
Write-Host "Reading the current release list from windows.php.net ..."
try {
    $rel = Invoke-RestMethod -Uri "$BaseUrl/releases.json" -UseBasicParsing -TimeoutSec 20
    foreach ($b in $Branches) {
        $entry = $rel.($b.Minor)
        if (-not $entry -or -not $entry.version) { continue }
        $v = [version]$entry.version
        if ($v -lt (Get-MinVersion $b.Minor)) {
            Write-Host "  PHP $($entry.version) is listed for $($b.Minor), but is older than the fixed release - skipping."
            continue
        }
        $build = $entry.PSObject.Properties |
                 Where-Object { $_.Name -like 'nts-*-x64' -and $_.Value.zip.path } |
                 Select-Object -First 1
        if ($build) {
            $FoundAsset   = $build.Value.zip.path
            $FoundUrl     = "$BaseUrl/$FoundAsset"
            $FoundVersion = $entry.version
            $FoundSha     = $build.Value.zip.sha256
            break
        }
    }
} catch {
    Write-Host "  Could not read releases.json ($($_.Exception.Message)); probing file names instead."
}

# 2. Fallback: probe file names, newest patch first, never below the minimum.
#    curl.exe (built into Windows 10+) reports the HTTP status, so "not found"
#    (404) can be told apart from "no network" (000).
if (-not $FoundUrl) {
    :search foreach ($b in $Branches) {
        Write-Host "  Trying PHP $($b.Minor).x (nts-Win32-$($b.Vs)-x64) ..."
        foreach ($patch in (60..$b.MinPatch)) {
            $version = "$($b.Minor).$patch"
            $asset   = "php-$version-nts-Win32-$($b.Vs)-x64.zip"
            $code = (& curl.exe --head --silent --output NUL `
                     --write-out "%{http_code}" --location `
                     --connect-timeout 10 "$BaseUrl/$asset" 2>$null).Trim()
            if ($code -eq '200') {
                $FoundUrl = "$BaseUrl/$asset"; $FoundVersion = $version; $FoundAsset = $asset
                break search
            }
        }
    }
}

if (-not $FoundUrl) {
    Write-Error (
        "Could not find PHP 8.3.36 / 8.4.27 or newer (NTS x64) on windows.php.net.`n`n" +
        "-- Quick diagnostic --`n" +
        "  curl.exe --head --verbose $BaseUrl/releases.json`n`n" +
        "-- Manual fallback --`n" +
        "1. Open https://windows.php.net/download/ in your browser`n" +
        "2. Download the PHP 8.3 (or 8.4) 'x64 Non Thread Safe' ZIP`n" +
        "   (8.3.36 / 8.4.27 or newer)`n" +
        "3. Re-run with:`n" +
        "     .\scripts\download-php.ps1 -PhpZipPath 'C:\path\to\file.zip'`n`n" +
        "Do not use an older PHP: earlier releases have critical security flaws.`n" +
        "The PHP already in $Dest has not been changed."
    )
    exit 1
}

Write-Host ""
Write-Host "Downloading PHP $FoundVersion NTS x64 ..."
Write-Host "  Source : $FoundUrl"
Write-Host "  Dest   : $Dest"

$TmpFile = Join-Path ([System.IO.Path]::GetTempPath()) $FoundAsset
Invoke-WebRequest -Uri $FoundUrl -OutFile $TmpFile -UseBasicParsing
try {
    Install-PhpZip $TmpFile $FoundSha
} finally {
    Remove-Item $TmpFile -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Verify with:"
Write-Host "  & '$Dest\php.exe' --version"
