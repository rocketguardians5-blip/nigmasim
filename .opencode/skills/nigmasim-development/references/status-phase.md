# Status Fase & Backlog

Ringkasan rinci caretaker proyek NigmaSim. Diperbarui 11 November 2026.

---

## Peta besar

Total ada **8 fase** (master prompt §17) dan **7 fase MVP** (PDF §8). Keduanya saling
tumpang tindih — hanya batas fase 1–2 yang sedikit berbeda.

| Fase | Cakupan | Status |
|---|---|---|
| 1 | Fondasi: setup, auth, user management, registry, skema DB | ✅ Selesai |
| 2 | Capture Studio (Playwright, browser session, screenshot, rekam interaksi) + Screen Repository | ❌ Belum |
| 3 | UI Reconstruction: analisis layar, identifikasi komponen, draft React, perbandingan visual, koreksi manual | ❌ Belum |
| 4 | Full Simulation: builder, navigasi, form, tabel, CRUD, dummy data engine, workflow engine | ❌ Belum |
| 5 | Guided Walkthrough: tutorial builder, spotlight, tooltip, tutorial player | ❌ Belum |
| 6 | Documentation: SOP generator, user manual, ekspor PDF/HTML/Markdown | ❌ Belum |
| 7 | Publishing: public/private demo, password, masa berlaku, analytics | ❌ Belum |
| 8 | QA: uji fungsional, visual, keamanan, offline, performa | 🟡 Partial |

---

## Rincian Phase 1

| Sprint | Isi | Status | Bukti |
|---|---|---|---|
| 1.1 | Backend FastAPI, auth JWT + refresh rotation, Argon2id, RBAC, user & role, audit log, migrasi Alembic | ✅ | 20 pytest lulus |
| 1.2 | Application Registry (CRUD + otorisasi capture), Project per aplikasi, aturan "harus approved" | ✅ | 20 pytest lulus + uji manual di browser |
| 1.3 | Metadata capture: endpoint screen, element, interaction | 🟳 | Model DB sudah ada, endpoint belum |
| 1.4 | Capture Worker: Playwright + Chromium, sesi browser, screenshot, masking, recorder | ❌ | Folder kosong |
| 1.5 | Frontend admin | 🟳 | Semua fitur yang ada sudah UI; halaman Capture Studio masih status |
| 1.6 | Docker Compose, Nginx, dokumentasi operator | 🟳 | Dokumentasi ✅, Docker ❌ (ditunda: deployment adalah urusan pemilik proyek) |

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
