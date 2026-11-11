# Rencana Teknis — NigmaSim Phase 1

**Proyek:** NigmaSim — Application Simulation, Interactive Product Demo & Documentation Platform
**Pemilik:** PT Nigmagrid Indo Nesia
**Versi dokumen:** 1.0
**Tanggal:** 11 November 2026
**Acuan:** `MASTER_PROMPT_NIGMASIM.md` (identik dengan master prompt asli, tidak diubah) + `NigmaSim_Panduan_Developer_dan_Master_Prompt.pdf`

> Dokumen ini adalah **rencana**, bukan implementasi. Sesuai bagian 10 PDF panduan, implementasi dimulai setelah rencana disetujui.

---

## 1. Lingkup Phase 1

Phase 1 menggabungkan dua definisi dari dokumen acuan:

| Sumber | Isi Phase 1 |
|---|---|
| PDF §8 (MVP) | Registry aplikasi, start browser, login manual, capture screenshot, catatan screen/interaksi, masking dasar |
| TXT §17 | Project setup, authentication, user management, application registry, database schema |

**Hasil akhir Phase 1 yang bisa didemokan:**

1. Admin bisa login, mengelola user dan role.
2. Admin bisa mendaftarkan aplikasi sumber beserta status otorisasi capture.
3. Admin bisa membuat project di bawah aplikasi tersebut.
4. Operator bisa membuka Chromium via Playwright, **login manual sendiri**, dan menavigasi aplikasi sumber.
5. Operator bisa mengambil screenshot (viewport / full page) beserta metadata.
6. Screenshot bisa diberi nama, tag, catatan, dan **status review**.
7. Region sensitif bisa dimasking sebelum aset disimpan permanen.
8. Interaksi (klik, navigasi, input) bisa dicatat berurutan per screen.
9. Semua aksi tercatat di audit log.

**Yang TIDAK dikerjakan di Phase 1** (agar tidak melebar):
UI reconstruction, simulation builder, data engine, workflow engine, demo player, walkthrough, SOP generator, publishing, analytics, offline export.

---

## 2. Prinsip yang Dipegang

1. **Capture ≠ menjalankan aplikasi produksi.** Capture hanya menghasilkan screenshot + metadata. Tidak ada HTML/JS hasil capture yang dieksekusi.
2. **Tidak menyimpan kredensial aplikasi sumber.** Login dilakukan manual oleh operator di browser Playwright. Database NigmaSim tidak punya kolom untuk password aplikasi sumber.
3. **Isolasi tiga runtime.** Admin+API, capture worker, dan simulation runtime adalah tiga proses/domain terpisah. Tidak ada jalur jaringan dari simulation runtime ke API produksi aplikasi sumber.
4. **Semua data simulasi = dummy.** Belum relevan di Phase 1, tetapi skema dirancang agar tidak pernah bercampur.
5. **Modular & bisa naik ke PostgreSQL.** SQLite untuk MVP, tetapi semua query lewat repository layer + Alembic migration, tanpa SQL vendor-specific.
6. **Tidak ada requirement yang dihapus diam-diam.** Yang ditunda dicatat di §12 beserta alasannya.

---

## 3. Arsitektur

```
┌──────────────────────┐        ┌──────────────────────┐
│  Frontend Admin      │        │  Simulation Runtime  │
│  React + TS + TW     │        │  (Phase 4+, terpisah)│
│  :5173 / :443 admin  │        │  :5174 / domain demo │
└──────────┬───────────┘        └──────────────────────┘
           │ HTTPS/JSON                   (tidak ada koneksi
           ▼                               ke API produksi)
┌──────────────────────┐
│  Backend API         │  FastAPI :8000
│  - Auth & RBAC       │
│  - Registry          │
│  - Screens metadata  │
│  - Audit log         │
└──────────┬───────────┘
           │ internal token (HTTP lokal)
           ▼
┌──────────────────────┐
│  Capture Worker      │  Playwright + Chromium (headed)
│  - Buka browser      │  ← operator login manual di sini
│  - Screenshot        │
│  - Rekam interaksi   │
└──────────┬───────────┘
           │ tulis file
           ▼
┌──────────────────────┐
│  Storage (filesystem)│  storage/captures/<project>/<session>/...
└──────────────────────┘

┌──────────────────────┐
│  Aplikasi Sumber     │  HANYA diakses oleh Capture Worker,
│  (produksi, izin)    │  read-only, lewat browser operator
└──────────────────────┘
```

