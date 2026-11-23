<#
.SYNOPSIS
  Menyalakan seluruh NigmaSim (backend + capture worker + web + simulation
  runtime) sebagai proses terpisah yang tidak ikut mati saat jendela
  PowerShell ditutup.

.DESCRIPTION
  Semua service dijalankan lewat Start-Process sehingga!
    - tidak terikat pada terminal yangopened
    - bisa dibuka dari perangkat lain di WiFi yang sama
    - log ditulis ke storage/logs/ agar mudah dicek

  -Backend API         127.0.0.1:8000   (tidak dibuka ke jaringan)
  -Capture Worker      127.0.0.1:8010   (WAJIB lokal - memegang sesi login)
  -Web Admin           0.0.0.0:5173     (dibuka ke LAN)
  -Simulation Runtime  0.0.0.0:5180     (lobby simulasi hidup, dibuka ke LAN)

.PARAMETER Stop
  Hentikan semua service NigmaSim lalu keluar.

.PARAMETER WithSample
  Jalankan juga aplikasi contoh di http://127.0.0.1:8099

.EXAMPLE
  .\scripts\dev-lan.ps1
  .\scripts\dev-lan.ps1 -WithSample
  .\scripts\dev-lan.ps1 -Stop
#>
param(
    [switch]$Stop,
    [switch]$WithSample,
    [switch]$KeepAlive
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root 'storage\logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Get-NigmaSimProcesses {
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
        Where-Object { $_.CommandLine -match 'uvicorn\s+(app\.main:app|main:app)' -or $_.CommandLine -match 'http\.server\s+8099' }
}

function Get-ViteProcesses {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'vite' }
}

function Stop-NigmaSim {
    $targets = @((Get-NigmaSimProcesses), (Get-ViteProcesses)) | Where-Object { $_ }
    foreach ($p in $targets) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Host 'Semua service NigmaSim dihentikan.' -ForegroundColor Yellow
}

if ($Stop) { Stop-NigmaSim; exit 0 }

# Hentikan instance lama supaya tidak konflik port
Stop-NigmaSim
Start-Sleep -Seconds 1

function Get-LanIp {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown'
        } |
        Sort-Object InterfaceMetric |
        Select-Object -First 1
    if ($ip) { return $ip.IPAddress }
    return 'localhost'
}

$backendPy = Join-Path $root 'backend\.venv\Scripts\python.exe'
$workerPy = Join-Path $root 'capture-worker\.venv\Scripts\python.exe'

Write-Host ''
Write-Host '  Menyalakan NigmaSim...' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------'

