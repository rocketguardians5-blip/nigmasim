---
name: NigmaSim Development
description: Develop the NigmaSim platform — application simulation, interactive product demo and documentation platform for PT Nigmagrid Indo Nesia. Use when working inside the nigmasim repository, adding backend/frontend features, running tests, reviewing security boundaries, or planning the next phase.
---

# NigmaSim Development

NigmaSim menangkap tampilan aplikasi web yang **sudah diotorisasi**, lalu merekonstruksinya
menjadi simulasi React yang interaktif (data dummy) untuk demo produk, pelatihan pengguna,
dan pembuatan SOP.

**Repositori:** `C:\Users\Lenovo\nigmasim`
**Pemilik:** PT Nigmagrid Indo Nesia

## Sumber kebenaran

`MASTER_PROMPT_NIGMASIM.md` di root repo adalah spesifikasi induk — **jangan pernah diubah**.
Bila implementasi bertentangan dengan master prompt, master prompt yang menang.

### Berkas yang dilindungi (jangan diubah)

| Berkas | Peran |
|---|---|
| `MASTER_PROMPT_NIGMASIM.md` | spesifikasi induk (salinan verbatim dari file asli pemilik proyek) |
| `docs/Panduan-Developer-NigmaSim.pdf` | panduan developer + master prompt (PDF asli) |

Ada **pre-commit guard** (`.githooks/pre-commit`) yang memblokir commit yang menyentuh kedua
berkas itu. Mengaktifkannya di clone baru:

```powershell
git config core.hooksPath .githooks
```

Kalau memang harus mengubahnya, ambil versi resmi dari pemilik proyek dulu, lalu commit
sengaja dengan `--no-verify` dan jelaskan alasannya di pesan commit.

### Skill UI/UX pihak ketiga

Repo ini memang memakai skill desain (UI UX Pro Max) untuk tahap visual. Aturan mainnya:

- **Hanya menyentuh `frontend/`.** Jangan pernah menyentuh `backend/`, `capture-worker/`,
  `simulation-runtime/`, `storage/`, atau dokumen acuan.
- **UI harus tetap sesuai master prompt §15**: enterprise modern, dark sidebar, clean
  workspace, design system konsisten, responsif, indikator status yang jelas.
- **Tampilan dikunci** oleh `design-system/nigmasim/MASTER.md`. Skill hanya melengkapi
  detail dan memeriksa aturan — bukan menentukan gaya.
- Dilarang: gradient, glassmorphism, neon, ungu/pink, radius > 8px, emoji sebagai icon.
- **Dilarang** dipakai untuk rekonstruksi UI (Phase 3) — di sana kesetiaan visual ke
  screenshot asli yang jadi Prioritas, bukan desain baru.

Dokumen pendukung:

| File | Isi |
|---|---|
| `MASTER_PROMPT_NIGMASIM.md` | spesifikasi induk (20 bagian) |
| `docs/00-RENCANA-TEKNIS-PHASE1.md` | arsitektur, ERD, API contract, threat model, progres |
| `docs/01-INSTALASI-DAN-MENJALANKAN.md` | cara menjalankan di mesin development |
| `references/status-phase.md` | status rinci per fase & backlog |

## Aturan yang tidak boleh dilanggar

Ini berasal dari master prompt §13 dan PDF §2. Pelanggaran berarti proyek gagal secara konsep.

1. **Tidak ada** koneksi ke database, API, atau session aplikasi produksi.
2. **Tidak ada** penyimpanan kredensial, token, cookie, atau session aplikasi sumber.
   Tidak ada kolom pun untuk itu di skema database — jangan tambahkan.
3. Login ke aplikasi sumber **selalu manual** oleh operator. Jangan pernah membuat
   endpoint otomatis untuk mengisi form login.
4. HTML/JavaScript hasil capture **tidak dieksekusi** dan **tidak disimpan**. Yang
   disimpan hanya screenshot (PNG) dan metadata terstruktur.
5. Jangan lakukan aksi destruktif atau berdampak bisnis di aplikasi produksi saat capture.
6. Data pribadi/komersial wajib dimasking sebelum aset dipakai atau dipublikasikan.
7. Otorisasi ditegakkan **di backend**. Menyembunyikan menu di frontend bukan
   mekanisme keamanan.
