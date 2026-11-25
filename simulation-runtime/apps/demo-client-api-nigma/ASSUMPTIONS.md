# Asumsi Simulasi — Demo Client

Dokumen ini dihasilkan otomatis oleh NigmaSim Simulation Generator.
Simulasi dibangun HANYA dari rekonstruksi yang sudah disetujui manusia.

- Slug: `demo-client-api-nigma`
- Dibuat: 2026-11-25T06:49:47Z
- Layar dibuat: 4
- Layar gagal: 0
- Versi layar dilewati: 0

## Asumsi per layar

### API Nigma Portal (`/login`)

- **[low] Aturan bisnis** (sudah ditinjau): Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib diisi manual oleh pemilik proses.
- **[high] Layout** (sudah ditinjau): Halaman login sederhana terpusat di tengah layar tanpa header atau sidebar navigasi.
- **[high] Form** (sudah ditinjau): Form login berisi input Email/Username, Password, Checkbox Ingat Saya, dan tombol submit Masuk ke Portal.

### API Nigma Portal Overview (`/dashboard`)

- **[low] Aturan bisnis** (sudah ditinjau): Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib diisi manual oleh pemilik proses.
- **[high] Layout** (sudah ditinjau): Aplikasi menggunakan tata letak Dasbor standar dengan navigasi sidebar di sebelah kiri dan header ringkas di atas.
- **[medium] Form** (sudah ditinjau): Komponen filter lingkungan pada header berupa dropdown interaktif untuk memilih status Production/Staging.

### API Playground - Interactive HTTP Client - Developer API Gateway (`/playground`)

- **[low] Aturan bisnis** (sudah ditinjau): Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib diisi manual oleh pemilik proses.
- **[high] Layout** (sudah ditinjau): Aplikasi menggunakan skema tiga panel utama: Sidebar navigasi di sebelah kiri, panel Collections dan Request Builder di tengah, serta panel Response Viewer di sebelah kanan.
- **[high] Komponen** (sudah ditinjau): Area Request Builder memungkinkan modifikasi HTTP method, URL endpoint, parameter query, serta pengiriman permintaan ke Gateway secara langsung.

### Katalog Referensi Kode Error - API Nigma - Developer API Gateway (`/error-codes`)

- **[low] Aturan bisnis** (sudah ditinjau): Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib diisi manual oleh pemilik proses.
- **[high] Layout** (sudah ditinjau): Aplikasi menggunakan struktur navigasi sidebar tetap di sisi kiri dan panel kontrol utama di area kanan.
- **[high] Komponen** (sudah ditinjau): Tabel data katalog kesalahan mendukung pencarian waktu nyata, filter berdasarkan proyek, dan penambahan item baru via modal/form.

## Asumsi umum

- Seluruh data pada simulasi ini fiktif dan dihasilkan deterministik dari slug + nama dataset.
- Simulasi tidak memanggil API asli dan tidak menyimpan kredensial aplikasi sumber.
- Tombol yang tidak punya aturan bisnis eksplisit hanya menampilkan notifikasi simulasi.
- Tabel, kolom, dan field diambil dari rekonstruksi yang disetujui; field yang tidak terlihat tidak ditambahkan.
- Data tabel disimpan di IndexedDB browser dan bisa dikembalikan ke seed lewat tombol reset runtime.

## Layar yang gagal dibuat

- Tidak ada.
