import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { applicationsApi, projectsApi, ApiError } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { screensApi } from '../lib/capture'
import type { NavigationNode, Screen, ScreenCategory, ScreenVersion } from '../lib/capture'
import { useAuth } from '../lib/auth'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
} from '../components/ui'
import { IconSearch } from '../components/icons'

interface Thumb {
  url: string
}

const REVIEW_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

type ViewMode = 'gallery' | 'modules' | 'map'

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'gallery', label: 'Galeri' },
  { id: 'modules', label: 'Per modul' },
  { id: 'map', label: 'Peta navigasi' },
]

export function ScreenRepositoryPage() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const [apps, setApps] = useState<Application[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [screens, setScreens] = useState<Screen[]>([])
  const [categories, setCategories] = useState<ScreenCategory[]>([])
  const [navTree, setNavTree] = useState<NavigationNode[]>([])
  const [thumbs, setThumbs] = useState<Record<number, Thumb>>({})
  const [search, setSearch] = useState('')
  const [reviewFilter, setReviewFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [latestOnly, setLatestOnly] = useState(true)
  const [view, setView] = useState<ViewMode>('gallery')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [active, setActive] = useState<Screen | null>(null)
  const [elements, setElements] = useState<import('../lib/capture').ScreenElement[]>([])
  const [detailImage, setDetailImage] = useState<string | null>(null)
  const [maskMode, setMaskMode] = useState(false)
  const [versions, setVersions] = useState<ScreenVersion[]>([])
  const [compareWith, setCompareWith] = useState<ScreenVersion | null>(null)
  const [compareImage, setCompareImage] = useState<string | null>(null)

  useEffect(() => {
    const qp = params.get('project')
    if (qp) setProjectId(Number(qp))
  }, [params])

  useEffect(() => {
    void (async () => {
      try {
        const page = await applicationsApi.list()
        setApps(page.items)
        if (page.items.length > 0 && !appId) {
          const firstApproved = page.items.find((a) => a.authorization_status === 'approved')
          setAppId((firstApproved ?? page.items[0]).id)
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat aplikasi')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!appId) return
    void (async () => {
      try {
        const page = await projectsApi.listByApplication(appId)
        setProjects(page.items)
        if (page.items.length > 0 && !projectId) setProjectId(page.items[0].id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal memuat project')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId])

  const loadScreens = useCallback(async () => {
    if (!projectId) {
      setScreens([])
      setCategories([])
      setNavTree([])
      return
    }
    setLoading(true)
    try {
      const [page, cats, tree] = await Promise.all([
        screensApi.list(projectId, {
          search: search || undefined,
          review_status: reviewFilter || undefined,
          category: categoryFilter || undefined,
          latest_only: latestOnly,
        }),
        screensApi.categories(projectId),
        screensApi.navigationMap(projectId),
      ])
      setScreens(page.items)
      setCategories(cats)
      setNavTree(tree)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat screen')
    } finally {
      setLoading(false)
    }
  }, [projectId, search, reviewFilter, categoryFilter, latestOnly])

  useEffect(() => {
    const timer = setTimeout(() => void loadScreens(), 250)
    return () => clearTimeout(timer)
  }, [loadScreens])

  // Thumbnail (butuh header autentikasi)
  useEffect(() => {
    let cancelled = false
    const created: string[] = []

    void (async () => {
      const entries = await Promise.all(
        screens.map(async (screen) => {
          try {
            const url = await screensApi.screenshotUrl(screen.id, true)
            created.push(url)
            return [screen.id, url] as const
          } catch {
            return null
          }
        }),
      )
      if (cancelled) return
      const map: Record<number, Thumb> = {}
      entries.filter(Boolean).forEach((entry) => {
        if (entry) map[entry[0]] = { url: entry[1] }
      })
      setThumbs(map)
    })()

    return () => {
      cancelled = true
      created.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [screens])

  const openDetail = useCallback(async (screen: Screen) => {
    setActive(screen)
    setMaskMode(false)
    setCompareWith(null)
    setCompareImage(null)
    try {
      const [list, url, versionList] = await Promise.all([
        screensApi.elements(screen.id),
        screensApi.screenshotUrl(screen.id, true),
        screensApi.versions(screen.id),
      ])
      setElements(list)
      setDetailImage(url)
      setVersions(versionList)
    } catch {
      setElements([])
      setDetailImage(null)
      setVersions([])
    }
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, Screen[]>()
    for (const screen of screens) {
      const key = screen.category ?? 'Belum dikelompokkan'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(screen)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id'))
  }, [screens])

  async function refreshImage() {
    if (!active) return
    try {
      const url = await screensApi.screenshotUrl(active.id, true)
      setDetailImage((old) => {
        if (old) URL.revokeObjectURL(old)
        return url
      })
    } catch {
      /* abaikan */
    }
  }

  async function addMaskRegion(event: React.MouseEvent<HTMLImageElement>) {
    if (!active || !maskMode || !event.target) return
    const image = event.target as HTMLImageElement
    const rect = image.getBoundingClientRect()
    const scaleX = image.naturalWidth / rect.width
    const scaleY = image.naturalHeight / rect.height
    const x = Math.round((event.clientX - rect.left) * scaleX)
    const y = Math.round((event.clientY - rect.top) * scaleY)

    try {
      const created = await screensApi.addElement(active.id, {
        element_type: 'mask-region',
        label: 'Area sensitif',
        bounding_box: { x: Math.max(0, x - 90), y: Math.max(0, y - 12), w: 180, h: 24 },
        mask: true,
      })
      setElements((prev) => [...prev, created])
      await refreshImage()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menandai area')
    }
  }

  async function removeMask(element: { id: number }) {
    try {
      await screensApi.removeElement(element.id)
      setElements((prev) => prev.filter((e) => e.id !== element.id))
      await refreshImage()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menghapus area')
    }
  }

  async function review(status: 'approved' | 'rejected' | 'pending') {
    if (!active) return
    try {
      const updated = await screensApi.review(active.id, status)
      setActive(updated)
      setScreens((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      setNotice(`Status review diubah menjadi ${status}.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah status review')
    }
  }

  async function saveMeta(body: Parameters<typeof screensApi.update>[1]) {
    if (!active) return
    try {
      const updated = await screensApi.update(active.id, body)
      setActive(updated)
      setScreens((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      setNotice('Perubahan disimpan.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan perubahan')
    }
  }

  async function recapture() {
    if (!active) return
    try {
      const created = await screensApi.recapture(active.id)
      setNotice(`Versi ${created.capture_version} berhasil diambil.`)
      await loadScreens()
      await openDetail(created)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Recapture gagal')
    }
  }

  async function chooseCompare(version: ScreenVersion) {
    setCompareWith(version)
    try {
      const url = await screensApi.screenshotUrl(version.id, true)
      setCompareImage(url)
    } catch {
      setCompareImage(null)
    }
  }

  async function removeScreen() {
    if (!active) return
    if (!window.confirm(`Hapus screen "${active.title}"?`)) return
    try {
      await screensApi.remove(active.id)
      setScreens((prev) => prev.filter((s) => s.id !== active.id))
      setActive(null)
      setNotice('Screen dihapus.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menghapus screen')
    }
  }

  const maskRegions = useMemo(() => elements.filter((e) => e.mask && e.bounding_box), [elements])
  const otherScreens = useMemo(
    () => screens.filter((s) => s.id !== active?.id),
    [screens, active],
  )

  return (
    <div>
      <PageHeader
        title="Screen Repository"
        description="Semua layar yang tertangkap, dikelompokkan per modul, beserta versioning dan masking data sensitif."
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
              className="input min-w-[180px]"
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
              onChange={(e) => {
                const next = Number(e.target.value) || null
                setProjectId(next)
                params.set('project', String(next ?? ''))
                setParams(params, { replace: true })
              }}
            >
              <option value="">— pilih —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cari">
            <div className="relative">
              <IconSearch
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="input pl-8"
                placeholder="Judul atau URL…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </Field>

          <Field label="Modul">
            <select
              className="input min-w-[160px]"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Semua modul</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Review">
            <select
              className="input min-w-[130px]"
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value)}
            >
              <option value="">Semua</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                  view === item.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            <input
              type="checkbox"
              checked={latestOnly}
              onChange={(e) => setLatestOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            Hanya versi terbaru
          </label>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-slate-300" />
        </div>
      ) : screens.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Belum ada screen"
            description="Ambil screenshot pertama dari Capture Studio."
          />
        </div>
      ) : view === 'map' ? (
        <Card title="Peta navigasi" description="Relasi layar: dari layar mana user bisa masuk ke layar ini." className="mt-4">
          {navTree.length === 0 ? (
            <EmptyState
              title="Belum ada relasi"
              description="Tentukan layar induk pada detail screen untuk memetakan alur navigasi."
            />
          ) : (
            <NavTree nodes={navTree} onSelect={(id) => {
              const found = screens.find((s) => s.id === id)
              if (found) void openDetail(found)
            }} />
          )}
        </Card>
      ) : view === 'modules' ? (
        <div className="mt-4 space-y-6">
          {grouped.map(([category, items]) => (
            <section key={category}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-[13px] font-semibold text-slate-900">{category}</h2>
                <span className="text-xs text-slate-500 tabular">{items.length} layar</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((screen) => (
                  <ScreenCard
                    key={screen.id}
                    screen={screen}
                    thumb={thumbs[screen.id]?.url}
                    onOpen={() => void openDetail(screen)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {screens.map((screen) => (
            <ScreenCard
              key={screen.id}
              screen={screen}
              thumb={thumbs[screen.id]?.url}
              onOpen={() => void openDetail(screen)}
            />
          ))}
        </div>
      )}

      <Modal
        open={active !== null}
        title={active?.title ?? ''}
        description={active?.source_url ?? undefined}
        onClose={() => setActive(null)}
        footer={
          <>
            {can('screens:write') && (
              <Button variant="danger" onClick={() => void removeScreen()}>
                Hapus
              </Button>
            )}
            <Button variant="secondary" onClick={() => setActive(null)}>
              Tutup
            </Button>
          </>
        }
      >
        {active && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={REVIEW_TONE[active.review_status]}>Review: {active.review_status}</Badge>
              {active.capture_version > 1 && <Badge tone="info">Versi {active.capture_version}</Badge>}
              {can('screens:review') && (
                <>
                  <Button size="sm" onClick={() => void review('approved')}>
                    Setujui
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void review('rejected')}>
                    Tolak
                  </Button>
                </>
              )}
              {can('capture:operate') && (
                <Button size="sm" variant="secondary" onClick={() => void recapture()}>
                  Capture ulang
                </Button>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[13px] font-medium text-slate-700">Tampilan</p>
                {can('screens:write') && (
                  <Button
                    size="sm"
                    variant={maskMode ? 'primary' : 'secondary'}
                    onClick={() => setMaskMode((v) => !v)}
                  >
                    {maskMode ? 'Selesai menandai' : 'Tandai area sensitif'}
                  </Button>
                )}
              </div>
              {maskMode && (
                <p className="mb-2 text-xs text-slate-500">
                  Klik pada bagian gambar yang berisi data sensitif. Area tersebut akan disamarkan
                  sebelum screenshot dipakai.
                </p>
              )}
              <div className="relative overflow-hidden rounded border border-slate-200 bg-slate-100">
                {detailImage ? (
                  <img
                    src={detailImage}
                    alt={active.title}
                    onClick={(e) => void addMaskRegion(e)}
                    className={maskMode ? 'cursor-crosshair' : ''}
                  />
                ) : (
                  <div className="grid aspect-[16/10] place-items-center text-xs text-slate-400">
                    Memuat gambar…
                  </div>
                )}
              </div>
              {maskRegions.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  {maskRegions.length} area ditandai sebagai perlu disamarkan.
                </p>
              )}
            </div>

            {versions.length > 1 && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-slate-700">
                  Versi capture ({versions.length})
                </p>
                <ul className="space-y-1">
                  {versions.map((version) => (
                    <li key={version.id} className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => void chooseCompare(version)}
                        className={`rounded px-2 py-1 text-left text-xs transition-colors ${
                          compareWith?.id === version.id
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Versi {version.capture_version} · {new Date(version.captured_at).toLocaleString('id-ID')}
                      </button>
                      {version.id !== active.id && (
                        <span className="text-[11px] text-slate-400">
                          {compareWith?.id === version.id ? 'dibandingkan' : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {compareWith && compareImage && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <figure>
                      <img src={detailImage ?? ''} alt="Versi saat ini" className="rounded border border-slate-200" />
                      <figcaption className="mt-1 text-[11px] text-slate-500">
                        Versi {active.capture_version} (sekarang)
                      </figcaption>
                    </figure>
                    <figure>
                      <img src={compareImage} alt="Versi pembanding" className="rounded border border-slate-200" />
                      <figcaption className="mt-1 text-[11px] text-slate-500">
                        Versi {compareWith.capture_version} (pembanding)
                      </figcaption>
                    </figure>
                  </div>
                )}
              </div>
            )}

            {can('screens:write') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Modul / kategori">
                  <select
                    className="input"
                    value={active.category ?? ''}
                    onChange={(e) => void saveMeta({ category: e.target.value || null })}
                  >
                    <option value="">— belum dikelompokkan —</option>
                    {categories.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                    <option value="Dashboard">Dashboard</option>
                    <option value="Project Risk">Project Risk</option>
                    <option value="Risk Assessment">Risk Assessment</option>
                    <option value="Master Data">Master Data</option>
                    <option value="User Management">User Management</option>
                  </select>
                </Field>

                <Field label="Layar induk" hint="Dari layar mana user bisa masuk ke layar ini.">
                  <select
                    className="input"
                    value={active.parent_id ?? ''}
                    onChange={(e) =>
                      void saveMeta({
                        parent_screen_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">— tanpa induk —</option>
                    {otherScreens.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {can('screens:write') && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-slate-700">Tag</p>
                <input
                  className="input"
                  defaultValue={(active.tags ?? []).join(', ')}
                  placeholder="pisahkan dengan koma"
                  onBlur={(e) => void saveMeta({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                />
              </div>
            )}

            <div>
              <p className="mb-1.5 text-[13px] font-medium text-slate-700">
                Elemen terdeteksi ({elements.length})
              </p>
              {elements.length === 0 ? (
                <p className="text-xs text-slate-500">Belum ada elemen yang dicatat.</p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded border border-slate-200">
                  {elements.map((element) => (
                    <li
                      key={element.id}
                      className="flex items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5 last:border-0"
                    >
                      <span className="min-w-0">
                        <span className="text-xs text-slate-800">{element.label ?? element.element_type}</span>
                        <span className="ml-1.5 text-[11px] text-slate-400">{element.element_type}</span>
                      </span>
                      {element.mask && can('screens:write') && (
                        <button
                          type="button"
                          onClick={() => void removeMask(element)}
                          className="text-xs font-medium text-rose-600 hover:underline"
                        >
                          hapus area
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function ScreenCard({
  screen,
  thumb,
  onOpen,
}: {
  screen: Screen
  thumb?: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card overflow-hidden text-left transition-colors hover:border-slate-300"
    >
      <div className="aspect-[16/10] overflow-hidden bg-slate-100">
        {thumb ? (
          <img src={thumb} alt={screen.title} className="h-full w-full object-cover object-top" />
        ) : (
          <div className="grid h-full place-items-center text-xs text-slate-400">—</div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[13px] font-medium text-slate-900">{screen.title}</p>
          <Badge tone={REVIEW_TONE[screen.review_status]}>{screen.review_status}</Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="truncate text-xs text-slate-500">
            {screen.route_label ?? screen.source_url ?? screen.screen_key}
          </p>
          {screen.capture_version > 1 && (
            <span className="shrink-0 text-[11px] text-slate-400">v{screen.capture_version}</span>
          )}
        </div>
      </div>
    </button>
  )
}

function NavTree({
  nodes,
  onSelect,
  depth = 0,
}: {
  nodes: NavigationNode[]
  onSelect: (id: number) => void
  depth?: number
}) {
  if (nodes.length === 0) return null
  return (
    <ul className={depth > 0 ? 'ml-4 border-l border-slate-200 pl-4' : ''}>
      {nodes.map((node) => (
        <li key={node.id} className="py-1">
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className="flex items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-slate-50"
          >
            <span className="text-[13px] text-slate-800">{node.title}</span>
            {node.route_label && (
              <span className="text-[11px] text-slate-400">{node.route_label}</span>
            )}
            <Badge tone={REVIEW_TONE[node.review_status]}>{node.review_status}</Badge>
          </button>
          <NavTree nodes={node.children} onSelect={onSelect} depth={depth + 1} />
        </li>
      ))}
    </ul>
  )
}