**Batas kepercayaan (trust boundaries):**

- `B1` Browser operator → Capture Worker: operator bisa melihat apa pun yang dia buka. Bukan tanggung jawab sistem.
- `B2` Capture Worker → Aplikasi Sumber: satu-satunya jalur keluar. Dilakukan oleh manusia, bukan otomasi kredensial.
- `B3` Backend API → Capture Worker: token internal, listen hanya di `127.0.0.1`.
- `B4` Simulation Runtime: **tidak ada** jalur ke Aplikasi Sumber. Di Phase 1 belum dibangun; aturannya dikunci di konfigurasi CSP sejak sekarang.

---

## 4. Struktur Repository

Mengikuti PDF §6 (`Applications/<AppName>/...`) untuk output, ditambah folder kode:

```
nigmasim/
├─ MASTER_PROMPT_NIGMASIM.md      # spec asli, JANGAN diubah
├─ README.md
├─ .env.example
├─ .gitignore
├─ docs/
│  └─ 00-RENCANA-TEKNIS-PHASE1.md
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ api/v1/            # router per modul
│  │  ├─ core/              # config, security, deps, errors
│  │  ├─ models/            # SQLAlchemy
│  │  ├─ schemas/           # Pydantic
│  │  ├─ repositories/      # data access (siap PostgreSQL)
│  │  ├─ services/          # business logic
│  │  └─ workers/           # klien ke capture worker
│  ├─ alembic/versions/
│  ├─ tests/
│  ├─ pyproject.toml
│  └─ Dockerfile
├─ capture-worker/
│  ├─ src/
│  │  ├─ main.py            # FastAPI internal, 127.0.0.1
│  │  ├─ browser.py         # Playwright session manager
│  │  ├─ capture.py         # screenshot + metadata
│  │  ├─ masking.py         # redaksi region
│  │  └─ recorder.py        # perekam interaksi
│  ├─ pyproject.toml
│  └─ Dockerfile
├─ frontend/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ pages/
│  │  ├─ layouts/
│  │  ├─ lib/               # api client, auth store
│  │  ├─ hooks/
│  │  └─ types/
│  ├─ package.json
│  └─ Dockerfile
├─ simulation-runtime/       # placeholder Phase 4
├─ storage/
│  ├─ captures/
│  ├─ assets/
│  ├─ exports/
│  └─ documents/
├─ deploy/
│  ├─ docker/
│  └─ nginx/
└─ Applications/
   └─ <NamaAplikasi>/
      ├─ captures/
      ├─ metadata/
      ├─ simulation/
      ├─ documentation/
      └─ exports/
```

---

## 5. Stack & Keputusan Teknis

| Komponen | Pilihan | Catatan |
|---|---|---|
| Frontend admin | React 18 + TypeScript + Vite + Tailwind CSS | Sesuai spec |
| Backend API | Python 3.12 + FastAPI + Pydantic v2 | Sesuai spec |
| ORM & migrasi | SQLAlchemy 2.0 + Alembic | Wajib migration, tidak `create_all` |
| Database | SQLite (MVP) | Repository layer agar PostgreSQL mudah |
| Auth | JWT (access 15 mnt) + refresh token (7 hari, disimpan hash) | Password: Argon2id |
| Capture | Playwright + Chromium, **headed** | Login manual, tidak ada auto-fill kredensial |
| Image processing | Pillow | Untuk masking region |
| Logging | structlog (JSON) | Wajib untuk audit trail |
| Test | pytest + httpx | E2E Playwright menyusul Phase 2 |
| Deploy | Docker Compose + Nginx | Docker belum terpasang di mesin dev |

