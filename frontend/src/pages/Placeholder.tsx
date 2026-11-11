import { Alert, Card, PageHeader } from '../components/ui'

const MODULES: Record<string, { title: string; phase: string; body: string }> = {
  '/capture': {
    title: 'Capture Studio',
    phase: 'Phase 1 — sedang dibangun',
    body:
      'Operator akan membuka browser Chromium yang dikendalikan Playwright, melakukan login secara manual, lalu mengambil screenshot beserta metadata setiap halaman. NigmaSim tidak pernah mengisi atau menyimpan kredensial aplikasi sumber.',
  },
  '/screens': {
    title: 'Screen Repository',
    phase: 'Phase 2',
    body:
      'Galeri seluruh layar yang tertangkap beserta versi capture, tag, catatan, dan status review. Region sensitif dapat dimasking sebelum aset disimpan permanen.',
  },
  '/reconstruction': {
    title: 'UI Reconstruction',
    phase: 'Phase 3',
    body:
      'AI akan membantu membaca struktur layar dan menyusun draft komponen React. Hasilnya wajib direview manusia — screenshot tidak dapat mengungkap aturan bisnis tersembunyi.',
  },
  '/simulation': {
    title: 'Simulation Builder',
    phase: 'Phase 4',
    body:
      'Membangun halaman simulasi yang berfungsi penuh: form, tabel, pencarian, filter, pagination, modal, validasi, dan CRUD dengan data dummy.',
  },
  '/workflow': {
    title: 'Workflow Builder',
    phase: 'Phase 5',
    body:
      'Mengatur status dan transisi simulasi, misalnya Draft → Submitted → Approved → Rejected. Semua transisi hanya mengubah data simulasi.',
  },
  '/tutorial': {
    title: 'Tutorial Builder',
    phase: 'Phase 5',
    body:
      'Menyusun panduan langkah demi langkah dengan spotlight pada elemen tertentu, tombol Next/Back, dan indikator progres.',
  },
  '/documentation': {
    title: 'Documentation Generator',
    phase: 'Phase 6',
    body:
      'Menghasilkan user guide dan SOP dari langkah tutorial yang telah direview, dalam format PDF, HTML, dan Markdown.',
  },
  '/demos': {
    title: 'Published Demos',
    phase: 'Phase 7',
    body:
      'Mempublikasikan versi demo ke origin terpisah, dengan akses publik atau privat, password, masa berlaku, dan URL yang dapat dibagikan.',
  },
  '/analytics': {
    title: 'Analytics',
    phase: 'Phase 7',
    body:
      'Statistik kunjungan demo, screen yang paling sering dilihat, dan tingkat penyelesaian walkthrough. Tidak ada data pribadi sensitif yang dikumpulkan.',
  },
  '/settings': {
    title: 'Settings',
    phase: 'Phase 1 — sebagian',
    body:
      'Konfigurasi platform, environment, dan preferensi capture. Pengaturan produksi dan deployment dikelola terpisah di sisi server.',
  },
}

export function PlaceholderPage({ path }: { path: string }) {
  const module = MODULES[path] ?? {
    title: 'Modul',
    phase: 'Belum dibangun',
    body: 'Modul ini belum tersedia pada fase saat ini.',
  }

  return (
    <div>
      <PageHeader title={module.title} description={module.phase} />
      <Card>
        <Alert tone="info" title="Modul belum selesai">
          {module.body}
        </Alert>
        <p className="mt-4 text-sm text-slate-500">
          Halaman ini sengaja menampilkan status, bukan tampilan kosong — agar tidak disalahartikan
          sebagai modul yang sudah jadi.
        </p>
      </Card>
    </div>
  )
}
