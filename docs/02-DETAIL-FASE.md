# Detail Fase Pengembangan NigmaSim

Acuan: `MASTER_PROMPT_NIGMASIM.md` §17 (8 fase) dan `docs/Panduan-Developer-NigmaSim.pdf` §8 (7 fase MVP).
Keduanya describes hal yang sama — hanya batas antara Fase 1 dan Fase 2 yang sedikit berbeda.

Status terakhir: **12 November 2026**

---

## Peta besar

| Fase | Nama | Tujuan satu kalimat | Output yang bisa dilihat | Status |
|---|---|---|---|---|
| 1 | Foundation + Capture Studio | Membangun "mesin" penangkap & freed registry | Admin web, NigmaSim bisa merekam aplikasi | 🟢 Selesai |
| 2 | Screen Repository | Menyimpan & mengelola semua layar yang tertangkap | Galeri layar, versi, review, masking | 🟡 Sebagian |
| 3 | UI Reconstruction | AI + developer membangun ulang tampilan jadi React | Draf halaman React yang mirip aslinya | ⬜ |
| 4 | Full Simulation | Mengubah draf jadi aplikasi yang berfungsi | Form, tabel, CRUD, data dummy | ⬜ |
| 5 | Workflow + Walkthrough | Menambahkan alur approval & tutorial interaktif | Status berputar, tutorial spotlight | ⬜ |
| 6 | SOP Generator | Mengubah langkah menjadi dokumen | PDF/HTML/Markdown SOP | ⬜ |
| 7 | Publishing + Analytics | Membagikan demo ke pihak ketiga | Link demo, password, statistik | ⬜ |
| 8 | Quality Assurance | Membuktikan semua benar & aman | Laporan uji keamanan & performa | ⬜ |

---

## Fase 1 — Foundation + Capture Studio 🟢

**Tujuan:** membangun kerangka platform dan alat untuk mengumpulkan bahan baku.

### Yang dikerjakan

| Bagian | Isi | Status |
|---|---|---|
| Autentikasi | JWT access + refresh berotasi, Argon2id, 5 role | ✅ |
| User & Role | CRUD user, soft disable, reset password | ✅ |
| Application Registry | Daftar aplikasi, **status otorisasi capture**, hapus | ✅ |
| Project | Project di bawah aplikasi, wajib `approved` dulu | ✅ |
| Audit log | Append-only, tercatat untuk semua aksi tulis | ✅ |
| Capture Worker | Playwright + Chromium, headed, allowlist host | ✅ |
| Capture Studio | Buka browser → login manual → ambil screenshot → rekam interaksi | ✅ |
| Screen Repository | Galeri thumbnail, tag, review approve/reject, masking area | ✅ |
| Skema database | 10 tabel + migrasi Alembic | ✅ |
| Frontend admin | 13 menu sesuai master prompt §15 | ✅ |
| Docker Compose + Nginx | Deployment | ⬜ (ditunda: urusan Anda) |

### Hasil
Bisa mendaftarkan aplikasi berizin, merekam 5–10 layar, dan meninjau hasilnya.
**Belum** ada yang bisa didemokan ke klien.

### Yang dibutuhkan dari Anda
- Izin capture untuk aplikasi pilot (nama, URL, nomor rujukan izin)
- Testimoni bahwa login manual + screenshot berjalan di komputer Anda

---

## Fase 2 — Screen Repository 🟡

**Tujuan:** managing layar jadi aset yang rapi dan bisa dipercaya.

### Yang dikerjakan
- Versi capture: simpan ulang layar yang berubah, bandingkan versi lama vs baru
- Kategori & pengelompokan (Dashboard, List, Form, Detail, Popup) — sesuai PDF §6
- Pencarian & filter multi-kriteria (nama, tag, status review, Capture Version)
- Recapture: ulangi capture dengan label yang sama → jadi versi baru
- Relasi antar layar (dari List → Form → Detail)
- Pengaturan retensi & backup file screenshot
- Ekspor daftar layar (CSV/JSON) untuk Vegas

### Yang sudah ada
Galeri, thumbnail, tag, filter, review approve/reject, masking region, hapus layar.

### Yang belum
Versi capture & perbandingan, kategori, relasi layar, retensi/backup.

---

## Fase 3 — UI Reconstruction ⬜

**Tujuan:** mengubah screenshot menjadi **kode React** yang bisa dijalankan.

**Ini fase paling terberat secara teknis dan paling_elem_or butuh review manusia.**

### Yang dikerjakan
| Komponen | Isi |
|---|---|
| Analisis layar | AI membaca screenshot + metadata → susun hierarki komponen (header, sidebar, tabel, form, modal, tab, chart) |
| Draft komponen | Hasilkan React + TypeScript yang bisa diedit, **dengan penanda eksplisit mana yang tebakan AI** |
| Layout & tema | Warna, tipografi, spacing, radius dari screenshot — abide design-system/nigmasim/MASTER.md |
| Navigasi | Peta rute antar halaman dari riwayat interaksi |
| Visual comparison | Tampilkan screenshot asli di sebelah rekonstruksi, berdampingan |
| Review & koreksi | Developer mengoreksi layout, warna, spacing, komponen yang meleset |
| Asumsi terdokumentasi | Setiap asumsi AI ditulis, supaya bisa diverifikasi |