**Prasyarat di mesin pengembangan saat ini:**

- ✅ Node.js v22.23.2
- ✅ Git 2.55.0
- ❌ Python 3.12 — **belum terpasang**, wajib untuk backend & worker
- ❌ Docker Desktop — **belum terpasang**, dibutuhkan untuk deployment (development bisa tanpa Docker)

Versi dependency akan di-pin persis saat implementasi, setelah memastikan versi stabil yang tersedia.

---

## 6. Model Data Phase 1 (ERD)

Entitas Phase 1 saja. Tabel modul simulasi (simulation_pages, datasets, workflows, walkthroughs, documents, publications) **belum dibuat** — ditambahkan di phase-nya masing-masing lewat migration baru.

```
roles 1───n users
applications 1───n projects
projects 1───n capture_sessions
capture_sessions 1───n screens
users 1───n capture_sessions        (sebagai operator)
screens 1───n screen_elements
screens 1───n interactions
screen_elements 1───n interactions  (nullable target)
users 1───n audit_logs
```

### 6.1 `roles`

| Kolom | Tipe | Constraint |
|---|---|---|
| id | INTEGER | PK |
| name | VARCHAR(50) | unique, not null — `super_admin`, `project_admin`, `capture_operator`, `developer_reviewer`, `demo_viewer` |
| permissions | JSON | daftar permission string |
| created_at | DATETIME | not null |

### 6.2 `users`

| Kolom | Tipe | Constraint |
|---|---|---|
| id | INTEGER | PK |
| name | VARCHAR(120) | not null |
| email | VARCHAR(255) | unique, not null, index |
| password_hash | VARCHAR(255) | not null (Argon2id) |
| role_id | INTEGER | FK → roles.id, not null |
| status | VARCHAR(20) | `active` / `disabled`, default `active` |
| last_login_at | DATETIME | nullable |
| created_at / updated_at | DATETIME | not null |

### 6.3 `refresh_tokens`

| Kolom | Tipe | Constraint |
|---|---|---|
| id | INTEGER | PK |
| user_id | INTEGER | FK → users.id |
| token_hash | VARCHAR(255) | not null, index |
| expires_at | DATETIME | not null |
| revoked_at | DATETIME | nullable |
| created_at | DATETIME | not null |

### 6.4 `applications`

| Kolom | Tipe | Constraint |
|---|---|---|
| id | INTEGER | PK |
| name | VARCHAR(150) | not null |
| description | TEXT | nullable |
| owner | VARCHAR(120) | nullable |
| category | VARCHAR(80) | nullable |
| source_url | VARCHAR(500) | not null — **hanya diakses worker** |
| login_url | VARCHAR(500) | nullable |
| environment_label | VARCHAR(40) | `production` / `staging` / `demo` |
| authorization_status | VARCHAR(20) | `pending` / `approved` / `revoked`, default `pending` |
| authorization_ref | VARCHAR(255) | nullable — nomor/rujukan dokumen izin |
| authorization_note | TEXT | nullable |
| logo_path | VARCHAR(500) | nullable |
| version_label | VARCHAR(40) | nullable |
| created_by | INTEGER | FK → users.id |
| created_at / updated_at | DATETIME | not null |

Catatan: **tidak ada** kolom username/password/token aplikasi sumber, sesuai §13 TXT.

### 6.5 `projects`

| Kolom | Tipe | Constraint |
|---|---|---|
| id | INTEGER | PK |
| application_id | INTEGER | FK → applications.id, index |
| name | VARCHAR(150) | not null |
| description | TEXT | nullable |
| version | VARCHAR(20) | default `1.0` |
| status | VARCHAR(20) | `draft` / `capturing` / `building` / `published` / `archived` |
| created_by | INTEGER | FK → users.id |
| created_at / updated_at | DATETIME | not null |

### 6.6 `capture_sessions`

