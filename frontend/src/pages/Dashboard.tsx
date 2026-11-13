import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { applicationsApi, projectsApi } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { screensApi } from '../lib/capture'
import type { Screen } from '../lib/capture'
import { useAuth } from '../lib/auth'
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner, cn } from '../components/ui'
import { IconChevronLeft, IconChevronRight } from '../components/icons'

interface Product {
  app: Application
  project?: Project
  screens: Screen[]
  latest?: Screen
  image?: string
}

const PHASES = [
  { name: 'Registry + Capture Studio', state: 'selesai' },
  { name: 'Screen Repository', state: 'selesai' },
  { name: 'UI Reconstruction', state: 'selesai' },
  { name: 'Full Simulation', state: 'selesai' },
  { name: 'Workflow + Walkthrough', state: 'selesai' },
  { name: 'SOP Generator', state: 'selesai' },
  { name: 'Publish + Analytics', state: 'selesai' },
]

export function DashboardPage() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Produk yang punya screenshot -> dipakai untuk hero yang berputar
  const heroProducts = useMemo(() => products.filter((p) => p.image), [products])
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)

  // Putar otomatis tiap 5 detik (berhenti saat kursor di area hero)
  useEffect(() => {
    if (heroPaused || heroProducts.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => {
      setHeroIndex((index) => (index + 1) % heroProducts.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [heroPaused, heroProducts.length])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const page = await applicationsApi.list()
        const list = await Promise.all(
          page.items.map(async (app): Promise<Product> => {
            const projects = await projectsApi.listByApplication(app.id)
            const project = projects.items[0]
            if (!project) return { app, screens: [] }
            const screens = await screensApi.list(project.id, { latest_only: true })
            let image: string | undefined
            const latest = screens.items[0]
            if (latest) {
              try {
                image = await screensApi.screenshotUrl(latest.id, true)
              } catch {
                image = undefined
              }
            }
            return { app, project, screens: screens.items, latest, image }
          }),
        )
        if (cancelled) return
        setProducts(list)
        setError(null)
      } catch {
        if (!cancelled) setError('Gagal memuat data dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(
    () => [
      { label: 'Aplikasi terdaftar', value: products.length },
      {
        label: 'Sudah diotorisasi',
        value: products.filter((p) => p.app.authorization_status === 'approved').length,
      },
      {
        label: 'Layar tertangkap',
        value: products.reduce((total, p) => total + p.screens.length, 0),
      },
      { label: 'Simulasi siap demo', value: 0 },
    ],
    [products],
  )

  return (
    <div>
      {/* ---------- Hero ---------- */}
      <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid items-center gap-8 p-6 md:grid-cols-[0.85fr_1.15fr] md:p-10">
          {/* min-w-0: kolom grid harus boleh menyusut, kalau tidak halaman melebar
              di layar HP dan konten terpotong di kanan. */}
          <div className="min-w-0 max-w-xl">
            <Badge tone="info">Platform simulasi aplikasi</Badge>
            <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-slate-900 md:text-4xl">
              Bangun demo produk
              <br />
              tanpa membuka sistem asli
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
              NigmaSim merekonstruksi aplikasi yang{' '}
              <span className="font-medium text-slate-900">sudah Anda otorisasi</span> menjadi
              simulasi interaktif dengan{' '}
              <span className="font-medium text-slate-900">data dummy</span> — aman untuk
              didemokan, dilatih, dan didokumentasikan.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/capture"
                className="inline-flex h-11 items-center rounded-full bg-brand-600 px-6 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Mulai capture
              </Link>
              <Link
                to="/screens"
                className="inline-flex h-11 items-center rounded-full border border-brand-600 px-6 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
              >
                Lihat Screen Repository
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Login {user?.name} · {products.length} aplikasi terdaftar
            </p>
          </div>

          <div
            className="relative min-w-0"
            onMouseEnter={() => setHeroPaused(true)}
            onMouseLeave={() => setHeroPaused(false)}
          >
            {/* Rasio 16:10 = rasio screenshot browser, jadi tidak ada yang terpotong */}
            <div className="relative aspect-[16/10] overflow-hidden rounded-[2rem] bg-slate-100">
              {heroProducts.length === 0 ? (
                <div className="grid h-full place-items-center text-xs text-slate-400">
                  Belum ada screenshot
                </div>
              ) : (
                heroProducts.map((product, index) => (
                  <img
                    key={product.app.id}
                    src={product.image}
                    alt={product.latest?.title ?? product.app.name}
                    className={cn(
                      'absolute inset-0 h-full w-full object-cover object-top transition-all duration-700 ease-out',
                      index === heroIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.05]',
                    )}
                  />
                ))
              )}

              {heroProducts.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Produk sebelumnya"
                    onClick={() =>
                      setHeroIndex((index) => (index - 1 + heroProducts.length) % heroProducts.length)
                    }
                    className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow-pop backdrop-blur transition-all duration-200 hover:bg-white hover:text-brand-700 active:scale-95"
                  >
                    <IconChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Produk berikutnya"
                    onClick={() => setHeroIndex((index) => (index + 1) % heroProducts.length)}
                    className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow-pop backdrop-blur transition-all duration-200 hover:bg-white hover:text-brand-700 active:scale-95"
                  >
                    <IconChevronRight size={18} />
                  </button>
                </>
              )}
            </div>

            {/* Keterangan produk DI BAWAH gambar - tidak menutupi screenshot */}
            {heroProducts.length > 0 && (
              <div className="mt-3 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {heroProducts[heroIndex]?.latest?.title ?? heroProducts[heroIndex]?.app.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {heroProducts[heroIndex]?.app.name}
                  </p>
                </div>

                {heroProducts.length > 1 && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {heroProducts.map((product, index) => (
                      <button
                        key={product.app.id}
                        type="button"
                        aria-label={`Tampilkan ${product.app.name}`}
                        onClick={() => setHeroIndex(index)}
                        className={cn(
                          'h-1.5 rounded-full transition-all duration-300',
                          index === heroIndex ? 'w-4 bg-slate-800' : 'w-1.5 bg-slate-300',
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Panel kerja ---------- */}
      <PageHeader
        title="Ringkasan platform"
        description="Status Capture Studio, Screen Repository, dan progres tiap fase."
      />

      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card px-4 py-3.5">
            <p className="text-[13px] text-slate-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Progres pengembangan" description="Delapan fase proyek NigmaSim.">
          <ol className="space-y-2">
            {PHASES.map((phase, index) => (
              <li key={phase.name} className="flex items-start gap-2.5 text-[13px]">
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-medium ${
                    phase.state === 'selesai'
                      ? 'bg-emerald-600 text-white'
                      : phase.state === 'berikutnya'
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {index + 1}
                </span>
                <span className={phase.state === 'belum' ? 'text-slate-500' : 'text-slate-900'}>
                  {phase.name}
                  <span className="ml-1.5 text-xs text-slate-400">{phase.state}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Aplikasi terdaftar" description="Semua aplikasi yang ada di registry.">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-5 w-5 text-slate-300" />
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              title="Belum ada aplikasi"
              description="Daftarkan aplikasi sumber untuk memulai."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {products.map((product) => (
                <li key={product.app.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      to={`/applications/${product.app.id}`}
                      className="truncate text-[13px] font-medium text-slate-900 transition-colors hover:text-brand-600"
                    >
                      {product.app.name}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {product.screens.length} layar · {product.app.source_url}
                    </p>
                  </div>
                  {product.app.authorization_status === 'approved' ? (
                    <Badge tone="success">Approved</Badge>
                  ) : (
                    <Badge tone="warning">Pending</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
