<#
.SYNOPSIS
  Menjalankan NigmaSim dalam mode jaringan lokal (LAN), sehingga bisa dibuka
  dari perangkat lain di WiFi yang sama - misalnya HP untuk melihat tampilan
  mobile, atau laptop kedua untuk presentasi.

.DESCRIPTION
  Script ini membوتak:
    1. Backend API        -> 0.0.0.0:8000
    2. Capture Worker     -> 127.0.0.1:8010 (TETAP LOKAL, tidak dibuka ke LAN)
    3. Frontend (Vite)    -> 0.0.0.0:5173 + proxy /api ke backend

  Capture Worker sengaja TIDAK dibuka ke jaringan: dia yang mengendalikan
  browser dan memegang sesi login aplikasi sumber.

.PARAMETER Port
  Port frontend (default 5173).

.EXAMPLE
  .\scripts\dev-lan.ps1
#>
param(
    [int]$Port = 5173
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

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

$lanIp = Get-LanIp

Write-Host ''
Write-Host '  NigmaSim - mode jaringan lokal (LAN)' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------' -ForegroundColor DarkGray
Write-Host "  Dari perangkat lain, buka:  http://${lanIp}:${Port}" -ForegroundColor Green
Write-Host ''
Write-Host '  Pastikan firewall mengizinkan Node.js & Python pada jaringan privat.' -ForegroundColor Yellow
Write-Host ''

# --- Backend -----------------------------------------------------------------
# Tetap LOKAL saja. Frontend (Vite) yang akan menjadi proxy /api ke backend,
# jadi tidak perlu membuka port 8000 ke jaringan.
$backend = Join-Path $root 'backend'
$backendPy = Join-Path $backend '.venv\Scripts\python.exe'
Start-Process -FilePath $backendPy `
    -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000' `
    -WorkingDirectory $backend `
    -WindowStyle Minimized

# --- Capture Worker (lokal saja) --------------------------------------------
$worker = Join-Path $root 'capture-worker\src'
$workerPy = Join-Path $root 'capture-worker\.venv\Scripts\python.exe'
Start-Process -FilePath $workerPy `
    -ArgumentList '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8010' `
    -WorkingDirectory $worker `
    -WindowStyle Minimized

Start-Sleep -Seconds 3

# --- Frontend ----------------------------------------------------------------
$frontend = Join-Path $root 'frontend'
Set-Location $frontend
npm run dev -- --host 0.0.0.0 --port $Port
