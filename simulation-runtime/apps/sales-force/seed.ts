export type CustomerType = 'Retail' | 'Corporate' | 'Government'
export type CustomerStatus = 'Aktif' | 'Prospek' | 'Nonaktif'

export interface Customer {
  id: string
  name: string
  company: string
  email: string
  phone: string
  type: CustomerType
  status: CustomerStatus
  province: string
  city: string
  /** Tanggal ISO (YYYY-MM-DD). */
  createdAt: string
}

/** Provinsi -> kota. Dipakai untuk dropdown bertingkat (dependsOn). */
export const LOCATIONS: Record<string, string[]> = {
  'DKI Jakarta': ['Jakarta Pusat', 'Jakarta Selatan', 'Jakarta Barat'],
  'Jawa Barat': ['Bandung', 'Bekasi', 'Bogor', 'Depok'],
  'Jawa Tengah': ['Semarang', 'Solo', 'Magelang'],
  'Jawa Timur': ['Surabaya', 'Malang', 'Kediri'],
  Bali: ['Denpasar', 'Badung', 'Singaraja'],
  'Sumatera Utara': ['Medan', 'Binjai', 'Pematangsiantar'],
}

export const CUSTOMER_TYPES: CustomerType[] = ['Retail', 'Corporate', 'Government']
export const CUSTOMER_STATUSES: CustomerStatus[] = ['Aktif', 'Prospek', 'Nonaktif']

type SeedRow = Omit<Customer, 'id' | 'createdAt' | 'phone'>

const RAW: SeedRow[] = [
  { name: 'Andi Pratama', company: 'PT Sinar Nusantara', email: 'andi.pratama@example.test', type: 'Retail', status: 'Aktif', province: 'DKI Jakarta', city: 'Jakarta Selatan' },
  { name: 'Budi Santoso', company: 'CV Mitra Karya', email: 'budi.santoso@example.test', type: 'Corporate', status: 'Prospek', province: 'Jawa Barat', city: 'Bandung' },
  { name: 'Citra Lestari', company: 'PT Global Niaga', email: 'citra.lestari@example.test', type: 'Corporate', status: 'Aktif', province: 'Jawa Timur', city: 'Surabaya' },
  { name: 'Dewi Anggraini', company: 'Koperasi Sejahtera', email: 'dewi.anggraini@example.test', type: 'Retail', status: 'Nonaktif', province: 'Jawa Tengah', city: 'Semarang' },
  { name: 'Eko Nugroho', company: 'PT Prima Teknologi', email: 'eko.nugroho@example.test', type: 'Corporate', status: 'Aktif', province: 'DKI Jakarta', city: 'Jakarta Pusat' },
  { name: 'Fitri Handayani', company: 'CV Cahaya Abadi', email: 'fitri.handayani@example.test', type: 'Retail', status: 'Aktif', province: 'Bali', city: 'Denpasar' },
  { name: 'Gilang Ramadhan', company: 'PT Andalan Logistik', email: 'gilang.ramadhan@example.test', type: 'Corporate', status: 'Prospek', province: 'Sumatera Utara', city: 'Medan' },
  { name: 'Hana Permata', company: 'Toko Sumber Rejeki', email: 'hana.permata@example.test', type: 'Retail', status: 'Aktif', province: 'Jawa Barat', city: 'Bekasi' },
  { name: 'Irfan Maulana', company: 'Dinas Perdagangan', email: 'irfan.maulana@example.test', type: 'Government', status: 'Aktif', province: 'Jawa Tengah', city: 'Solo' },
  { name: 'Jihan Salsabila', company: 'PT Karya Mandiri', email: 'jihan.salsabila@example.test', type: 'Corporate', status: 'Nonaktif', province: 'Jawa Timur', city: 'Malang' },
  { name: 'Kevin Wijaya', company: 'CV Digital Cipta', email: 'kevin.wijaya@example.test', type: 'Retail', status: 'Prospek', province: 'DKI Jakarta', city: 'Jakarta Barat' },
  { name: 'Lestari Wulandari', company: 'PT Bumi Hijau', email: 'lestari.wulandari@example.test', type: 'Corporate', status: 'Aktif', province: 'Jawa Barat', city: 'Bogor' },
  { name: 'Made Suardana', company: 'UD Bali Indah', email: 'made.suardana@example.test', type: 'Retail', status: 'Aktif', province: 'Bali', city: 'Badung' },
  { name: 'Nur Aisyah', company: 'PT Sentosa Jaya', email: 'nur.aisyah@example.test', type: 'Corporate', status: 'Aktif', province: 'Sumatera Utara', city: 'Binjai' },
  { name: 'Oscar Simanjuntak', company: 'CV Tunas Baru', email: 'oscar.simanjuntak@example.test', type: 'Retail', status: 'Nonaktif', province: 'Sumatera Utara', city: 'Pematangsiantar' },
  { name: 'Putri Maharani', company: 'PT Cipta Kreasi', email: 'putri.maharani@example.test', type: 'Corporate', status: 'Prospek', province: 'Jawa Tengah', city: 'Magelang' },
  { name: 'Qori Ramadhan', company: 'Dinas Koperasi', email: 'qori.ramadhan@example.test', type: 'Government', status: 'Aktif', province: 'Jawa Barat', city: 'Depok' },
  { name: 'Rizky Febrian', company: 'PT Anugrah Sejati', email: 'rizky.febrian@example.test', type: 'Corporate', status: 'Aktif', province: 'Jawa Timur', city: 'Kediri' },
  { name: 'Sari Dewanti', company: 'Toko Berkah Jaya', email: 'sari.dewanti@example.test', type: 'Retail', status: 'Aktif', province: 'DKI Jakarta', city: 'Jakarta Selatan' },
  { name: 'Taufik Hidayat', company: 'PT Mega Sarana', email: 'taufik.hidayat@example.test', type: 'Corporate', status: 'Prospek', province: 'Jawa Barat', city: 'Bandung' },
  { name: 'Umi Kalsum', company: 'CV Rahayu', email: 'umi.kalsum@example.test', type: 'Retail', status: 'Aktif', province: 'Jawa Tengah', city: 'Semarang' },
  { name: 'Vina Oktaviani', company: 'PT Lintas Data', email: 'vina.oktaviani@example.test', type: 'Corporate', status: 'Aktif', province: 'Jawa Timur', city: 'Surabaya' },
  { name: 'Wahyu Setiawan', company: 'Dinas Pendidikan', email: 'wahyu.setiawan@example.test', type: 'Government', status: 'Nonaktif', province: 'Bali', city: 'Singaraja' },
  { name: 'Yuni Kartika', company: 'PT Sinar Mas Digital', email: 'yuni.kartika@example.test', type: 'Corporate', status: 'Aktif', province: 'DKI Jakarta', city: 'Jakarta Pusat' },
]

const BASE_DATE = Date.UTC(2026, 0, 5)

function isoDate(dayOffset: number): string {
  return new Date(BASE_DATE + dayOffset * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Seed deterministik: 24 pelanggan sintetis.
 * Tidak memakai Math.random / tanggal "sekarang" supaya reset selalu
 * menghasilkan data yang sama.
 */
export function seedCustomers(): Customer[] {
  return RAW.map((row, index) => ({
    id: `cust-${String(index + 1).padStart(2, '0')}`,
    ...row,
    phone: `+62 812-0000-${String(index + 1).padStart(4, '0')}`,
    createdAt: isoDate(index * 12),
  }))
}

export const SEED_COUNT = RAW.length