### Batasan penting (dari master prompt §12)
> *"Do not infer hidden business rules from screenshots."*

AI **tidak bisa** tahu aturan bisnis. Yang tidak terbaca dari screenshot harus diisi manual lewat
form konfigurasi (mis. "di atas 20 wajib approval direksi").

### Yang dibutuhkan dari Anda
1. **Aturan bisnis** — daftar aturan yang tidak kelihatan dari screenshot
2. **Review visual** —cek apakah apakah tiap layar "cukup mirip"
3. Keputusan komponen yang perlulibrary baru (mis. library chart)

### Estimasi
± 2 minggu untuk 10 layar (AI mempercepat draf, akurasi final tetap kerja manusia).

---

## Fase 4 — Full Simulation ⬜

**Tujuan:** mengubah halaman yang "cuma statis" jadi **aplikasi yang bisa dipakai**.

**Ini fase terbesar, dan ini yang membuat klien bilang "ini aplikasi kami".**

### Yang dikerjakan
| Bagian | Isi |
|---|---|
| Layout builder | Konfigurasi header, sidebar, navigasi, content area, responsif |
| Component builder | Tombol, input, textarea, dropdown, checkbox, radio, tabel, pagination, search, filter, tab, accordion, modal, notifikasi, chart, dashboard widget |
| Interaksi | Navigasi, buka/tutup modal, submit form, validasi field, ganti tab, filter & sort tabel, CRUD, perubahan status, aksi kondisional |
| Data engine | Dataset JSON per simulasi, skema configurable, import/export, **reset ke data awal**, isolasi antar project |
| State | Empty, loading, success, error untuk tiap komponen |
| Responsive | Desktop, tablet, mobile |

### Aturan main
- Semua interaksi jalan terhadap **data simulasi**, tidak pernah data produksi
- Data awal = data dummy yang masuk akal (mis. 6 risiko contoh, bukan 0)
- Tombol **Reset Simulasi** selalu ada — mengembalikan kondisi awal

### Hasil
Satu simulasi lengkap: 5–10 layar, form yang validasi, tabel yang bisa dicari & diurutkan,
CRUD yang jalan, dan data yang bisa di-reset.

### Yang dibutuhkan dari Anda
1. Contoh data dummy yang mewakili kondisi nyata (nilai, format, panjang teks)
2. Daftar validasi per field (mis. "Nilai Dampak wajib 1–100")
3. Konfirmasi aturan CRUD (boleh hapus? boleh edit yang sudah disetujui?)

### Estimasi
± 3–4 minggu. Paling besar dari semua fase.

---

## Fase 5 — Workflow + Guided Walkthrough ⬜

### 5a. Workflow Engine
| Yang dikerjakan | Isi |
|---|---|
| Definisi status | Draft → Submitted → Under Review → Approved / Rejected / Revision |
| Transisi | Kondisi, peran, dan aksi tiap perpindahan status |
| Riwayat | Setiap transisi tercatat (siapa, kapan, dari status apa ke status apa) |
| Notifikasi dummy | Toast/email palsu di dalam simulasi saja |
| Peran | Simulasi bisa "berpindah peran" — sebagai staf vs manajer |

Contoh: staf klik "Ajukan" → status jadi Submitted → berpindah ke peran manajer → approve/tolak →
kalau ditolak, kembali ke staf untuk revisi.

### 5b. Guided Walkthrough
| Yang dikerjakan | Isi |
|---|---|
| Tutorial builder | Urutan langkah, target element, teks instruksi, screenshot |
| Player | Spotlight (element disorot), tooltip, tombol Next/Back/Skip, progres bar |
| 3 mode | **Guided** (sistem kendali), **Interactive** (user harus klik yang disorot), **Free exploration** |
| Fallback | Kalau target element tidak ada, tampilkan instruksi manual, jangan error |
| Multi tutorial | Beberapa tutorial per aplikasi (mis. "Cara membuat Risiko Baru", "Cara Approval") |

### Yang dibutuhkan dari Anda
1. Diagram alur approval (kondisi → siapa → tindakan)
2. Daftar tutorial yang mau dibuat

### Estimasi
± 2 minggu.

---

## Fase 6 — SOP & Documentation Generator ⬜

**Tujuan:** mengubah langkah tutorial jadi **dokumen resmi** untuk user.

### Yang dikerjakan
- Template dokumen: judul, tujuan, lingkup, prasyarat, peran, langkah bernomor + screenshot + expected result, catatan/peringatan, versi & tanggal
- Sumber = screen yang sudah direview + langkah tutorial yang sudah disetujui
- Editable sebelum publish (admin boleh ubah teks)
- Branding perusahaan & aplikasi (logo, warna, footer)
- Ekspor: **PDF**, **HTML**, **Markdown**
- Storytelling: dari user guide, SOP, panduan modul, panduan per peran, dokumentasi alur