| Kolom | Tipe | Constraint |
|---|---|---|
| id | INTEGER | PK |
| project_id | INTEGER | FK → projects.id, index |
| operator_id | INTEGER | FK → users.id |
| status | VARCHAR(20) | `active` / `paused` / `stopped` / `saved` |
| viewport_width / viewport_height | INTEGER | default 1440 / 900 |
| browser_mode | VARCHAR(20) | `headed` |
| started_at / ended_at | DATETIME | nullable |
| notes | TEXT | nullable |
| created_at | DATETIME | not null |

### 6.7 `screens`

| Kolom | Tipe | Constraint |
|---|---|---|
| id | INTEGER | PK |
| project_id | INTEGER | FK → projects.id, index |
| capture_session_id | INTEGER | FK → capture_sessions.id |
| screen_key | VARCHAR(80) | not null, **unique(project_id, screen_key)** |
| title | VARCHAR(200) | not null |
| route_label | VARCHAR(200) | nullable |
| source_url | VARCHAR(500) | nullable (dicatat, tidak dipanggil ulang) |
| screenshot_path | VARCHAR(500) | not null |
| full_page | BOOLEAN | default false |
| capture_version | INTEGER | default 1 |
| tags | JSON | default `[]` |
| review_status | VARCHAR(20) | `pending` / `approved` / `rejected`, default `pending` |
| reviewed_by | INTEGER | FK → users.id, nullable |
| notes | TEXT | nullable |
| captured_at | DATETIME | not null |
| created_at / updated_at | DATETIME | not null |

### 6.8 `screen_elements`

| Kolom | Tipe | Constraint |
|---|---|---|
| id | INTEGER | PK |
| screen_id | INTEGER | FK → screens.id, index |
| element_type | VARCHAR(40) | `nav`, `button`, `input`, `select`, `table`, `modal`, `tab`, `card` |
| label | VARCHAR(200) | nullable |
| selector_or_hint | VARCHAR(500) | nullable |
| bounding_box | JSON | `{x,y,w,h}` nullable |
| mask | BOOLEAN | default false — bila true, region diblok saat screenshot disajikan |
| notes | TEXT | nullable |

### 6.9 `interactions`

| Kolom | Tipe | Constraint |
|---|---|---|
| id | INTEGER | PK |
| screen_id | INTEGER | FK → screens.id, index |
| sequence_no | INTEGER | not null, unique(screen_id, sequence_no) |
| action | VARCHAR(40) | `click`, `navigate`, `input`, `select`, `modal_open`, `modal_close`, `tab_switch` |
| target_element_id | INTEGER | FK → screen_elements.id, nullable |
| expected_result | TEXT | nullable |
| notes | TEXT | nullable |
| created_at | DATETIME | not null |

### 6.10 `audit_logs`

| Kolom | Tipe | Constraint |
|---|---|---|
| id | INTEGER | PK |
| actor_id | INTEGER | FK → users.id, nullable |
| action | VARCHAR(80) | not null |
| entity_type | VARCHAR(60) | not null |
| entity_id | INTEGER | nullable |
| metadata | JSON | nullable |
| ip_address | VARCHAR(45) | nullable |
| created_at | DATETIME | not null, index |

---

## 7. API Contract (Phase 1)

Base: `/api/v1`. Format error konsisten:

```json
{ "error": { "code": "FORBIDDEN", "message": "Anda tidak punya akses", "details": null } }
```

Paginasi: query `page`, `page_size` (default 20, max 100) → response `{ items, page, page_size, total }`.

