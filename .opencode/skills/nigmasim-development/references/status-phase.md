# Status Fase & Backlog

Ringkasan rinci caretaker proyek NigmaSim. Diperbarui 11 November 2026.

---

## Peta besar

Total ada **8 fase** (master prompt §17) dan **7 fase MVP** (PDF §8). Keduanya saling
tumpang tindih — hanya batas fase 1–2 yang sedikit berbeda.

| Fase | Cakupan | Status |
|---|---|---|
| 1 | Fondasi: setup, auth, user management, registry, skema DB | ✅ Selesai |
| 2 | Capture Studio (Playwright, browser session, screenshot, rekam interaksi) + Screen Repository | 🟡 Versi capture, kategori/modul, relasi layar, peta navigasi selesai. Retensi/backup & ekspor daftar layar belum. |
| 3 | UI Reconstruction: analisis layar, identifikasi komponen, draft React, perbandingan visual, koreksi manual | 🟡 Mesin analisis (rule-based) + halaman review. Plug-in model vision belum. |
| 4 | Full Simulation: builder, navigasi, form, tabel, CRUD, dummy data engine, workflow engine | 🟢 |
| 5 | Guided Walkthrough: tutorial builder, spotlight, tooltip, tutorial player | 🟢 |
| 6 | Documentation: SOP generator, user manual, ekspor PDF/HTML/Markdown | 🟢 |
| 7 | Publishing: public/private demo, password, masa berlaku, analytics | ❌ Belum |
| 8 | QA: uji fungsional, visual, keamanan, offline, performa | 🟡 Partial |

---

## Rincian Phase 1

| Sprint | Isi | Status | Bukti |
|---|---|---|---|
| 1.1 | Backend FastAPI, auth JWT + refresh rotation, Argon2id, RBAC, user & role, audit log, migrasi Alembic | ✅ | 20 pytest lulus |
| 1.2 | Application Registry (CRUD + otorisasi capture), Project per aplikasi, aturan "harus approved" | ✅ | 20 pytest lulus + uji manual di browser |
| 1.3 | Metadata capture: endpoint screen, element, interaction, review, masking | ✅ | 6 test baru; masking diverifikasi (file masked ≠ raw) |
| 1.4 | Capture Worker: Playwright + Chromium, sesi browser, screenshot, rekam interaksi | ✅ | Uji end-to-end: sample app → screenshot 1440×900 → 8 elemen terdeteksi |
| 1.5 | Frontend admin | ✅ | Capture Studio & Screen Repository sudah berfungsi (bukan status lagi) |
| 1.6 | Docker Compose, Nginx, dokumentasi operator | 🟳 | Dokumentasi ✅, Docker ❌ (ditunda: deployment adalah urusan pemilik proyek) |

---

## Rincian Phase 2 — Screen Repository

| Sprint | Isi | Status | Bukti |
|---|---|---|---|
| 2a | Versi capture: recapture halaman yang sama jadi versi baru | ✅ | migrasi `2026_11_12_0002`; constraint (project, key, version) |
| 2b | Kategori/modul + filter + tampilan per modul | ✅ | `GET /projects/{id}/screen-categories` |
| 2c | Relasi layar induk + peta navigasi | ✅ | `GET /projects/{id}/navigation-map` |
| 2d | Perbandingan versi side-by-side di UI | ✅ | tombol bandingkan di detail screen |
| 2e | Retensi/backup file screenshot & ekspor daftar layar (CSV/JSON) | ❌ | khusus MVP produksi |

---

## Rincian Phase 3 — UI Reconstruction (dalam pengerjaan)

