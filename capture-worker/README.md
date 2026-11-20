# Capture Worker — NigmaSim

Worker adalah **proses terpisah** dari backend API. Tanggung jawabnya satu saja:
mengendalikan browser Chromium untuk menangkap screenshot + metadata.

## Kenapa harus terpisah

| Alasan | Penjelasan |
|---|---|
| Isolasi | Backend tidak pernah menyentuh browser. Kalau worker crash, API tetap hidup. |
| Keamanan | Worker hanya listen di `127.0.0.1`, diakses pakai token internal. |
| Login manual | Operator melihat dan login sendiri di jendela browser. Worker tidak punya kode untuk mengisi form login. |
| Batas navigasi | Worker hanya boleh membuka host yang ada di allowlist sesi. |

## Cara menjalankan (disarankan: dari root repo, sesi interaktif)

Worker **harus berjalan di sesi interaktif desktop Anda** (SessionId != 0) supaya
jendela Chromium muncul di layar. Jalankan salah satu skrip di root repo:

```powershell
cd C:\Users\Lenovo\nigmasim
.\start-capture-worker.bat                                  # double-click juga bisa
# atau
powershell -ExecutionPolicy Bypass -File .\start-capture-worker.ps1
```

Keduanya menjalankan worker dengan venv `capture-worker\.venv`, `host=0.0.0.0`,
`port=8010`, `headless=false`, dari folder `src/`. Saat startup, worker mencetak
`Worker berjalan di sesi interaktif: ya/tidak (SessionId=...)` — kalau **tidak**,
jendela browser tidak akan terlihat; jalankan ulang lewat skrip di atas, jangan dari
shell agen. Verifikasi SessionId worker & `chrome.exe` lewat `GET /process`.

## Cara menjalankan manual

```powershell
cd C:\Users\Lenovo\nigmasim\capture-worker

# sekali saja
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]" 2>$null
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -q 2>$null
.\.venv\Scripts\python.exe -m playwright install chromium

# jalankan (dari folder src/ supaya import modul datar bekerja)
cd src
..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8010
```

Cek: `Invoke-RestMethod http://127.0.0.1:8010/health`

> **Jalankan dari folder `src/`.** Modul diimpor datar (`import browser`), dan file `.env`
> dibaca dari `../.env` lalu `../../.env` — sehingga konfigurasi root repo tetap terpakai.

## API internal

Semua endpoint butuh header `X-Worker-Token` yang nilainya sama dengan
`CAPTURE_WORKER_TOKEN` di `.env`.

| Method | Path | Fungsi |
|---|---|---|
| GET | `/health` | Status worker |
| POST | `/session/start` | Buka browser + navigasi ke URL (host harus di allowlist) |
| POST | `/session/pause` | Jeda (capture ditolak) |
| POST | `/session/resume` | Lanjutkan |
| POST | `/session/stop` | Tutup browser |
| GET | `/session/state` | URL/judul aktif, jumlah interaksi |
| POST | `/session/capture` | Ambil screenshot + metadata |

**Tidak ada endpoint untuk mengisi form login atau menyimpan kredensial.** Itu disengaja.

## Yang direkam

- URL, judul, ukuran viewport, waktu, hash SHA-256 file
- Elemen interaktif: tipe + label (TIDAK ada HTML mentah yang disimpan)
- Interaksi: klik / input / select — **nilai input tidak pernah direkam**

## Masking

Pemb blacks-out dilakukan di backend saat file disajikan (`GET /screens/{id}/screenshot`).
File asli tetap privat di `storage/captures/`.

## Peringatan

- `headless=false` di development supaya operator bisa melihat dan login.
- Jangan pernah menjalankan worker dengan `CAPTURE_WORKER_TOKEN` default di server.
- Worker hanya boleh menangkap aplikasi yang punya izin tertulis.
