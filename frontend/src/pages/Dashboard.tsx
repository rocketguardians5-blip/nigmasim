import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { applicationsApi, projectsApi } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { screensApi } from '../lib/capture'
import type { Screen } from '../lib/capture'
import { useAuth } from '../lib/auth'
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { IconArrowLeft, IconExternal } from '../components/icons'

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
  { name: 'UI Reconstruction', state: 'berikutnya' },
  { name: 'Full Simulation', state: 'belum' },
  { name: 'Workflow + Walkthrough', state: 'belum' },
  { name: 'SOP Generator', state: 'belum' },
  { name: 'Publish + Analytics', state: 'belum' },
]

export function DashboardPage() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const railRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ startX: 0, startScroll: 0, moved: false })
  const [dragging, setDragging] = useState(false)

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
      } catch (err) {
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

  /* ---------- Rail: drag + snap halus ---------- */

  const scrollRail = useCallback((direction: 1 | -1) => {
    const el = railRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('[data-rail-item]')
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.8
    el.scrollBy({ left: direction * step, behavior: 'smooth' })
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = railRef.current
    if (!el) return
    dragState.current = { startX: event.clientX, startScroll: el.scrollLeft, moved: false }
    setDragging(true)
    el.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = railRef.current
    if (!el || !dragging) return
    const delta = event.clientX - dragState.current.startX
    if (Math.abs(delta) > 4) dragState.current.moved = true
    el.scrollLeft = dragState.current.startScroll - delta
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = railRef.current
    if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
    setDragging(false)
  }

  // Tandai slide yang sedang terlihat (indeks aktif untuk titik navigasi)
  const onRailScroll = useCallback(() => {
    const el = railRef.current
    if (!el) return
    const items = [...el.querySelectorAll<HTMLElement>('[data-rail-item]')]
    const center = el.scrollLeft + el.clientWidth / 2
    let closest = 0
    let best = Infinity
    items.forEach((item, index) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2
      const distance = Math.abs(itemCenter - center)
      if (distance < best) {
        best = distance
        closest = index
      }
    })
    setActiveIndex(closest)
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

  const hero = products.find((p) => p.image) ?? products[0]

  return (
    <div>
      {/* ---------- Hero ---------- */}
      <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid items-center gap-6 p-6 md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <div className="max-w-xl">
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

          <div className="relative">
            <div className="aspect-[4/3] overflow-hidden rounded-[2rem] bg-slate-100">
              {hero?.image ? (
                <img src={hero.image} alt={hero.latest?.title ?? ''} className="h-full w-full object-cover object-top" />
              ) : (
                <div className="grid h-full place-items-center text-xs text-slate-400">
                  Belum ada screenshot
                </div>
              )}
            </div>
            {hero?.latest && (
              <div className="absolute bottom-3 left-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
                <p className="text-xs font-medium text-slate-900">{hero.latest.title}</p>
                <p className="text-[11px] text-slate-500">{hero.app.name}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Rail produk ---------- */}
      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Produk yang bisa didemokan</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              Geser ke samping untuk melihat semua aplikasi yang terdaftar.
            </p>
          </div>
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              aria-label="Geser ke kiri"
              onClick={() => scrollRail(-1)}
              className="grid h-8 w-8 place-items-center rounded-full border border-slate-300 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
            >
              <IconArrowLeft size={15} />
            </button>
            <button
              type="button"
              aria-label="Geser ke kanan"
              onClick={() => scrollRail(1)}
              className="grid h-8 w-8 place-items-center rounded-full border border-slate-300 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
            >
              <IconArrowLeft size={15} className="rotate-180" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-14">
            <Spinner className="h-6 w-6 text-slate-300" />
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            title="Belum ada aplikasi terdaftar"
            description="Daftarkan aplikasi sumber yang sudah mendapat izin capture untuk memulai."
            action={
              <Link to="/applications" className="text-sm font-medium text-brand-600 hover:underline">
                Buka Application Registry
              </Link>
            }
          />
        ) : (
          <>
            <div
              ref={railRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onScroll={onRailScroll}
              className={`scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 ${
                dragging ? 'cursor-grabbing select-none' : 'cursor-grab'
              }`}
              style={{ scrollBehavior: 'smooth' }}
            >
              {products.map((product) => (
                <Link
                  key={product.app.id}
                  to={`/applications/${product.app.id}`}
                  data-rail-item
                  onClick={(event) => {
                    if (dragState.current.moved) event.preventDefault()
                  }}
                  className="group w-[320px] shrink-0 snap-start overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300 sm:w-[380px]"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.latest?.title ?? product.app.name}
                        className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-slate-400">
                        Belum ada screenshot
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{product.app.name}</p>
                      {product.app.authorization_status === 'approved' ? (
                        <Badge tone="success">Approved</Badge>
                      ) : (
                        <Badge tone="warning">Pending</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {product.app.category ?? product.app.description ?? 'Belum ada kategori'}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-xs text-slate-500 tabular">
                        {product.screens.length} layar
                        {product.project ? ` · ${product.project.name}` : ''}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                        Buka <IconExternal size={12} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {products.length > 1 && (
              <div className="mt-1 flex justify-center gap-1.5">
                {products.map((product, index) => (
                  <button
                    key={product.app.id}
                    type="button"
                    aria-label={`Ke produk ${index + 1}`}
                    onClick={() => {
                      const el = railRef.current
                      const item = el?.querySelectorAll<HTMLElement>('[data-rail-item]')[index]
                      if (el && item) {
                        el.scrollTo({ left: item.offsetLeft, behavior: 'smooth' })
                      }
                    }}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      index === activeIndex ? 'w-5 bg-slate-800' : 'w-1.5 bg-slate-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ---------- Panel kerja (tetap berguna untuk operator) ---------- */}
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

        <Card title="Aplikasi terbaru" description="Lima aplikasi terakhir didaftarkan.">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-5 w-5 text-slate-300" />
            </div>
          ) : products.length === 0 ? (
            <EmptyState title="Belum ada aplikasi" description="Daftarkan aplikasi sumber untuk memulai." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {products.slice(0, 5).map((product) => (
                <li key={product.app.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      to={`/applications/${product.app.id}`}
                      className="truncate text-[13px] font-medium text-slate-900 transition-colors hover:text-brand-600"
                    >
                      {product.app.name}
                    </Link>
                    <p className="truncate text-xs text-slate-500">{product.app.source_url}</p>
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
