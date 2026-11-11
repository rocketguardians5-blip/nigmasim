import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { applicationsApi, projectsApi, ApiError } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { screensApi } from '../lib/capture'
import type { Screen, ScreenElement } from '../lib/capture'
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

export function ScreenRepositoryPage() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const [apps, setApps] = useState<Application[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [screens, setScreens] = useState<Screen[]>([])
  const [thumbs, setThumbs] = useState<Record<number, Thumb>>({})
  const [search, setSearch] = useState('')
  const [reviewFilter, setReviewFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [active, setActive] = useState<Screen | null>(null)
  const [elements, setElements] = useState<ScreenElement[]>([])
  const [detailImage, setDetailImage] = useState<string | null>(null)
  const [maskMode, setMaskMode] = useState(false)

  // Query param project= dari halaman Capture Studio
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
      return
    }
    setLoading(true)
    try {
      const page = await screensApi.list(projectId, {
        search: search || undefined,
        review_status: reviewFilter || undefined,
      })
      setScreens(page.items)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat screen')
    } finally {
      setLoading(false)
    }
  }, [projectId, search, reviewFilter])

  useEffect(() => {
    const timer = setTimeout(() => void loadScreens(), 250)
    return () => clearTimeout(timer)
  }, [loadScreens])

  // Muat thumbnail (dengan autentikasi)
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

  // Muat detail screen + elemen
  const openDetail = useCallback(async (screen: Screen) => {
    setActive(screen)
    setMaskMode(false)
    try {
      const [list, url] = await Promise.all([
        screensApi.elements(screen.id),
        screensApi.screenshotUrl(screen.id, true),
      ])
      setElements(list)
      setDetailImage(url)
    } catch {
      setElements([])
      setDetailImage(null)
    }
  }, [])

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

  async function removeMask(element: ScreenElement) {
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

  async function saveTags(tags: string) {
    if (!active) return
    const list = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    try {
      const updated = await screensApi.update(active.id, { tags: list })
      setActive(updated)
      setScreens((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan tag')
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

  return (
    <div>
      <PageHeader
        title="Screen Repository"
        description="Semua layar yang tertangkap, beserta masking data sensitif dan status review."
      />

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Aplikasi">
            <select
              className="input min-w-[200px]"
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
              className="input min-w-[200px]"
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

          <Field label="Review">
            <select
              className="input"
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
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {screens.map((screen) => (
            <button
              key={screen.id}
              type="button"
              onClick={() => void openDetail(screen)}
              className="card overflow-hidden text-left transition-colors hover:border-slate-300"
            >
              <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                {thumbs[screen.id] ? (
                  <img
                    src={thumbs[screen.id].url}
                    alt={screen.title}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-slate-400">—</div>
                )}
              </div>
              <div className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[13px] font-medium text-slate-900">{screen.title}</p>
                  <Badge tone={REVIEW_TONE[screen.review_status]}>{screen.review_status}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {screen.route_label ?? screen.source_url ?? screen.screen_key}
                </p>
              </div>
            </button>
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

            <div>
              <p className="mb-1.5 text-[13px] font-medium text-slate-700">Tag</p>
              <input
                className="input"
                defaultValue={(active.tags ?? []).join(', ')}
                placeholder="pisahkan dengan koma"
                onBlur={(e) => void saveTags(e.target.value)}
              />
            </div>

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
