# NigmaSim · Simulation Runtime

Runtime simulasi **hidup**: setiap simulasi adalah aplikasi React sungguhan dengan
data store lokal, bukan sekadar tangkapan layar. Runtime ini berdiri sendiri di
origin/port terpisah dari aplikasi admin NigmaSim.

- **Lobby** (`shell/`) — katalog kartu simulasi dari `registry.json`.
- **Apps** (`apps/<slug>/`) — satu aplikasi React per simulasi.
- **sim-core** (`packages/sim-core/`) — store, seed, reset, validasi, dan komponen UI bersama.
- **Isolasi** — tidak ada proxy `/api`, tidak ada request ke backend admin atau API produksi.
  Semua data sintetis dan disimpan di browser.

---

## Menjalankan

```powershell
cd simulation-runtime
npm install

npm run dev        # http://localhost:5180 (CSP longgar untuk HMR)
npm run build      # typecheck + build produksi
npm run preview    # http://127.0.0.1:5180 dengan CSP ketat
npm run test:e2e   # Playwright: build + preview + uji isolasi jaringan
```

Login tidak diperlukan. Buka `http://localhost:5180`, pilih kartu simulasi.

---

## Struktur

```
simulation-runtime/
├─ shell/                 # lobby, iframe frame, loader registry
├─ apps/
│  └─ sales-force/        # contoh simulasi: Dashboard, Pelanggan, Form, Detail
├─ packages/sim-core/     # store + komponen bersama (alias @sim/core)
├─ registry.json          # katalog simulasi
├─ tests/                 # Playwright (isolasi jaringan + CSP)
└─ public/_headers        # CSP untuk hosting statis
```

### Menambah simulasi baru

1. Buat folder `apps/<slug>/index.tsx` dengan **default export** komponen React.
2. Tambahkan satu entri di `registry.json`:

```json
{
  "slug": "inventory",
  "name": "Inventory Management",
  "icon": "grid",
  "description": "Kelola stok barang dan mutasi gudang.",
  "path": "/?app=inventory",
  "accent": "#0ea5e9"
}
```

Tidak ada file shell yang perlu diubah. App ditemukan otomatis lewat
`import.meta.glob('../apps/*/index.tsx')` **tanpa `eager`**, sehingga setiap app
menjadi chunk terpisah dan baru diunduh saat dibuka.

Nilai `path` adalah URL runtime untuk app tersebut. Karena build hanya punya satu
HTML entry, app dibuka sebagai `?app=<slug>` di dalam iframe. Navigasi internal
app memakai `HashRouter` (`#/customers`) agar aman untuk hosting statis.

---

## sim-core

Import semuanya dari `@sim/core`:

```ts
import {
  createSimStore, SimUIProvider, useToast, useConfirm,
  DataTable, FormField, Select, Modal, Badge, Button, Card, PageHeader,
  searchRows, filterRows, sortRows, paginate, validateForm, useSimReset,
} from '@sim/core'
```

### Store

```ts
export const useCustomerStore = createSimStore<Customer>('sales-force', seedCustomers)

useCustomerStore.getState().add({ ... })
useCustomerStore.getState().update(id, { ... })
useCustomerStore.getState().remove(id)
useCustomerStore.getState().resetToSeed()
```

- Persistensi: Zustand + IndexedDB, **satu database per app** (`sim-<slug>`).
- Key storage berversi (`sim-store-v1` + envelope `{ v, raw }`). Bila versi data
  tidak cocok, data lama dihapus dan app kembali ke seed — tidak ada state
  setengah valid.
- Bila IndexedDB tidak tersedia (mode privat), app tetap berjalan di memori dan
  menampilkan peringatan.
- `resetToSeed()` selalu membuat objek seed baru, jadi reset berulang tetap
  deterministik.

### Query & validasi

- `searchRows`, `filterRows`, `sortRows`, `paginate` adalah fungsi murni.
- `validateForm(fields, values)` mendukung `required`, `minLength`, `maxLength`,
  `number`, `email`, `pattern`, dan `custom` (mis. email unik case-insensitive).

### Select bertingkat (`dependsOn`)

`Select` menerima opsi dengan `parent`. Bila `dependsOnValue` berubah, opsi
difilter dan nilai lama yang tidak valid otomatis di-reset ke `''`.

```tsx
<Select
  value={values.city}
  onChange={(v) => setField('city', v)}
  options={cityOptions}          // { value, label, parent: 'Jawa Barat' }
  dependsOnValue={values.province}
/>
```

`FieldConfig.dependsOn` dipakai `CustomerForm` untuk menghubungkan **Kota** ke
**Provinsi**.

### Protokol reset lobby ↔ app

- App mengirim `{ type: 'sim:ready', slug }` ke `window.parent` saat mount.
- Lobby mengirim `{ type: 'sim:reset' }` ke `contentWindow` iframe.
- App membalas `{ type: 'sim:reset-done' }`.

Kedua sisi memeriksa `event.origin === location.origin` **dan** `event.source`
(iframe yang benar / parent yang benar). Iframe memakai
`sandbox="allow-scripts allow-same-origin"`. Karena sandbox tidak memberi
`allow-forms`, form simulasi tidak memakai submit native; tombol simpan
memanggil handler React langsung (Enter di input juga ditangani manual).

---

## Keamanan

- CSP ketat pada build/preview (`vite.config.ts` + `public/_headers`):
  `default-src 'self'`, `connect-src 'self'`, `frame-src 'self'`,
  `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`.
- Tidak ada font, ikon, atau script dari CDN. Ikon berupa SVG inline.
- Tidak ada `fetch` ke API produksi/backend admin; tidak ada proxy `/api`.
- Semua data adalah data sintetis (`@example.test`, nama fiktif).
- Dev server memakai CSP yang lebih longgar (inline + websocket) hanya untuk HMR;
  yang diuji Playwright adalah hasil build + preview dengan CSP ketat.

### Batasan isolasi yang perlu diketahui

Semua app saat ini **berbagi satu origin** (`http://localhost:5180`). IndexedDB
memang dipisah per database `sim-<slug>`, tetapi isolasi antar-app **belum
mutlak**: script dari app lain pada origin yang sama secara teknis dapat membuka
database tersebut. Ini dapat diterima untuk demo internal dengan data sintetis.

**Rencana jangka panjang:** setiap app dijalankan pada origin/subdomain sendiri
(mis. `sales-force.sim.internal`) sehingga isolasi storage menjadi mutlak.
Struktur `apps/<slug>/` dan `registry.json` sudah disiapkan untuk migrasi itu.

---

## Pengujian

`tests/no-external-network.spec.ts` menjalankan build + preview (CSP ketat) lalu:

1. mencatat **semua** request dan gagal bila ada origin selain runtime;
2. gagal bila ada console error atau `pageerror`;
3. gagal bila ada pesan/pelanggaran CSP;
4. membuka `sales-force`, menambah pelanggan, memastikan dashboard 24 → 25,
   lalu reset dan memastikan kembali ke 24.

```powershell
npm run test:e2e
```

> Playwright memakai `webServer` yang menjalankan `npm run build && npm run preview`
> di port 5180. Pastikan tidak ada proses lain di port tersebut.

---

## Catatan pengembangan

- Satu project npm (bukan npm workspaces) agar React tidak terduplikasi; alias
  `@sim/core` diatur di `tsconfig.json` dan `vite.config.ts`.
- Tailwind memindai `shell/`, `apps/`, dan `packages/`.
- Port runtime: **5180**. Admin NigmaSim tetap di 5173; backend di 8000.
