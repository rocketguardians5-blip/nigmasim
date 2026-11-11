# NigmaSim

Application Simulation, Interactive Product Demo & Documentation Platform.

Platform mandiri untuk menangkap tampilan aplikasi web yang **telah diotorisasi**, merekonstruksinya menjadi simulasi React yang interaktif, lalu menghasilkan demo produk, guided walkthrough, dan dokumentasi SOP.

**Pemilik:** PT Nigmagrid Indo Nesia

---

## Dokumen acuan (sumber kebenaran)

| File | Isi |
|---|---|
| `MASTER_PROMPT_NIGMASIM.md` | Spesifikasi induk. **Tidak boleh diubah.** |
| `docs/00-RENCANA-TEKNIS-PHASE1.md` | Rencana teknis Phase 1: arsitektur, ERD, API contract, threat model |

Bila ada konflik antara implementasi dan master prompt, **master prompt menang**.

---

## Prinsip keamanan (ringkas)

1. Capture hanya pada aplikasi yang punya izin tertulis.
2. Login aplikasi sumber dilakukan **manual** oleh operator. Tidak ada penyimpanan kredensial.
3. Tidak ada koneksi dari simulasi ke API/database produksi.
4. HTML/JS hasil capture **tidak pernah dieksekusi** — hanya screenshot + metadata.
5. Data pribadi dimasking sebelum aset dipakai.
6. Offline export baru boleh diklaim setelah diuji tanpa jaringan.

Detail lengkap: `MASTER_PROMPT_NIGMASIM.md` §13 dan `docs/00-RENCANA-TEKNIS-PHASE1.md` §10.

---

## Status

| Phase | Status |
|---|---|
| 1 — Registry + Capture Studio | 🟡 Sprint 1.1–1.3 selesai (auth, user/role, registry, project). Capture Worker menyusul. |
| 2 — Screen Repository | ⬜ Belum |
| 3 — UI Reconstruction | ⬜ Belum |
| 4 — Full Simulation | ⬜ Belum |
| 5 — Workflow + Walkthrough | ⬜ Belum |
| 6 — SOP Generator | ⬜ Belum |
| 7 — Publish + Export + Analytics | ⬜ Belum |

**Yang sudah berfungsi sekarang:** login, manajemen user & role, Application Registry
(daftar aplikasi, otorisasi capture,+hapus), Project per aplikasi, audit log, dan
dashboard ringkasan.

---

## Prasyarat mesin pengembangan

| Kebutuhan | Versi | Status |
|---|---|---|
| Node.js | 22.x | ✅ terpasang |
| Git | 2.5x | ✅ terpasang |
| Python | 3.12 | ✅ 3.12.10 terpasang |
| Docker Desktop | terbaru | ❌ belum — baru dibutuhkan saat deploy |

---

## Cara menjalankan

Detail lengkap ada di `docs/01-INSTALASI-DAN-MENJALANKAN.md`.

```powershell
# Terminal 1 - backend
cd C:\Users\Lenovo\nigmasim\backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 - frontend
cd C:\Users\Lenovo\nigmasim\frontend
npm install
npm run dev
```

Buka **http://localhost:5173** · login awal `admin@nigmasim.com` / `Admin#12345`
(ganti password sebelum dipakai di server).

---

## Struktur repository

Lihat `docs/00-RENCANA-TEKNIS-PHASE1.md` §4.

| Folder | Isi |
|---|---|
| `backend/` | API FastAPI, model SQLAlchemy, migrasi Alembic, test pytest |
| `frontend/` | Admin React + TypeScript + Tailwind (Vite) |
| `capture-worker/` | Playwright worker — Sprint 1.4 |
| `simulation-runtime/` | Runtime simulasi terpisah — Phase 4 |
| `storage/` | Screenshot, aset, export, dokumen |
| `Applications/` | Output per aplikasi (capture, metadata, simulasi, dokumentasi) |
