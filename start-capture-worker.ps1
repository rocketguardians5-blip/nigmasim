#Requires -Version 5.1
<#
.SYNOPSIS
    Menjalankan NigmaSim Capture Worker dari sesi interaktif desktop Anda.

.DESCRIPTION
    Jalankan dari terminal Anda sendiri (BUKAN dari shell agen):

        powershell -ExecutionPolicy Bypass -File .\start-capture-worker.ps1

    atau klik kanan file ini -> "Run with PowerShell".

    Worker HARUS berjalan di sesi interaktif (SessionId != 0) supaya jendela
    Chromium yang dibuka Playwright muncul di layar Anda. Kalau worker
    dijalankan dari proses latar belakang, jendela browser akan terbuka di
    sesi Windows lain dan tidak terlihat.

    Host: 0.0.0.0   Port: 8010   Headless: false
#>
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerDir = Join-Path $root 'capture-worker'
$srcDir = Join-Path $workerDir 'src'
$python = Join-Path $workerDir '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Error @"
venv tidak ditemukan: $python
Buat dulu dari root repo:
  cd capture-worker
  python -m venv .venv
  .\.venv\Scripts\python.exe -m pip install playwright==1.49.1 fastapi==0.115.6 'uvicorn[standard]==0.34.0' pydantic==2.10.4 pydantic-settings==2.7.0 pillow==11.0.0 httpx==0.28.1
  .\.venv\Scripts\python.exe -m playwright install chromium
"@
    exit 1
}

# Paksa konfigurasi: headless=false supaya jendela Chromium terlihat.
$env:HEADLESS = 'false'

# WAJIB dari folder src/ agar import modul datar & .env root repo ketemu.
Set-Location $srcDir

Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' NigmaSim Capture Worker (sesi interaktif)' -ForegroundColor Cyan
Write-Host ' Host: 0.0.0.0   Port: 8010   Headless: false' -ForegroundColor Cyan
Write-Host " Folder: $srcDir" -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

& $python -m uvicorn main:app --host 0.0.0.0 --port 8010