### 7.1 Auth

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/auth/login` | publik | `{email, password}` → `{access_token, refresh_token, user}` |
| POST | `/auth/refresh` | publik+token | rotasi refresh token |
| POST | `/auth/logout` | login | revoke refresh token |
| GET | `/auth/me` | login | profil + permission |

### 7.2 Users & Roles

| Method | Path | Permission |
|---|---|---|
| GET | `/roles` | `users:read` |
| GET | `/users` | `users:read` |
| POST | `/users` | `users:write` |
| GET | `/users/{id}` | `users:read` |
| PATCH | `/users/{id}` | `users:write` |
| PATCH | `/users/{id}/status` | `users:write` |
| DELETE | `/users/{id}` | `users:write` (soft delete → `disabled`) |

### 7.3 Applications

| Method | Path | Permission |
|---|---|---|
| GET | `/applications?search=&authorization_status=&page=` | `applications:read` |
| POST | `/applications` | `applications:write` |
| GET | `/applications/{id}` | `applications:read` |
| PATCH | `/applications/{id}` | `applications:write` |
| DELETE | `/applications/{id}` | `applications:write` |
| PATCH | `/applications/{id}/authorization` | `applications:authorize` |

Aturan: capture session **ditolak** (HTTP 409) bila `authorization_status != approved`.

### 7.4 Projects

| Method | Path | Permission |
|---|---|---|
| GET | `/applications/{id}/projects` | `projects:read` |
| POST | `/applications/{id}/projects` | `projects:write` |
| GET | `/projects/{id}` | `projects:read` |
| PATCH | `/projects/{id}` | `projects:write` |
| DELETE | `/projects/{id}` | `projects:write` |

### 7.5 Capture Sessions (proxy ke Capture Worker)

| Method | Path | Permission |
|---|---|---|
| POST | `/projects/{id}/capture-sessions` | `capture:operate` |
| GET | `/projects/{id}/capture-sessions` | `capture:read` |
| GET | `/capture-sessions/{id}` | `capture:read` |
| POST | `/capture-sessions/{id}/start` | `capture:operate` |
| POST | `/capture-sessions/{id}/pause` | `capture:operate` |
| POST | `/capture-sessions/{id}/resume` | `capture:operate` |
| POST | `/capture-sessions/{id}/stop` | `capture:operate` |
| POST | `/capture-sessions/{id}/capture` | `capture:operate` — ambil screenshot halaman aktif |
| POST | `/capture-sessions/{id}/save` | `capture:operate` — finalisasi sesi |
| GET | `/capture-sessions/{id}/live` | `capture:read` — status browser (belum streaming layar) |

### 7.6 Screens

| Method | Path | Permission |
|---|---|---|
| GET | `/projects/{id}/screens?search=&tag=&review_status=` | `screens:read` |
| GET | `/screens/{id}` | `screens:read` |
| GET | `/screens/{id}/screenshot` | `screens:read` — file, auth-gated |
| PATCH | `/screens/{id}` | `screens:write` |
| DELETE | `/screens/{id}` | `screens:write` |
| POST | `/screens/{id}/review` | `screens:review` |

### 7.7 Elements & Interactions

| Method | Path | Permission |
|---|---|---|
| GET | `/screens/{id}/elements` | `screens:read` |
| POST | `/screens/{id}/elements` | `screens:write` |
| PATCH | `/elements/{id}` | `screens:write` |
| DELETE | `/elements/{id}` | `screens:write` |
| GET | `/screens/{id}/interactions` | `screens:read` |
| POST | `/screens/{id}/interactions` | `screens:write` |
| PATCH | `/interactions/{id}` | `screens:write` |
| DELETE | `/interactions/{id}` | `screens:write` |

### 7.8 Health

| Method | Path |
|---|---|
| GET | `/health` |
| GET | `/health/ready` |

---

## 8. RBAC Matrix (Phase 1)

| Permission | super_admin | project_admin | capture_operator | developer_reviewer | demo_viewer |
|---|---|---|---|---|---|
| `users:read` | ✅ | ✅ | – | – | – |
| `users:write` | ✅ | – | – | – | – |
| `applications:read` | ✅ | ✅ | ✅ | ✅ | – |
| `applications:write` | ✅ | ✅ | – | – | – |
| `applications:authorize` | ✅ | – | – | – | – |
| `projects:read` | ✅ | ✅ | ✅ | ✅ | – |
| `projects:write` | ✅ | ✅ | – | – | – |
| `capture:operate` | ✅ | ✅ | ✅ | – | – |
| `capture:read` | ✅ | ✅ | ✅ | ✅ | – |
| `screens:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `screens:write` | ✅ | ✅ | ✅ | – | – |
| `screens:review` | ✅ | ✅ | – | ✅ | – |

