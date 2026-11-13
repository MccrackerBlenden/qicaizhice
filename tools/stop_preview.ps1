param([switch]$IncludeLegacy)
$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stopped = 0
$stale = 0
Write-Host 'Qicaizhice preview: targeted server shutdown.'

# Stop current version only when its private on-disk instance ID and live server identity agree.
foreach ($f in @(Get-ChildItem -LiteralPath $root -Filter '.qz_session_*.json' -File -ErrorAction SilentlyContinue)) {
    try {
        $s = (Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json)
        $p = [int]$s.port
        if ($s.app -ne 'qicaizhice-preview' -or $p -lt 8791 -or $p -gt 8800 -or -not $s.instanceId) {
            Write-Host "Skipping unrecognized session: $($f.Name)"
            continue
        }
        $uri = "http://127.0.0.1:$p/__qz/health"
        $live = Invoke-RestMethod -Uri $uri -TimeoutSec 2 -ErrorAction Stop
        if ($live.app -ne 'qicaizhice-preview' -or $live.instanceId -ne $s.instanceId -or [int]$live.pid -ne [int]$s.pid) {
            Write-Host "Skipping port $p (session does not match)."
            continue
        }
        $headers = @{ 'X-QZ-Stop-Token' = [string]$s.token }
        $r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$p/__qz/stop" -Headers $headers -TimeoutSec 3 -ErrorAction Stop
        if ($r.ok) {
            Write-Host "Stop requested for this release on port $p."
            $stopped++
            # Wait briefly for the acknowledged server to exit, allowing its launcher
            # to return and remove the lock on the extraction directory.
            for ($attempt=0; $attempt -lt 30; $attempt++) {
                Start-Sleep -Milliseconds 150
                if (-not (Get-Process -Id ([int]$s.pid) -ErrorAction SilentlyContinue)) { break }
            }
        }
    } catch {
        # This session may be stale from a forced close. Do not kill unrelated PID.
        Write-Host "Old/stale session or inaccessible server: $($f.Name)"
        try {Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop;$stale++}catch{}
    }
}

if ($IncludeLegacy) {
    Write-Host 'Searching ports 8791-8800 for older Qicaizhice preview servers...'
    for ($port=8791;$port -le 8800;$port++) {
        try {
            $tcp = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop |
                Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -First 1
            if ($null -eq $tcp) { continue }
            $targetPid = [int]$tcp.OwningProcess
            $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid" -ErrorAction Stop
            if ($null -eq $processInfo) { continue }
            $exeName=[string]$processInfo.Name
            $commandLine=[string]$processInfo.CommandLine
            if ($exeName -notmatch '^(node|python|pythonw)(\.exe)?$' -or $commandLine -notmatch '(server\.mjs|run_preview\.py)') {continue}

            # Verify app identity via the locally served source, not just the port or executable name.
            $recognized=$false
            try {
                $h = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2 -ErrorAction Stop
                if ($h.ok -eq $true -and ([string]$h.version) -match '^v0\.(1\.1|2)(\D|$)') {$recognized=$true}
            }catch{}
            if (-not $recognized) {
                try {
                    $source = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/server.mjs" -TimeoutSec 2 -ErrorAction Stop).Content
                    if ([string]$source -match '企财智策内部体验|企财智策内部快速体验') {$recognized=$true}
                }catch{}
            }
            if (-not $recognized) {
                try {
                    $source = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/run_preview.py" -TimeoutSec 2 -ErrorAction Stop).Content
                    if ([string]$source -match '企财智策快速体验版|本地只读体验服务器') {$recognized=$true}
                }catch{}
            }
            if (-not $recognized) {continue}
            $confirmed = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop |
                Where-Object { $_.LocalAddress -eq '127.0.0.1' -and [int]$_.OwningProcess -eq $targetPid } | Select-Object -First 1
            if ($null -eq $confirmed) {continue}
            Write-Host "Stopping verified legacy Qicaizhice server, port $port, PID $targetPid"
            Stop-Process -Id $targetPid -Force -ErrorAction Stop
            $stopped++
        } catch {
            # Skip processes whose identity cannot be verified. Never kill all node.exe processes.
        }
    }
}
Write-Host "Completed. Stop requests: $stopped; stale session files cleared: $stale"
Write-Host 'For legacy releases, also close their old paused CMD windows. Their BAT files may stay locked while the console is open.'
