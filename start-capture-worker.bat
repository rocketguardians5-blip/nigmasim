@echo off
setlocal EnableExtensions
title NigmaSim Capture Worker (sesi interaktif)

REM ============================================================
REM  NigmaSim Capture Worker - jalankan dari DESKTOP interaktif.
REM  Double-click file ini, ATAU jalankan dari terminal Anda:
REM      start-capture-worker.bat
REM  Worker HARUS berjalan di sesi interaktif (SessionId != 0)
REM  supaya jendela Chromium muncul di layar Anda. JANGAN
REM  menjalankannya dari shell agen / proses latar belakang.
REM ============================================================

cd /d "%~dp0capture-worker\src" || (
  echo [ERROR] Gagal masuk ke folder capture-worker\src
  pause
  exit /b 1
)

if not exist "..\.venv\Scripts\python.exe" (
  echo [ERROR] venv tidak ditemukan di capture-worker\.venv
  echo Buat dulu dari root repo:
  echo   cd capture-worker
  echo   python -m venv .venv
  echo   .\.venv\Scripts\python.exe -m pip install playwright==1.49.1 fastapi==0.115.6 "uvicorn[standard]==0.34.0" pydantic==2.10.4 pydantic-settings==2.7.0 pillow==11.0.0 httpx==0.28.1
  echo   .\.venv\Scripts\python.exe -m playwright install chromium
  pause
  exit /b 1
)

REM Paksa konfigurasi: headless=false supaya jendela Chromium terlihat.
set "HEADLESS=false"

echo ============================================
echo  NigmaSim Capture Worker
echo  Host: 0.0.0.0   Port: 8010   Headless: false
echo  Jalankan dari folder: %CD%
echo ============================================
echo.

"..\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8010

echo.
echo Worker berhenti. Tekan tombol apa saja untuk menutup jendela ini.
pause