# 1. Backend API (lokal saja)
Start-Process -FilePath $backendPy `
    -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--log-level', 'warning' `
    -WorkingDirectory (Join-Path $root 'backend') `
    -RedirectStandardOutput (Join-Path $logs 'backend.out.log') `
    -RedirectStandardError (Join-Path $logs 'backend.err.log') `
    -WindowStyle Hidden
Write-Host '  [1/4] Backend API      -> 127.0.0.1:8000' -ForegroundColor Gray

# 2. Capture Worker (listen di 0.0.0.0 agar bisa diakses via LAN IP)
# Catatan: JANGAN gunakan -WindowStyle Hidden agar Chromium headed dapat tampil di layar operator
Start-Process -FilePath $workerPy `
    -ArgumentList '-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8010', '--log-level', 'warning' `
    -WorkingDirectory (Join-Path $root 'capture-worker\src') `
    -RedirectStandardOutput (Join-Path $logs 'worker.out.log') `
    -RedirectStandardError (Join-Path $logs 'worker.err.log')
Write-Host '  [2/4] Capture Worker   -> 127.0.0.1:8010' -ForegroundColor Gray

# 3. Web Admin (dibuka ke jaringan)
# Jalankan node + bin vite langsung (npm.cmd via Start-Process sering gagal diam-diam).
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$viteBin = Join-Path $root 'frontend\node_modules\vite\bin\vite.js'
if ($node -and (Test-Path $viteBin)) {
    Start-Process -FilePath $node `
        -ArgumentList $viteBin, '--host', '0.0.0.0', '--port', '5173' `
        -WorkingDirectory (Join-Path $root 'frontend') `
        -RedirectStandardOutput (Join-Path $logs 'web.out.log') `
        -RedirectStandardError (Join-Path $logs 'web.err.log') `
        -WindowStyle Hidden
    Write-Host '  [3/4] Web Admin        -> 0.0.0.0:5173' -ForegroundColor Gray
} else {
    $npm = (Get-Command npm -ErrorAction SilentlyContinue).Source
    Start-Process -FilePath $npm `
        -ArgumentList 'run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173' `
        -WorkingDirectory (Join-Path $root 'frontend') `
        -RedirectStandardOutput (Join-Path $logs 'web.out.log') `
        -RedirectStandardError (Join-Path $logs 'web.err.log') `
        -WindowStyle Hidden
    Write-Host '  [3/4] Web Admin        -> 0.0.0.0:5173 (npm)' -ForegroundColor Gray
}

# 4. Simulation Runtime (lobby + simulasi hidup, origin sendiri)
# Setara dengan `npm run dev` di simulation-runtime. Node + bin vite dipakai
# langsung agar tidak bergantung pada npm.cmd via Start-Process.
$runtimeDir = Join-Path $root 'simulation-runtime'
$runtimeViteBin = Join-Path $runtimeDir 'node_modules\vite\bin\vite.js'
if ($node -and (Test-Path $runtimeViteBin)) {
    Start-Process -FilePath $node `
        -ArgumentList $runtimeViteBin, '--host', '0.0.0.0', '--port', '5180' `
        -WorkingDirectory $runtimeDir `
        -RedirectStandardOutput (Join-Path $logs 'runtime.out.log') `
        -RedirectStandardError (Join-Path $logs 'runtime.err.log') `
        -WindowStyle Hidden
    Write-Host '  [4/4] Simulation Runtime -> 0.0.0.0:5180' -ForegroundColor Gray
} else {
    $npm = (Get-Command npm -ErrorAction SilentlyContinue).Source
    Start-Process -FilePath $npm `
        -ArgumentList 'run', 'dev', '--', '--host', '0.0.0.0', '--port', '5180' `
        -WorkingDirectory $runtimeDir `
        -RedirectStandardOutput (Join-Path $logs 'runtime.out.log') `
        -RedirectStandardError (Join-Path $logs 'runtime.err.log') `
        -WindowStyle Hidden
    Write-Host '  [4/4] Simulation Runtime -> 0.0.0.0:5180 (npm)' -ForegroundColor Gray
}

# 5. (opsional) aplikasi contoh
if ($WithSample) {
    Start-Process -FilePath $workerPy `
        -ArgumentList '-m', 'http.server', '8099', '--bind', '127.0.0.1' `
        -WorkingDirectory (Join-Path $root 'samples\sample-app') `
        -RedirectStandardOutput (Join-Path $logs 'sample.out.log') `
        -RedirectStandardError (Join-Path $logs 'sample.err.log') `
        -WindowStyle Hidden
    Write-Host '  [+]  Aplikasi contoh  -> 127.0.0.1:8099' -ForegroundColor Gray
}

# Tunggu sampai siap
$checks = @(
    @{ name = 'Backend API'; url = 'http://127.0.0.1:8000/api/v1/health' },
    @{ name = 'Capture Worker'; url = 'http://127.0.0.1:8010/health' },
    @{ name = 'Web Admin'; url = 'http://127.0.0.1:5173' },
    @{ name = 'Simulation Runtime'; url = 'http://127.0.0.1:5180' }
)
$ready = $true
foreach ($check in $checks) {
    $ok = $false
    for ($i = 0; $i -lt 20; $i++) {
        try {
            Invoke-WebRequest -Uri $check.url -UseBasicParsing -TimeoutSec 3 | Out-Null
            $ok = $true
            break
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if ($ok) {
        Write-Host ("  OK   {0}" -f $check.name) -ForegroundColor Green
    } else {
        Write-Host ("  GAGAL {0} - cek {1}" -f $check.name, $logs) -ForegroundColor Red
        $ready = $false
    }
}

$lanIp = Get-LanIp
Write-Host ''
Write-Host '  ------------------------------------------------' -ForegroundColor DarkGray
Write-Host "  Dari komputer ini : http://localhost:5173" -ForegroundColor Green
Write-Host "  Dari perangkat lain (WiFi sama): http://${lanIp}:5173" -ForegroundColor Green
Write-Host "  Simulation Runtime: http://localhost:5180" -ForegroundColor Green
Write-Host "                      http://${lanIp}:5180" -ForegroundColor Green
Write-Host ''
Write-Host '  Login  : admin@nigmasim.com / Admin#12345' -ForegroundColor Yellow
Write-Host "  Log    : $logs" -ForegroundColor DarkGray
Write-Host '  Stop   : .\scripts\dev-lan.ps1 -Stop' -ForegroundColor DarkGray
Write-Host ''

if (-not $ready) { exit 1 }

if ($KeepAlive) {
    Write-Host '  Service tetap aktif (KeepAlive mode)...' -ForegroundColor Cyan
    try {
        while ($true) { Start-Sleep -Seconds 60 }
    } finally {
        Stop-NigmaSim
    }
}
