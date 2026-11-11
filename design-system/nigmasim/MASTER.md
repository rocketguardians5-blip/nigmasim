# Design System — NigmaSim

**Status:** sumber kebenaran visual untuk seluruh admin NigmaSim.
**Berlaku untuk:** `frontend/` (Admin) dan `simulation-runtime/` (Phase 4).
**Dilarang untuk:** Phase 3 UI Reconstruction (harus meniru screenshot asli).

---

## Prinsip

Tampilan admin harus terlihat seperti **produk enterprise yang dibuat orang**, bukan
seperti halaman yang dibuat AI. Bedanya bukan pilihan warna — bedanya adalah **disiplin**.

Ciri "tampak AI" yang dilarang:

| Terlihat AI | Ganti dengan |
|---|---|
| Tombol gradient ungu/biru neon | Satu warna solid, tanpa gradient |
| Card glassmorphism / backdrop blur | Border 1px, tanpa blur |
| `rounded-2xl` di mana-mana | Radius kecil dan seragam |
| Ikon bulat berwarna + emoji | Ikon garis 16px dari satu set |
| Label kapital kecil `tracking-widest` di tiap kolom | Teks biasa, hierarki dari ukuran & warna |
| Card grid seragam dengan bayangan tebal | Border, bukan shadow |
| Teks businessmen seperti "🚀 Mulai Sekarang" | Bahasa kerja, tenang |
| Angka tidak rata | `tabular-nums` |
| Spasi lega berlebihan | Padding 16–20px, rapat |
| Hover yang menggeser layout | Hanya perubahan warna |

---

## Token

### Warna

| Peran | Nilai | Pakai untuk |
|---|---|---|
| `ink-900` | `#111827` | Sidebar |
| `ink-950` | `#0A0F1A` | Latar sidebar terdalam |
| `surface` | `#FFFFFF` | Kartu, panel |
| `canvas` | `#F8FAFC` | Latar halaman |
| `border` | `#E2E8F0` | Garis 1px |
| `border-strong` | `#CBD5E1` | Input, tabel header |
| `text-primary` | `#0F172A` | Judul, data |
| `text-secondary` | `#475569` | Label, deskripsi |
| `text-muted` | `#94A3B8` | Metadata, placeholder |
| `accent` | `#2563EB` | Aksi utama, status aktif |
| `accent-hover` | `#1D4ED8` | Hover aksi utama |
| `success` | `#059669` | Status approved |
| `warning` | `#D97706` | Status pending |
| `danger` | `#DC2626` | Status revoked, hapus |

**Aturan warna:**
- Maksimal **satu** warna aksen (biru) + warna status seperlunya.
- Tidak ada warna dekoratif. Warna hanya bermakna (status, aksi, prioritas).
- Kontras teks minimal **4.5:1**, teks utama di atas `#94A3B8`.

### Tipografi

| Peran | Nilai |
|---|---|
| Font | Inter (fallback Segoe UI / system-ui) |
| Judul halaman | 18px / 600 |
| Judul kartu | 14px / 600 |
| Isi | 14px / 400 |
| Label form | 13px / 500 |
| Metadata | 12px / 400 |
| Angka | `font-variant-numeric: tabular-nums` |

**Aturan tipografi:**
- Tidak ada `uppercase` + `tracking-widest` untuk label. Label ditulis normal, 13px, medium.
- Maksimal 3 tingkat dalam satu tampilan: judul → label → metadata.
- Panjang baris maksimal comfortable ~75ch untuk teks panjang.

### Bentuk

| Token | Nilai | Catatan |
|---|---|---|
| Radius input/button | 5px | |
| Radius card/panel | 8px | |
| Radius badge/pill | `9999px` | hanya untuk badge status kecil |
| Border | 1px `#E2E8F0` | lebih banyak border daripada shadow |
| Shadow | hanya overlay | dropdown & modal boleh; kartu tidak |

### Spasi

Skala: 4 / 8 / 12 / 16 / 20 / 24 / 32 px.
Padding kartu 20px (desktop), 16px (mobile). Jarak antar-field 12px. Jarak antar-seksi 24px.

### Motion

| Token | Nilai |
|---|---|
| Transisi | 150ms |
| Easing | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Radius transisi | 4px (tidak ada bounce, tidak ada spring) |

Selalu hormati `prefers-reduced-motion`.

### Ikon

- Satu set: **Phosphor / Lucide** (garis 1.75, viewBox 24, ukuran 16px default, 20px di sidebar).
- **Dilarang** emoji sebagai ikon.
- **Dilarang** ikon di dalam lingkaran berwarna.

---

## Komponen

| Komponen | Aturan |
|---|---|
| Tombol utama | Solid `accent`, teks putih, radius 5px, tanpa shadow, tanpa gradient |
| Tombol sekunder | Latar putih, border 1px `#CBD5E1`, teks `#334155` |
| Tombol bahaya | Solid `#DC2626`, hanya untuk hapus |
| Card | Latar putih, border 1px `#E2E8F0`, radius 8px, **tanpa shadow** |
| Input | Border 1px `#CBD5E1`, radius 5px, fokus → border accent + ring 1px, tanpa glow |
| Label | Selalu ada (bukan placeholder) — wajib terlihat |
| Badge status | Pill kecil 12px, warna hanya sesuai status |
| Tabel | Header kapital **tidak**; header 12px `text-secondary`, baris 44px, angka tabular |
| Empty state | Satu kalimat tenang + satu aksi. Tidak ada emoji, tidak ada ilustrasi |
| Modal | Overlay gelap 50%, radius 8px, shadow hanya di sini |
| Toast/Alert | Border 1px + latar sangat muda, teks 12px |

---

## Larangan (tegas)

- Gradient di mana pun.
- Glassmorphism, backdrop blur, neumorphism.
- Neon, ungu/pink, warna-warna "AI".
- Emoji sebagai ikon.
- Radius > 10px pada elemen apa pun (kecuali pill).
- Bayangan pada kartu.
- Label kapital kecil dengan `tracking-widest`.
- Animasi lebih dari 200ms, bounce, spring.
- Halaman yang terlihat selesai padahal modulnya belum ada — gunakan pola status jujur.

---

## Proses

1. Baca aturan di file ini **sebelum** menulis komponen.
2. Kalau  ada permintaan yang bertentangan dengan master prompt §15 — master prompt menang.
3. Skill desain pihak ketiga boleh dipakai untuk mencari/check, **tidak** menentukan gaya.
4. Setelah mengubah tampilan, periksa: kontras, focus state, 375 / 768 / 1024 / 1440 px.
