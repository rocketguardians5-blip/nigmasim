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
| 1 — Registry + Capture Studio | 📋 Rencana selesai, menunggu persetujuan |
| 2 — Screen Repository | ⬜ Belum |
| 3 — UI Reconstruction | ⬜ Belum |
| 4 — Full Simulation | ⬜ Belum |
| 5 — Workflow + Walkthrough | ⬜ Belum |
| 6 — SOP Generator | ⬜ Belum |
| 7 — Publish + Export + Analytics | ⬜ Belum |

---

## Prasyarat mesin pengembangan

| Kebutuhan | Versi | Status |
|---|---|---|
| Node.js | 22.x | ✅ terpasang |
| Git | 2.5x | ✅ terpasang |
| Python | 3.12 | ❌ belum — wajib untuk backend & capture worker |
| Docker Desktop | terbaru | ❌ belum — dibutuhkan untuk deployment |

---

## Struktur repository

Lihat `docs/00-RENCANA-TEKNIS-PHASE1.md` §4.

---

## Cara menjalankan

Belum tersedia — akan diisi pada Sprint 1.1 setelah rencana disetujui.