| Sprint | Isi | Status | Bukti |
|---|---|---|---|
| 3a | Worker merekam struktur semantik (tabel, heading, form, card, image) | ✅ | `EXTRACT_STRUCTURE` di capture-worker/src/browser.py |
| 3b | Tabel rekonstruksi + komponen + asumsi (migrasi `2026_11_12_0003`) | ✅ | `app/models/reconstruction.py` |
| 3c | Mesin analisis deterministik + generator kode React/TS | ✅ | `app/services/reconstructor.py` |
| 3d | Endpoint: analyze, get, update code, edit komponen, resolve asumsi, review | ✅ | `app/api/v1/reconstruction.py` |
| 3e | Halaman UI Reconstruction: asli vs wireframe, komponen, checklist asumsi, editor kode | ✅ | `frontend/src/pages/UIReconstruction.tsx` |
| 3f | Plug-in model AI vision untuk analisis screenshot | ❌ | butuh API key + pilihan model |
| 3g | Preview React langsung (render draf di iframe) | ❌ | Phase 4 |

**Fase 6 (Documentation Generator):** dokumen disusun dari layar + tutorial + alur workflow yang
sudah direview; isi bisa disunting manusia sebelum publish; ekspor PDF (dirender Chromium di
worker), HTML, dan Markdown; screenshot di-embed sebagai base64 supaya gambar tetap muncul di PDF.

**Aturan penting Phase 3:** draf hanya bisa disetujui setelah SEMUA asumsi dicentang manusia
(`409` kalau masih ada yang belum dicek). Edit kode mengembalikan status ke `draft`.

---

## Yang sudah ada di kode

**Backend**

- `app/core/` — config, security (hash + JWT), errors (format error seragam)
- `app/models/` — Role, User, RefreshToken, Application, Project, CaptureSession, Screen,
  ScreenElement, Interaction, AuditLog
- `app/api/v1/` — auth, users (+roles), applications, projects, health
- `app/services/` — auth (token), audit (append-only), seed (5 role bawaan + admin awal)
- `alembic/versions/` — migrasi `f786ef540a52` (skema awal Phase 1)
- `tests/` — 20 test: auth, refresh rotation, RBAC 403, konflik email, registry, otorisasi,
  project blocked tanpa izin, penolakan URL internal, paginasi, audit

**Frontend**

- Halaman: Login, Dashboard, Applications, ApplicationDetail, Users, Placeholder (10 modul)
- `lib/api.ts` — klien dengan refresh-token otomatis
- `lib/auth.tsx` — AuthProvider + `can(permission)`
- `components/ui.tsx` — Button, Field, Badge, Card, Modal, Alert, EmptyState, PageHeader
- `layouts/AdminLayout.tsx` — sidebar gelap dengan 13 menu (sesuai master prompt §15)

---

## Backlog (ditunda dengan alasan)

| Item | Alasan | Kapan |
|---|---|---|
| Docker Compose + Nginx | Deployment ditangani pemilik proyek | sebelum go-live |
| Worker capture di server (noVNC) | Belum diputuskan; default laptop operator | Sprint 1.4 |
| Streaming layar realtime | Tidak dibutuhkan untuk capture | di luar MVP |
| Ganti password sendiri oleh user | Baru ada reset oleh admin (`POST /users/{id}/password`) | Sprint 1.5 lanjutan |
| Menu "Projects" terpisah | Master prompt §15 tidak memintanya; PDF §11 menyebutnya | Permintaan pengguna |
| PostgreSQL | SQLite cukup untuk MVP | sebelum produksi |
| Rate limiting | Tidak ada endpoint publik yet | Phase 7 |
| Perbandingan versi capture | Butuh Screen Repository penuh | Phase 2 |
| SSO/LDAP | Belum ada permintaan dari tim IT | bila diminta |

---

## Keputusan yang masih dibutuhkan manusia

1. **Lokasi Capture Worker** — laptop operator (disarankan) atau server + noVNC.
2. **Aplikasi pilot** — nama, URL, bukti otorisasi.
3. **Aturan bisnis** — hal yang tak terbaca dari screenshot, mis. "nilai risiko > 20 wajib
   approval direksi".
4. **Kebijakan penyimpanan** — berapa lama screenshot disimpan, di mana backup.
5. **Domain terpisah** untuk runtime demo publik.
