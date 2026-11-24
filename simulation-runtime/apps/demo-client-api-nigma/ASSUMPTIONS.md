# Asumsi Simulasi — Demo Client

Dokumen ini dihasilkan otomatis oleh NigmaSim Simulation Generator.
Simulasi dibangun HANYA dari rekonstruksi yang sudah disetujui manusia.

- Slug: `demo-client-api-nigma`
- Dibuat: 2026-11-23T05:26:00Z
- Layar dibuat: 3
- Layar gagal: 1
- Versi layar dilewati: 2

## Asumsi per layar

### API Nigma Portal (`/login`)

- **[low] Aturan bisnis** (sudah ditinjau): Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib diisi manual oleh pemilik proses.
- **[high] Layout** (sudah ditinjau): Halaman login terpusat (single-card layout) dengan latar belakang bernuansa terang dan lembut.
- **[high] Komponen** (sudah ditinjau): Tersedia tombol auto-fill demo untuk mempercepat pengisian akun pengujian default.
- **[high] Aturan bisnis** (sudah ditinjau): Kredensial bawaan admin@nigma.id / password dapat digunakan untuk login ke portal.

### Dashboard Overview - API Nigma Portal - Developer API Gateway (`/dashboard`)

- **[low] Aturan bisnis** (sudah ditinjau): Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib diisi manual oleh pemilik proses.
- **[high] Layout** (sudah ditinjau): Sidebar bersifat statis di kiri, header berisi navigasi global dan profil.
- **[high] Komponen** (sudah ditinjau): Elemen dengan teks 'Playground' di dalam kartu adalah link navigasi ke halaman playground spesifik.

### Katalog Referensi Kode Error - API Nigma - Developer API Gateway (`/error-codes`)

- **[low] Aturan bisnis** (sudah ditinjau): Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib diisi manual oleh pemilik proses.
- **[high] Layout** (sudah ditinjau): Sidebar menggunakan navigasi vertikal, area utama berisi tabel data dengan filter pencarian.
- **[medium] Komponen** (sudah ditinjau): Ikon tempat sampah pada tabel diasumsikan sebagai tombol hapus.

## Asumsi umum

- Seluruh data pada simulasi ini fiktif dan dihasilkan deterministik dari slug + nama dataset.
- Simulasi tidak memanggil API asli dan tidak menyimpan kredensial aplikasi sumber.
- Tombol yang tidak punya aturan bisnis eksplisit hanya menampilkan notifikasi simulasi.
- Tabel, kolom, dan field diambil dari rekonstruksi yang disetujui; field yang tidak terlihat tidak ditambahkan.
- Data tabel disimpan di IndexedDB browser dan bisa dikembalikan ke seed lewat tombol reset runtime.

## Layar yang gagal dibuat

- **API Playground - Interactive HTTP Client - Developer API Gateway**: Rekonstruksi tidak punya komponen atau section yang bisa dipakai.

## Versi layar yang dilewati

- **Masuk ke Portal - API Nigma** (screen id 3, capture v1): Versi capture v1 dilewati (status belum ada rekonstruksi); memakai v2 yang sudah disetujui.
- **API Playground - Interactive HTTP Client - Developer API Gateway** (screen id 6, capture v1): Versi capture v1 dilewati (status draft); memakai v2 yang sudah disetujui.
