# Qicaizhice optional verified portable runtime bootstrap. Windows PowerShell 5.1+ / Windows x64.
# An execution failure NEVER triggers deletion or overwriting of existing runtimes.
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtime = Join-Path $root '.runtime'
$nodeDest = Join-Path $runtime 'node\node.exe'
$pythonDest = Join-Path $runtime 'python\python.exe'
$pythonPth = Join-Path $runtime 'python\python314._pth'
$nodeHash = '247e9693d316da9857e44990e5e11709f596f18112251b8026ec6eed80bdf38a'
$pythonZipHash = '90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159'
$nodeUrl = 'https://nodejs.org/dist/v22.23.5/win-x64/node.exe'
$pythonUrl = 'https://www.python.org/ftp/python/3.14.10/python-3.14.10-embed-amd64.zip'
$nodeVersion = 'v22.23.5'
$pthText = "python314.zip`r`n.`r`n..\..\`r`n# import site`r`n"

function Fail([string]$message) { throw $message }
function CheckHash([string]$path,[string]$sha) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $false }
    return ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -eq $sha)
}
function RunProbe([string]$exe,[string]$args,[string]$label) {
    Write-Host "[CHECK] $label (max 30 seconds)..."
    $p = New-Object System.Diagnostics.Process
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exe
    $psi.Arguments = $args
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false
    $p.StartInfo = $psi
    try {
        if (-not $p.Start()) { Write-Host "[ERROR] $label could not start."; return $false }
        if (-not $p.WaitForExit(30000)) {
            $pidToStop = $p.Id
            Write-Host "[ERROR] $label timed out (PID $pidToStop). Stopping ONLY this probe process..."
            try { $p.Kill() } catch { Write-Host "[ERROR] Cannot terminate probe PID $pidToStop : $($_.Exception.Message)" }
            $stopped = $p.WaitForExit(10000)
            if (-not $stopped) { Write-Host "[ERROR] Probe PID $pidToStop is still running. Close it before retrying." }
            else { Write-Host '[INFO] Timed-out probe has exited.' }
            return $false
        }
        if ($p.ExitCode -ne 0) { Write-Host "[ERROR] $label exit code: $($p.ExitCode)"; return $false }
        Write-Host "[OK] $label"
        return $true
    } catch {
        Write-Host "[ERROR] $label failed: $($_.Exception.Message)"
        return $false
    } finally {
        try { $p.Dispose() } catch {}
    }
}
function CheckRuntime([string]$nodeFile,[string]$pythonFile,[string]$pthFile) {
    if (-not (CheckHash $nodeFile $nodeHash)) { Write-Host '[INFO] Node file missing or SHA-256 mismatch.'; return $false }
    if (-not (Test-Path -LiteralPath $pythonFile -PathType Leaf)) { Write-Host '[INFO] Python executable missing.'; return $false }
    if (-not (Test-Path -LiteralPath $pthFile -PathType Leaf)) { Write-Host '[INFO] Python isolation file missing.'; return $false }
    $pthValue = Get-Content -LiteralPath $pthFile -Raw
    if (-not $pthValue.Contains('..\..\')) { Write-Host '[ERROR] Python app import path missing.'; return $false }
    $nodeArg = "-e `"process.exit(process.version === '$nodeVersion' ? 0 : 7)`""
    if (-not (RunProbe $nodeFile $nodeArg 'Node version check')) { return $false }
    if (-not (RunProbe $pythonFile '-c "import sys;sys.exit(0 if sys.version_info[:3] == (3,14,10) else 7)"' 'Python version check')) { return $false }
    if (-not (RunProbe $nodeFile '-e "require(''node:sqlite'')"' 'Node SQLite module check')) { return $false }
    if (-not (RunProbe $pythonFile '-c "import sqlite3,json,zipfile,runpy"' 'Python standard library check')) { return $false }
    return $true
}
function DownloadVerified([string]$url,[string]$path,[string]$sha,[string]$label) {
    if (CheckHash $path $sha) { Write-Host "[OK] $label cached and verified."; return }
    $part = "$path.partial.$PID"
    try {
        Write-Host "[INFO] Downloading $label from official source..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -UseBasicParsing -OutFile $part -TimeoutSec 240
        if (-not (CheckHash $part $sha)) { Fail "SHA-256 mismatch: $label. Rejected." }
        Move-Item -LiteralPath $part -Destination $path -Force
    } finally { if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Force } }
}
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Fail 'Windows only.' }
if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { Fail 'Windows x64 only.' }

Write-Host '[CHECK] Looking for an existing portable runtime...'
$nodeFolder = Join-Path $runtime 'node'
$pythonFolder = Join-Path $runtime 'python'
if ((Test-Path -LiteralPath $nodeFolder) -or (Test-Path -LiteralPath $pythonFolder)) {
    if (CheckRuntime $nodeDest $pythonDest $pythonPth) {
        Write-Host '[OK] Portable runtime is healthy. No download or replacement needed.'
        exit 0
    }
    # Critical: do not delete/overwrite a verified exe that may still be running.
    Fail 'Existing portable runtime did not pass checks. STOPPING SAFELY; no runtime files will be removed or reinstalled. Try startup compatibility mode or inspect Windows Security Protection History.'
}
if ($CheckOnly) { Write-Host '[INFO] No portable runtime yet.'; exit 3 }

$baseLocal = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE 'AppData\Local' }
$cache = Join-Path $baseLocal 'Qicaizhice\RuntimeCache'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$nodeCache = Join-Path $cache 'node-v22.23.5-win-x64.exe'
$pythonCache = Join-Path $cache 'python-3.14.10-embed-amd64.zip'
DownloadVerified $nodeUrl $nodeCache $nodeHash 'Node.js 22.23.5 x64'
DownloadVerified $pythonUrl $pythonCache $pythonZipHash 'Python 3.14.10 embeddable x64'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$stage = Join-Path $runtime ('bootstrap_stage_' + $PID)
if (Test-Path -LiteralPath $stage) { Fail 'A same-PID staging directory exists; stop the other installer and retry.' }
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    $stageNode = Join-Path $stage 'node'
    $stagePython = Join-Path $stage 'python'
    New-Item -ItemType Directory -Path $stageNode | Out-Null
    New-Item -ItemType Directory -Path $stagePython | Out-Null
    Write-Host '[CHECK] Preparing new files in an isolated staging directory...'
    Copy-Item -LiteralPath $nodeCache -Destination (Join-Path $stageNode 'node.exe')
    Expand-Archive -LiteralPath $pythonCache -DestinationPath $stagePython
    if (-not (Test-Path -LiteralPath (Join-Path $stagePython 'python314.zip'))) { Fail 'Embedded Python standard library missing.' }
    [IO.File]::WriteAllText((Join-Path $stagePython 'python314._pth'),$pthText,[Text.Encoding]::ASCII)
    Write-Host '[CHECK] Probing staged runtimes BEFORE activation...'
    if (-not (CheckRuntime (Join-Path $stageNode 'node.exe') (Join-Path $stagePython 'python.exe') (Join-Path $stagePython 'python314._pth'))) {
        Fail 'Staged runtime execution failed. No installed runtime has been deleted or replaced.'
    }
    if ((Test-Path -LiteralPath $nodeFolder) -or (Test-Path -LiteralPath $pythonFolder)) { Fail 'Another installation appeared. Refusing to overwrite.' }
    Move-Item -LiteralPath $stageNode -Destination $nodeFolder
    Move-Item -LiteralPath $stagePython -Destination $pythonFolder
    Write-Host '[OK] Portable runtimes installed and verified.'
    exit 0
} finally {
    if (Test-Path -LiteralPath $stage) {
        try { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction Stop }
        catch { Write-Host "[WARN] Temporary staging files still in use: $stage" }
    }
}