Authorization **wajib ditegakkan di backend**, bukan hanya menyembunyikan menu (sesuai PDF §11 modul 14).

---

## 9. Desain Capture Worker

**Prinsip:** backend tidak pernah menyentuh browser. Worker terpisah.

- Worker = proses Python + FastAPI internal, listen `127.0.0.1:8010` saja.
- Autentikasi: header `X-Worker-Token` (secret di `.env`, dirotasi per deployment).
- Playwright launch `headless=False` — **operator harus melihat browser** untuk login manual.
- Worker **tidak** mengisi form login. Tidak ada endpoint untuk itu.
- Worker memblokir navigasi ke URL di luar `source_url` origin aplikasi yang diotorisasi (allowlist per sesi).
- Setiap screenshot: simpan PNG + JSON metadata (url, title, viewport, timestamp, hash).
- Masking: region disimpan sebagai `screen_elements.mask = true`, lalu disajikan sebagai gambar yang sudah diblok (Pillow) — file asli tetap privat, tidak pernah dirutekan ke publik.
- Upload file dibatasi tipe & ukuran; path disusun server-side (tidak ada input path dari client).

**Batasan yang harus disadari now:** bila sistem dipasang di server, operator tidak bisa melihat browser tanpa remote display (noVNC / Xvfb). Desain default Phase 1 = worker jalan di **mesin operator** (lokal). Ini keputusan yang perlu dikonfirmasi (§13).

---

## 10. Threat Model Singkat

| ID | Ancaman | Dampak | Mitigasi |
|---|---|---|---|
| T1 | Screenshot membawa data pelanggan asli lalu dipublikasikan | Kebocoran data | Masking wajib + `review_status` wajib `approved` sebelum dipakai module lain |
| T2 | Kredensial produksi tersimpan di NigmaSim | Kompromi aplikasi sumber | Tidak ada kolom kredensial; login manual; tidak ada autofill |
| T3 | HTML/JS hasil capture dieksekusi → XSS di admin | Eksekusi kode di origin admin | Capture tidak menyimpan HTML; screenshot = PNG; metadata = JSON tervalidasi; CSP ketat |
| T4 | SSRF lewat `source_url` | Akses jaringan internal | `source_url` hanya boleh http/https, host di-allowlist, worker menolak IP privat |
| T5 | IDOR — user akses project aplikasi lain | Kebocoran aset | Otorisasi per-resource di backend, bukan hanya per-endpoint |
| T6 | Simulation runtime memanggil API produksi | Data produksi tercemar | Origin terpisah + CSP `connect-src 'self'` (diterapkan saat Phase 4, aturannya didokumentasikan sekarang) |
| T7 | Export offline membawa secret | Kebocoran | Export whitelist file, tanpa `.env`, tanpa token |
| T8 | Audit trail hilang | Tidak bisa investigasi | `audit_logs` append-only, tidak ada endpoint delete |
| T9 | Refresh token dicuri | Pengambilalihan akun | Disimpan sebagai hash, rotasi, revoke saat logout |
| T10 | File upload berisi malware | Eksekusi di server | Validasi MIME + ekstensi, disimpan di luar webroot, tidak dieksekusi |

---

## 11. Daftar File Phase 1 & Urutan Implementasi

**Sprint 1.1 — Fondasi (backend)**
1. `backend/pyproject.toml`, `backend/app/core/config.py`
2. `backend/app/core/security.py` (hash Argon2, JWT)
3. `backend/app/db/session.py`, `base.py`
4. `backend/app/models/{role,user,refresh_token}.py`
5. `backend/alembic/versions/0001_initial_auth.py`
6. `backend/app/repositories/{user,role}_repository.py`
7. `backend/app/services/auth_service.py`
8. `backend/app/api/v1/{auth,users,roles}.py`, `backend/app/api/deps.py`
9. `backend/app/main.py`
10. `backend/tests/test_auth.py`, `test_users.py`