8. Jangan mengklaim dukungan offline sebelum diuji tanpa koneksi jaringan.
9. Jangan skip requirement diam-diam. Yang ditunda dicatat di backlog beserta alasan dan
   kriteria penerimanya.

## Struktur repo

```
backend/          FastAPI + SQLAlchemy + Alembic + pytest
frontend/         Admin React + TypeScript + Tailwind (Vite)
capture-worker/   Playwright + Chromium (Phase 1.4)
simulation-runtime/  Runtime simulasi terpisah (Phase 4) — origin sendiri
storage/          screenshot, assets, exports, documents
Applications/     output per aplikasi
```

## Menjalankan & menguji (Windows)

```powershell
# backend
cd C:\Users\Lenovo\nigmasim\backend
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m venv .venv   # sekali saja
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
.\.venv\Scripts\python.exe -m pytest

# frontend
cd C:\Users\Lenovo\nigmasim\frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # sekaligus type-check TypeScript
```

Login development: `admin@nigmasim.com` / `Admin#12345` (ganti sebelum dipakai di server).

**Kendala mesin ini:** Windows Application Control memblokir binary native Rollup. Solusinya
sudah terpasang di `frontend/package.json` lewat npm `overrides` →
`"rollup": "npm:@rollup/wasm-node@4.68.2"`. Jika `node_modules` di-reset dan error
`An Application Control policy has blocked this file` muncul, jalankan `npm install` ulang
(setelah menghapus `node_modules` dan `package-lock.json`).

## Arsitektur ringkas

Tiga runtime terpisah — jangan disatukan:

```
Frontend Admin ──► Backend API ──► Capture Worker ──► Aplikasi Sumber
                          │                (hanya lewat browser operator)
                          └──► Database NigmaSim (SQLite, migrasi Alembic)
                                   └──► Audit log (append-only)
```

- Capture Worker = proses terpisah, hanya listen di `127.0.0.1`, diakses dengan token internal.
- Aplikasi sumber hanya boleh diakses oleh worker, dan hanya atas aksi manusia.
- Simulation runtime (Phase 4) tidak boleh punya jalur jaringan ke domain produksi.

## Status sekarang

Phase 1 (8 fase total). Sudah jadi: fondasi, autentikasi, user & role, Application Registry,
project, audit log, frontend admin. Berikutnya: Sprint 1.3 (endpoint metadata capture) dan
Sprint 1.4 (Capture Worker Playwright).

Rincian per fase ada di `references/status-phase.md` — **baca file itu sebelum**
mengambil keputusan tentang apa yang sudah ada.

## Cara kerja yang harus diikuti

1. Kerjakan **satu sprint pada satu waktu**. Jangan bangun semuanya sekaligus.
2. Untuk fitur baru, urutannya: model → migrasi Alembic → schema Pydantic → service →
   endpoint API → test pytest → baru UI.
3. **Selalu** tambahkan test untuk fitur baru dan jalankan `pytest` + `npm run build`
   sebelum commit.
4. Commit per sprint dengan pesan yang jelas. Jangan commit `.env`, secret, `*.db`,
   `node_modules`, atau `dist`.
5. Tulis teks antarmuka dalam **Bahasa Indonesia**. Kode dan nama variabel dalam Inggris.
6. Format error API konsisten:
   `{"error": {"code": "...", "message": "...", "details": null}}`.
7. Paginasi: `page`, `page_size`, balasan `{ items, page, page_size, total }`.
8. Jangan pernah membuat halaman UI yang terlihat jadi padahal modulnya belum ada.
   Gunakan pola status yang jujur (lihat `frontend/src/pages/Placeholder.tsx`).

## Peta file penting

| Kebutuhan | Lokasi |
|---|---|
| Konfigurasi | `backend/app/core/config.py` |
| Hash password & JWT | `backend/app/core/security.py` |
| Format error | `backend/app/core/errors.py` |
| Model database | `backend/app/models/` |
| Endpoint | `backend/app/api/v1/` |
| Otorisasi per izin | `backend/app/api/deps.py` |
| Role bawaan | `backend/app/services/seed.py` |
| Klien API frontend | `frontend/src/lib/api.ts` |
| Autentikasi frontend | `frontend/src/lib/auth.tsx` |
| Komponen UI dasar | `frontend/src/components/ui.tsx` |
| Layout & menu 13 | `frontend/src/layouts/AdminLayout.tsx` |
