import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { applicationsApi, projectsApi, ApiError } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { simulationApi } from '../lib/simulation'
import type { SimDatasetInfo, SimulationDefinition } from '../lib/simulation'
import { useAuth } from '../lib/auth'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Spinner,
} from '../components/ui'
import {
  isInteractiveHotspot,
} from '../lib/hotspotStore'

interface HotspotTargetMap {
  [screenKey: string]: {
    [hotspotId: number]: string
  }
}

export function SimulationBuilderPage() {
  const { can } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [definition, setDefinition] = useState<SimulationDefinition | null>(null)
  const [datasets, setDatasets] = useState<SimDatasetInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [simName, setSimName] = useState('Simulasi Demo')
  const [visualMode, setVisualMode] = useState(true)
  const [hotspotTargets, setHotspotTargets] = useState<HotspotTargetMap>({})
  const [screenFilter, setScreenFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  useEffect(() => {
    void (async () => {
      try {
        const page = await applicationsApi.list()
        setApps(page.items)
        const approved = page.items.find((a) => a.authorization_status === 'approved')
        if (approved) setAppId(approved.id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat aplikasi')
      }
    })()
  }, [])

  useEffect(() => {
    if (!appId) return
    void (async () => {
      try {
        const page = await projectsApi.listByApplication(appId)
        setProjects(page.items)
        if (page.items.length > 0) setProjectId(page.items[0].id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat project')
      }
    })()
  }, [appId])

  const load = useCallback(async () => {
    if (!projectId) {
      setDefinition(null)
      setDatasets([])
      setHotspotTargets({})
      return
    }
    setLoading(true)
    try {
      const data = await simulationApi.getByProject(projectId)
      setDefinition(data)
      setSimName(data.name)
      setVisualMode(data.screens.some((s) => s.layout.visual_mode ?? false))
      setDatasets(await simulationApi.datasets(data.id))
      setHotspotTargets(
        Object.fromEntries(
          data.screens.map((s) => [
            s.key,
            Object.fromEntries((s.layout.hotspots ?? []).map((h: any) => [h.id, h.target_screen_key || ''])),
          ]),
        ),
      )
      setError(null)
    } catch {
      setDefinition(null)
      setDatasets([])
      setHotspotTargets({})
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  // Langganan reaktif ke event store dan storage sehingga perubahan di Draf struktur
  // (hapus/edit kotak) langsung tercermin di Simulation Builder tanpa reload halaman
  useEffect(() => {
    const handleUpdate = () => {
      void load()
    }
    window.addEventListener('nigmasim:hotspots-updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('nigmasim:hotspots-updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [load])

  async function build() {
    if (!projectId) return
    setBuilding(true)
    setError(null)
    try {
      const data = await simulationApi.build(projectId, {
        name: simName,
        visual_mode: visualMode,
        hotspot_targets: hotspotTargets,
      })
      setDefinition(data)
      setDatasets(await simulationApi.datasets(data.id))
      // Inisialisasi hotspotTargets dari definisi baru (kosong dulu, user atur di bawah)
      setHotspotTargets(
        Object.fromEntries(
          data.screens.map((s) => [s.key, Object.fromEntries((s.layout.hotspots ?? []).map((h: any) => [h.id, h.target_screen_key || '']))]),
        ),
      )
      setNotice(
        `Simulasi dibuat: ${data.screens.length} layar, ${Object.keys(data.datasets).length} dataset.`,
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat simulasi')
    } finally {
      setBuilding(false)
    }
  }

  async function saveHotspotTargets() {
    if (!definition) return
    try {
      await simulationApi.updateScreenLayout(definition.id, {
        screens: definition.screens.map((screen) => ({
          screen_key: screen.key,
          layout: {
            ...screen.layout,
            hotspots: (screen.layout.hotspots ?? []).map((h: any) => ({
              ...h,
              target_screen_key: hotspotTargets[screen.key]?.[h.id] || null,
            })),
          },
        })),
      })
      setNotice('Target layar hotspot disimpan.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan target hotspot')
    }
  }

  const [resyncing, setResyncing] = useState(false)

  async function handleResyncAll() {
    if (!definition) return
    setResyncing(true)
    setNotice(null)
    setError(null)
    try {
      const refreshed = await simulationApi.resyncAll(definition.id)
      setDefinition(refreshed)
      setNotice('Semua hotspot layar simulasi berhasil disinkronkan ulang dari Draf struktur.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal sinkronisasi ulang layar')
    } finally {
      setResyncing(false)
    }
  }

  async function reset() {
    if (!definition) return
    try {
      const result = await simulationApi.reset(definition.id)
      setNotice(result.message)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal reset data')
    }
  }

  return (
    <div>
      <PageHeader
        title="Simulation Builder"
        description="Ubah rekonstruksi yang disetujui menjadi simulasi yang bisa diklik, dengan data dummy."
        actions={
          definition ? (
            <Link
              to={`/simulation/play/${projectId}`}
              className="inline-flex h-9 items-center rounded bg-[#4268ff] px-4 text-sm font-medium text-white transition-colors hover:bg-[#3257e6] active:bg-[#2c4fd1]"
            >
              Buka Player
            </Link>
          ) : undefined
        }
      />

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="danger" title="Gagal">{error}</Alert>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Aplikasi">
            <select
              className="input min-w-[170px]"
              value={appId ?? ''}
              onChange={(e) => {
                setAppId(Number(e.target.value) || null)
                setProjectId(null)
              }}
            >
              <option value="">— pilih —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Project">
            <select
              className="input min-w-[170px]"
              value={projectId ?? ''}
              onChange={(e) => setProjectId(Number(e.target.value) || null)}
            >
              <option value="">— pilih —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nama simulasi">
            <input
              className="input min-w-[200px]"
              value={simName}
              onChange={(e) => setSimName(e.target.value)}
            />
          </Field>

          <Field label="Mode tampilan">
            <div className="flex items-center gap-2">
              <input
                id="visual-mode"
                type="checkbox"
                className="form-checkbox"
                checked={visualMode}
                onChange={(e) => setVisualMode(e.target.checked)}
              />
              <label htmlFor="visual-mode" className="text-[13px] font-medium text-slate-700">
                Clone visual (screenshot sebagai background + area klik)
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Aktifkan agar player menampilkan tangkapan layar asli dengan tombol transparan di posisi
              yang sama.
            </p>
          </Field>

          {definition && visualMode && (
            <Card title="Atur tujuan klik tiap hotspot" className="mt-4">
              <p className="text-[13px] text-slate-600 mb-3">
                Pilih layar tujuan untuk setiap area klik pada tiap layar simulasi. Hanya menampilkan tombol dan menu interaktif.
              </p>

              {/* Toolbar: Filter Layar & Search Box */}
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-2.5 border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-slate-600">Filter Layar:</span>
                  <select
                    className="input h-8 text-[12px] min-w-[180px]"
                    value={screenFilter}
                    onChange={(e) => setScreenFilter(e.target.value)}
                  >
                    <option value="all">Semua Layar ({definition.screens.length})</option>
                    {definition.screens.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-1 items-center gap-2 min-w-[220px]">
                  <span className="text-[12px] font-medium text-slate-600">Cari Tombol:</span>
                  <input
                    type="text"
                    className="input h-8 text-[12px] flex-1"
                    placeholder="Ketik nama tombol (mis. HOME, BUY NOW, CART)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-xs text-slate-400 hover:text-slate-600 font-medium"
                    >
                      Batal
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {definition.screens
                  .filter((s) => screenFilter === 'all' || s.key === screenFilter)
                  .map((screen) => {
                    const rawHotspots = (screen.layout.hotspots ?? []) as any[]

                    // 1. Filter elemen interaktif (Backend adalah Single Source of Truth)
                    let hotspots = rawHotspots.filter((h: any) => isInteractiveHotspot(h))

                    // 2. Filter by search query if any
                    if (searchQuery.trim()) {
                      const q = searchQuery.toLowerCase().trim()
                      hotspots = hotspots.filter((h: any) =>
                        (h.label || h.type || '').toLowerCase().includes(q),
                      )
                    }

                    // 3. Sort by position: top-to-bottom (y), then left-to-right (x)
                    hotspots.sort((a: any, b: any) => {
                      const ay = a.box?.y ?? 0
                      const by = b.box?.y ?? 0
                      if (Math.abs(ay - by) > 1.5) return ay - by
                      const ax = a.box?.x ?? 0
                      const bx = b.box?.x ?? 0
                      return ax - bx
                    })

                    if (hotspots.length === 0) {
                      return (
                        <div key={screen.key} className="rounded border border-slate-200 p-3 bg-slate-50">
                          <p className="text-[13px] font-medium text-slate-800">{screen.title}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {searchQuery
                              ? 'Tidak ada tombol yang cocok dengan pencarian.'
                              : 'Tidak ada area klik interaktif aktif.'}
                          </p>
                        </div>
                      )
                    }

                    const targets = hotspotTargets[screen.key] || {}
                    return (
                      <div key={screen.key} className="rounded border border-slate-200 p-3 bg-white shadow-sm">
                        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                          <div>
                            <p className="text-[13px] font-semibold text-slate-900">{screen.title}</p>
                            <p className="text-[11px] text-slate-500">{screen.route}</p>
                          </div>
                          <Badge tone="neutral">
                            {hotspots.length} tombol interaktif
                          </Badge>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
                          {hotspots.map((hotspot: any) => {
                            const isMapped = Boolean(targets[hotspot.id])
                            return (
                              <div
                                key={hotspot.id}
                                className={`flex items-center justify-between gap-2 text-[12px] rounded border p-2 ${
                                  isMapped ? 'border-brand-200 bg-brand-50/20' : 'border-slate-200'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-slate-800 truncate" title={hotspot.label}>
                                      {hotspot.label || hotspot.type}
                                    </span>
                                    <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500 shrink-0">
                                      {hotspot.type}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    pos: ({Math.round(hotspot.box?.x ?? 0)}%, {Math.round(hotspot.box?.y ?? 0)}%)
                                  </div>
                                </div>
                                <select
                                  aria-label={`Target untuk ${hotspot.label || hotspot.type}`}
                                  className="input h-8 text-[12px] min-w-[150px] max-w-[200px]"
                                  value={targets[hotspot.id] || ''}
                                  onChange={(e) => {
                                    setHotspotTargets({
                                      ...hotspotTargets,
                                      [screen.key]: {
                                        ...targets,
                                        [hotspot.id]: e.target.value || '',
                                      },
                                    })
                                  }}
                                >
                                  <option value="">— pilih layar tujuan —</option>
                                  {definition.screens.map((s) => (
                                    <option key={s.key} value={s.key}>
                                      {s.title} ({s.route})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
              </div>

              {can('simulation:write') && (
                <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Perubahan target disimpan langsung ke definisi simulasi.
                  </p>
                  <Button size="sm" onClick={() => void saveHotspotTargets()}>
                    Simpan target klik
                  </Button>
                </div>
              )}
            </Card>
          )}

          {can('simulation:write') && (
            <div className="flex items-center gap-2">
              <Button onClick={() => void build()} disabled={!projectId} loading={building}>
                {definition ? 'Bangun ulang' : 'Buat simulasi'}
              </Button>
              {definition && (
                <Button
                  variant="secondary"
                  onClick={() => void handleResyncAll()}
                  loading={resyncing}
                  title="Ambil ulang seluruh posisi hotspot terbaru dari Draf struktur tanpa membuat ulang simulasi"
                >
                  Sinkronkan ulang semua layar
                </Button>
              )}
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Simulasi dibangun dari rekonstruksi yang statusnya sudah <strong>disetujui</strong>.
          Kalau belum ada, buka UI Reconstruction dulu lalu setujui drafnya.
        </p>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-slate-300" />
        </div>
      ) : !definition ? (
        <div className="mt-4">
          <EmptyState
            title="Belum ada simulasi"
            description="Buat simulasi dari rekonstruksi yang sudah disetujui. Data dummy akan dibuat otomatis dari kolom tabel yang terdeteksi."
          />
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Layar" description="Halaman yang bisa dibuka di player." className="lg:col-span-2">
              <ul className="divide-y divide-slate-100">
                {definition.screens.map((screen) => (
                  <li key={screen.key} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-slate-900">{screen.title}</p>
                      <p className="truncate text-xs text-slate-500">{screen.route}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {screen.layout.table && <Badge tone="info">tabel</Badge>}
                      {screen.layout.form && <Badge tone="info">form</Badge>}
                      {(screen.layout.cards ?? []).length > 0 && (
                        <Badge tone="neutral">{(screen.layout.cards ?? []).length} kartu</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card
              title="Data dummy"
              description="Data ini tidak pernah menyentuh aplikasi asli."
              actions={
                <Button size="sm" variant="secondary" onClick={() => void reset()}>
                  Reset
                </Button>
              }
            >
              {datasets.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Belum ada dataset. Dataset muncul otomatis dari tabel yang terdeteksi.
                </p>
              ) : (
                <ul className="space-y-2">
                  {datasets.map((dataset) => (
                    <li
                      key={dataset.name}
                      className="rounded border border-slate-200 px-3 py-2"
                    >
                      <p className="text-[13px] font-medium text-slate-900">{dataset.name}</p>
                      <p className="text-xs text-slate-500">
                        {dataset.row_count} baris · {dataset.schema.length} kolom
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {dataset.schema.map((column) => (
                          <span
                            key={column.key}
                            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
                          >
                            {column.key}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-4">
            <Alert tone="info" title="Langkah berikutnya">
              Buka <strong>Player</strong> untuk mencoba simulasi seperti yang dilihat klien:
              pencarian, sortir, pagination, tambah/ubah/hapus baris, dan tombol reset data.
            </Alert>
          </div>
        </>
      )}
    </div>
  )
}