**Sprint 1.2 — Registry**
11. `backend/app/models/{application,project}.py`
12. `backend/alembic/versions/0002_registry.py`
13. `backend/app/{schemas,repositories,services}/application_*`, `project_*`
14. `backend/app/api/v1/{applications,projects}.py`
15. `backend/app/services/audit_service.py`
16. `backend/tests/test_applications.py`, `test_projects.py`

**Sprint 1.3 — Capture metadata**
17. `backend/app/models/{capture_session,screen,screen_element,interaction}.py`
18. `backend/alembic/versions/0003_capture.py`
19. `backend/app/api/v1/{capture_sessions,screens,elements,interactions}.py`
20. `backend/tests/test_capture_metadata.py`

**Sprint 1.4 — Capture Worker**
21. `capture-worker/src/config.py`, `main.py` (internal API + token)
22. `capture-worker/src/browser.py` (Playwright session mgr, allowlist)
23. `capture-worker/src/capture.py` (screenshot + metadata JSON)
24. `capture-worker/src/masking.py` (Pillow redaction)
25. `capture-worker/src/recorder.py` (event → interaction)
26. `backend/app/workers/capture_client.py` (proxy)
27. `capture-worker/tests/`

**Sprint 1.5 — Frontend admin**
28. `frontend/` setup (Vite, TS, Tailwind, router, api client, auth guard)
29. `pages/Login.tsx`, `layouts/AdminLayout.tsx` (dark sidebar)
30. `pages/Dashboard.tsx` (kosong tapi benar)
31. `pages/Users.tsx`, `pages/Roles.tsx`
32. `pages/Applications.tsx` (+ form, detail, status otorisasi)
33. `pages/Projects.tsx`
34. `pages/CaptureStudio.tsx` (start/pause/resume/stop/capture/save)
35. `pages/ScreenRepository.tsx` (grid, filter, tag, review, masking UI)
36. `components/` (Table, Modal, Form, Badge, Toast, EmptyState)

**Sprint 1.6 — Deploy & dokumentasi**
37. `deploy/docker/docker-compose.yml`, Dockerfile ×3
38. `deploy/nginx/default.conf`
39. `.env.example`, `README.md`
40. `docs/01-INSTALL.md`, `docs/02-API.md`

---

## 12. Yang Ditunda (dengan alasan)

| Item | Alasan | Ditangani di |
|---|---|---|
| Login SSO/LDAP | Belum ada requirement teknis dari tim IT | Phase 1 lanjutan bila diminta |
| Remote browser viewing (noVNC) | Perlu keputusan lokasi worker | Menunggu jawaban §13 |
| Streaming layar realtime | Tidak dibutuhkan untuk capture | Di luar MVP |
| Soft-delete screens + restore | Belum perlu sebelum ada data nyata | Phase 2 |
| PostgreSQL | SQLite cukup untuk MVP | Sebelum production |
| Rate limiting | Ditambahkan saat deploy publik | Phase 7 |
| Versi capture (compare) | Phase 2 (Screen Repository penuh) | Phase 2 |

---

## 13. Pertanyaan yang Memblokir Implementasi

1. **Lokasi Capture Worker.** Jalan di laptop operator (browser terlihat langsung) atau di server (butuh noVNC)? Ini menentukan desain Sprint 1.4.
2. **Izin install Python 3.12** di mesin ini, atau backend dikembangkan di mesin/VM lain?
3. **Siapa aplikasi pilot** yang resmi diizinkan untuk di-capture? Diperlukan minimal nama + URL + bukti otorisasi sebelum Sprint 1.4 diuji nyata.
4. **Kebijakan penyimpanan file.** Berapa lama screenshot disimpan, dan di mana backup-nya?
5. **Domain untuk demo publik nanti** — sudah ada domain terpisah untuk runtime simulasi?

