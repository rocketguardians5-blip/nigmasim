# Asumsi Simulasi — Demo Client

Dokumen ini dihasilkan otomatis oleh NigmaSim Simulation Generator.
Simulasi dibangun HANYA dari rekonstruksi yang sudah disetujui manusia.

- Slug: `demo-client-api-nigma`
- Dibuat: 2026-11-24T09:57:01Z
- Layar dibuat: 3
- Layar gagal: 1
- Versi layar dilewati: 6

## Asumsi per layar

### API Nigma Portal (`/login`)

- **[low] Aturan bisnis** (sudah ditinjau): Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib diisi manual oleh pemilik proses.
- **[high] Layout** (sudah ditinjau): Tampilan halaman berupa form login terpusat (centered card design) tanpa sidebar atau header navigasi atas.
- **[high] Form** (sudah ditinjau): Form login berisi input email/username, password dengan toggle visibilitas, checkbox ingat saya, link lupa password, dan tombol submit utama.

### API Nigma Portal Overview (`/dashboard`)

- **[low] Aturan bisnis** (sudah ditinjau): Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib diisi manual oleh pemilik proses.
- **[high] Layout** (sudah ditinjau): Aplikasi memiliki sidebar kiri tetap dengan lebar 256px dan area konten utama yang dapat di-scroll.
- **[high] Komponen** (sudah ditinjau): Kartu layanan mikro dan kartu statistik memberikan visualisasi cepat status operasional dan statistik gateway.

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

- **Masuk ke Portal - API Nigma** (screen id 4, capture v2): Versi capture v2 dilewati (status draft); memakai v3 yang sudah disetujui.
- **Masuk ke Portal - API Nigma** (screen id 3, capture v1): Versi capture v1 dilewati (status belum ada rekonstruksi); memakai v3 yang sudah disetujui.
- **Dashboard Overview - API Nigma Portal - Developer API Gateway** (screen id 5, capture v1): Versi capture v1 dilewati (status approved); memakai v2 yang sudah disetujui.
- **API Playground - Interactive HTTP Client - Developer API Gateway** (screen id 11, capture v3): Versi capture v3 dilewati (status draft); memakai v2 yang sudah disetujui.
- **API Playground - Interactive HTTP Client - Developer API Gateway** (screen id 6, capture v1): Versi capture v1 dilewati (status draft); memakai v2 yang sudah disetujui.
- **Katalog Referensi Kode Error - API Nigma - Developer API Gateway** (screen id 12, capture v2): Versi capture v2 dilewati (status belum ada rekonstruksi); memakai v1 yang sudah disetujui.