### Yang dibutuhkan dari Anda
Contoh SOP yang sudah ada (jika ada) → jadi acuan format & bahasa.

### Estimasi
± 1,5 minggu.

---

## Fase 7 — Publishing + Analytics ⬜

### 7a. Publishing
| Yang dikerjakan | Isi |
|---|---|
| Link demo | URL publik & privat, per versi |
| Kontrol akses | Password opsional, masa berlaku, enable/disable |
| Skenario demo | Beberapa alur per aplikasi, mis. "Dashboard Overview", "Project Risk Workflow", "Risk Approval Process", "Monthly Risk Reporting" |
| Mode presentasi | Tampilan bersih tanpa menu admin, fullscreen, presenter navigation (untuk sales/presales) |
| Mode public | Tanpa login produksi, data terisolasi, opsional registrasi lead |
| Offline export | Paket statis (HTML/CSS/JS/gambar/JSON) yang jalan tanpa internet — **hanya boleh diklaim setelah diuji offline** |

### 7b. Analytics
Jumlah kunjungan, screen paling sering dilihat, tutorial yang paling sering diselesaikan,
rata-rata durasi demo, skenario mana yang populer, registrasi lead.
**Tanpa** mengumpulkan data pribadi sensitif, dengan pengaturan retensi.

### Yang dibutuhkan dari Anda
1. **Domain terpisah** untuk runtime demo (wajib — biar tidak bisa menjangkau produksi)
2. Keputusan: demo publik terbuka atau selalu butuh password?

### Estimasi
± 2 minggu (+ setup domain & SSL).

---

## Fase 8 — Quality Assurance ⬜

| Uji | Isi |
|---|---|
| Fungsional | Semua tombol, form, navigasi, reset, workflow diuji |
| Visual | Perbandingan simulasi vs screenshot asli (side-by-side) |
| Keamanan | Uji jaringan: demo tidak pernah memanggil API/domain produksi; uji CSP; uji otorisasi per resource |
| Offline | Export dijalankan tanpa koneksi internet |
| Performa | Batas waktu muat halaman, jumlah data, ukuran bundel |
| Dokumentasi | Laporan hasil uji + operator/developer manual |

### Estimasi
± 1 minggu (bukan sprint terpisah, menyatu di setiap fase).

---

## Tangga nilai — apa yang bisa ditunjukkan setelah tiap fase

| Setelah fase | Yang bisa dilihat klien | Nilai jual |
|---|---|---|
| 1 | — | Tool internal |
| 2 | Galeri layar + SOP draf | "Saya punya dokumentasi visual" |
| 3 | Halaman statis yang mirip | "Ini replicate UI kami" |
| 4 | **Simulasi yang bisa diklik** | "Ini aplikasi kami, tapi data aman" |
| 5 | + alur approval + tutorial | "User bisa dilatih tanpa akses sistem" |
| 6 | + SOP PDF | "Dokumentasi kami selesai" |
| 7 | **Link demo untuk prospects** | "Silakan coba sendiri" |
| 8 | + bukti keamanan & performa | "Aman dipakai ke klien" |

**Fase 4 adalah titik balik.** Setelah itu, Anda sudah bisa demo ke klien meskipun Fase 5–7 belum.

---

## Jalur kritis ke demo klien

```
Fase 1 ✅ ─→ Fase 2 ─→ Fase 3 ─→ FASE 4 ──────────────► demo internal
                                     ↑                  │
                                     └── Fase 5,6,7 ───┴──► demo eksternal
```

Fase 3 (rekonstruksi) adalah **bottleneck**: kalau hasilnya tidak mirip, semua fase
berikutnya jadi tidak bermakna. Karena itu di Fase 3, review manusia bukan opsional.

---

## Risiko yang bisa menggagalkan

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Aturan bisnis tidak diberikan | Simulasi terlihat benar tapi salahsaat dipakai → klien mengeluh | Minta rules sebelum Fase 3 ditutup |
| Rekonstruksi kurang mirip | Kredibilitas demo runtuh | Revisi_side-by-side + budget review di Fase 3 |
| Data dummy tidak realistis | Demo terasa "dummy banget" | Minta contoh data nyata (tanpa data sensitif) di awal Fase 4 |
| Izin capturemolor | Fase 2–3 tersendat | Proses izin dimulai sekarang, paralel dengan coding |
| Domain demo belum siap | Fase 7 molor | Putuskan domain sekarang (butuh 1–2 minggu provisioning) |

---

## Rekomendasi urutan kerja

1. **sekarang** → selesaikan Fase 2 (versi capture, kategori, relasi layar)
2. **paralel** → Anda finalize: izin pilot + aturan bisnis + contoh data dummy
3. **lalu** → Fase 3 (rekonstruksi 5–10 layar pertama)
4. **lalu** → Fase 4 (fokus CRUD + 1 approval workflow, cukup untuk demo pertama)
5. **lalu** → sisanya sesuai prioritas penjualan