Pertanyaan ini **tidak menghalangi** Sprint 1.1–1.3 (bisa jalan dengan data uji), tetapi menghalangi uji nyata capture.

---

## 14. Acceptance Test Phase 1

Berdasarkan PDF §9, disaring untuk lingkup Phase 1:

- [ ] Admin bisa login, logout, dan refresh token; token kedaluwarsa ditolak.
- [ ] Role tanpa permission mendapat `403`, bukan hanya menu disembunyikan.
- [ ] Admin bisa mendaftarkan aplikasi; aplikasi berstatus `pending` tidak bisa dipakai capture (`409`).
- [ ] Setelah otorisasi `approved`, project bisa dibuat di bawah aplikasi.
- [ ] Operator bisa start browser, login manual, dan screenshot tersimpan dengan metadata lengkap.
- [ ] Pause/resume/stop bekerja dan status sesi konsisten.
- [ ] Screenshot bisa dimasking; versi tersaji tidak menampilkan region terlarang.
- [ ] Screen bisa diberi tag, catatan, dan status review; reviewer bisa approve/reject.
- [ ] Interaksi tercatat berurutan dan bisa diubah.
- [ ] Semua aksi tulis tercatat di `audit_logs`.
- [ ] Tidak ada endpoint yang mengembalikan atau menyimpan kredensial aplikasi sumber.
- [ ] Uji jaringan: selama capture, tidak ada request dari backend NigmaSim ke domain aplikasi sumber (hanya worker, hanya atas aksi operator).
- [ ] `pytest` hijau; `alembic upgrade head` dari database kosong berhasil.

---

## 15. Perkiraan Usaha

| Sprint | Isi | Perkiraan |
|---|---|---|
| 1.1 | Fondasi + auth + user/role | 2–3 hari kerja |
| 1.2 | Registry + audit | 2–3 hari |
| 1.3 | Metadata capture | 2 hari |
| 1.4 | Capture worker (Playwright) | 3–4 hari |
| 1.5 | Frontend admin | 4–5 hari |
| 1.6 | Docker, Nginx, dokumentasi | 2 hari |
| — | QA & perbaikan | 2–3 hari |
| **Total** | | **± 3 minggu** untuk 1 developer |

Perkiraan ini mengasumsikan requirement tidak berubah di tengah jalan dan aplikasi pilot sudah tersedia untuk diuji.

---

## 16. Langkah Berikutnya

1. Anda review dokumen ini.
2. Jawab pertanyaan §13 (minimal nomor 1 dan 2).
3. Setelah disetujui → implementasi Sprint 1.1.
4. Setiap sprint selesai: jalankan tes, review, lalu commit ke Git.

---

## 17. Catatan Progres

| Tanggal | Sprint | Hasil | Bukti |
|---|---|---|---|
| 11 Nov 2026 | 1.1 | Backend FastAPI, auth JWT + refresh rotation, Argon2id, RBAC, user & role CRUD, audit log, migrasi Alembic | 20 pytest lulus |
| 11 Nov 2026 | 1.2 | Application Registry (daftar, detail, otorisasi capture, hapus), Project per aplikasi, aturan "harus approved sebelum project dibuat" | 20 pytest lulus |
| 11 Nov 2026 | 1.5 (bagian) | Frontend admin: login, dashboard, registry, detail aplikasi, user management, halaman status untuk modul yang belum jadi | build Vite lulus, alur penuh diuji lewat browser |
| — | 1.3 | Metadata capture (screen, element, interaksi) — model sudah ada, endpoint belum | menyusul |
| — | 1.4 | Capture Worker (Playwright + Chromium) | menyusul |

Catatan mesin: Rollup native diblokir Windows Application Control, digantikan build WASM resmi
lewat npm `overrides`. Detail ada di `docs/01-INSTALASI-DAN-MENJALANKAN.md` §6.
