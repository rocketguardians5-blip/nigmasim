# Instalasi & Menjalankan NigmaSim (Development)

Dokumen ini untuk menjalankan NigmaSim di mesin development Windows.
Deployment ke server adalah urusan terpisah (lihat catatan di bagian 7).

---

## 1. Prasyarat

| Kebutuhan | Versi | Status di mesin ini | Cara memasang |
|---|---|---|---|
| Node.js | 22.x | ✅ v22.23.2 | sudah ada |
| Git | 2.5x | ✅ 2.55.0 | sudah ada |
| Python | 3.12 | ✅ 3.12.10 | `winget install -e --id Python.Python.3.12 --scope user` |
| Docker Desktop | terbaru | ❌ belum | baru dibutuhkan saat deployment |

Memeriksa versi Python (PowerShell):

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" --version
```

---

## 2. Struktur yang dipakai

```
C:\Users\Lenovo\nigmasim\
├─ .env                      # konfigurasi lokal (TIDAK masuk Git)
├─ backend/                  # API FastAPI + test
├─ frontend/                 # Admin React + TypeScript + Tailwind
├─ capture-worker/           # Playwright worker (Phase 1.4)
├─ storage/                  # screenshot, aset, export, dokumen
└─ Applications/             # output per aplikasi
```

---

## 3. Menjalankan Backend

Terminal 1:

```powershell
cd C:\Users\Lenovo\nigmasim\backend

# sekali saja: buat virtual environment
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"

# jalankan migrasi database
.\.venv\Scripts\python.exe -m alembic upgrade head

# jalankan server
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Cek backend:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
# => @{ status = "ok"; app = "NigmaSim"; env = "development" }
```

Dokumentasi API interaktif (hanya di development): http://127.0.0.1:8000/docs

---

## 3b. Menjalankan Capture Worker (terminal terpisah)

Worker adalah proses **terpisah** — backend tidak pernah menyentuh browser.

```powershell
cd C:\Users\Lenovo\nigmasim\capture-worker

# sekali saja
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m venv .venv
.\.venv\Scripts\python.exe -m pip install playwright==1.49.1 fastapi==0.115.6 `
  "uvicorn[standard]==0.34.0" pydantic==2.10.4 pydantic-settings==2.7.0 `
  pillow==11.0.0 httpx==0.28.1
.\.venv\Scripts\python.exe -m playwright install chromium

# jalankan dari folder src/
cd src
..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8010
```

Cek worker:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/health
# => @{ status = "ok"; role = "capture-worker"; headless = False }
```

Detail lengkap: `capture-worker/README.md`.

> **Aplikasi contoh untuk mencoba:** `samples/sample-app/` (dashboard, tabel, form).
> Jalankan dengan `python -m http.server 8099` lalu daftarkan sebagai aplikasi di
> NigmaSim dengan URL `http://127.0.0.1:8099/index.html`.

---

## 4. Menjalankan Frontend

Terminal 2:

```powershell
cd C:\Users\Lenovo\nigmasim\frontend
npm install
npm run dev
```

Buka **http://localhost:5173**

Login awal (dibuat otomatis saat backend pertama kali jalan):

| Email | Password |
|---|---|
| `admin@nigmasim.com` | `Admin#12345` |

> **Ganti password ini sebelum dipakai di server mana pun.**
> Super admin dapat mengganti password-nya sendiri lewat API:
> `POST /api/v1/users/{id}/password` dengan body `{"new_password": "..."}`.

---

## 5. Menjalankan Test

```powershell
cd C:\Users\Lenovo\nigmasim\backend
.\.venv\Scripts\python.exe -m pytest
```

Frontend:

```powershell
cd C:\Users\Lenovo\nigmasim\frontend
npm run build      # sekaligus cek TypeScript
```

---

## 6. Catatan Penting untuk Mesin Ini

**Rollup native diblokir Windows Application Control.**
Build Vite gagal dengan error `An Application Control policy has blocked this file`
pada `rollup.win32-x64-msvc.node`.

Solusi yang sudah diterapkan: `package.json` memakai npm `overrides` untuk mengganti
Rollup dengan build WASM resmi:

```json
"overrides": {
  "rollup": "npm:@rollup/wasm-node@4.68.2"
}
```

Kalau `node_modules` di-reset dan error muncul lagi, jalankan:

```powershell
Remove-Item -Recurse -Force node_modules,package-lock.json
npm install
```

---

## 7. Yang Belum Ada (Wajib Dilakukan Nanti)

| Item | Keterangan |
|---|---|
| Capture Worker | Playwright + Chromium belum ditulis (Phase 1.4). Tombol "Buka Capture Studio" untuk sementara hanya menampilkan halaman status. |
| Deployment | Docker Compose + Nginx belum disiapkan. |
| Domain terpisah untuk demo publik | Wajib sebelum demo online, agar runtime simulasi tidak bisa menjangkau domain produksi. |
| Rotasi secret | `SECRET_KEY` di `.env` hanya untuk development. |

---

## 8. Perintah Ringkas (Copy-Paste)

```powershell
# Terminal 1 - backend
cd C:\Users\Lenovo\nigmasim\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 - frontend
cd C:\Users\Lenovo\nigmasim\frontend
npm run dev
```
