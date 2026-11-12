import { useCallback, useEffect, useMemo, useState } from 'react'
import { applicationsApi, projectsApi, ApiError } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { screensApi } from '../lib/capture'
import type { Screen } from '../lib/capture'
import { reconstructionApi } from '../lib/reconstruction'
import type { Reconstruction, ReconstructionComponent } from '../lib/reconstruction'
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
  cn,
} from '../components/ui'
import { IconCheck, IconExternal } from '../components/icons'

const COMPONENT_COLOR: Record<string, string> = {
  'nav-item': 'border-brand-500 bg-brand-500/10 text-brand-800',
  'header-item': 'border-slate-500 bg-slate-500/10 text-slate-700',
  button: 'border-amber-500 bg-amber-500/10 text-amber-800',
  field: 'border-cyan-600 bg-cyan-500/10 text-cyan-900',
  table: 'border-emerald-600 bg-emerald-500/10 text-emerald-900',
  heading: 'border-violet-500 bg-violet-500/10 text-violet-900',
  form: 'border-teal-600 bg-teal-500/10 text-teal-900',
  card: 'border-rose-500 bg-rose-500/10 text-rose-900',
  image: 'border-slate-400 bg-slate-400/10 text-slate-700',
}

const CONFIDENCE_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
}

export function UIReconstructionPage() {
  const { can } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [screens, setScreens] = useState<Screen[]>([])
  const [screenId, setScreenId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Reconstruction | null>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [loading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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

  const loadScreens = useCallback(async () => {
    if (!projectId) {
      setScreens([])
      return
    }
    try {
      const page = await screensApi.list(projectId, { latest_only: true })
      setScreens(page.items)
      // Layar pertama langsung dipilih supaya tidak perlu klik lagi.
      setScreenId((current) => current ?? page.items[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat daftar layar')
    }
  }, [projectId])

  useEffect(() => {
    void loadScreens()
  }, [loadScreens])

  const loadDraft = useCallback(async (id: number) => {
    try {
      const result = await reconstructionApi.get(id)
      setDraft(result)
      setCode(result.code_text ?? '')
    } catch {
      setDraft(null)
      setCode('')
    }
  }, [])

  // Muat draf + screenshot asli saat layar dipilih
  useEffect(() => {
    if (!screenId) {
      setDraft(null)
      setScreenshot(null)
      return
    }
    void (async () => {
      try {
        const url = await screensApi.screenshotUrl(screenId, true)
        setScreenshot(url)
      } catch {
        setScreenshot(null)
      }
      await loadDraft(screenId)
    })()
  }, [screenId, loadDraft])

  async function handleAnalyze() {
    if (!screenId) return
    setAnalyzing(true)
    setError(null)
    try {
      const result = await reconstructionApi.analyze(screenId)
      setDraft(result)
      setCode(result.code_text ?? '')
      setNotice(
        `Draf dibuat: ${result.components.length} komponen, ${result.assumptions.length} asumsi perlu dicek.`,
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Analisis gagal')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSaveCode() {
    if (!screenId) return
    try {
      const result = await reconstructionApi.updateCode(screenId, code)
      setDraft(result)
      setNotice('Kode draf disimpan. Status kembali ke draft dan wajib direview ulang.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan kode')
    }
  }

  async function handleResolve(id: number, resolved: boolean) {
    try {
      if (resolved) await reconstructionApi.resolve(id)
      else await reconstructionApi.unresolve(id)
      if (screenId) await loadDraft(screenId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah asumsi')
    }
  }

  async function handleReview(status: 'approved' | 'rejected' | 'in_review') {
    if (!screenId) return
    try {
      const result = await reconstructionApi.review(screenId, status)
      setDraft(result)
      setNotice(
        status === 'approved'
          ? 'Draf disetujui dan siap dipakai sebagai bahan Phase 4.'
          : 'Draf ditolak / dikembalikan ke review.',
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan status review')
    }
  }

  async function handleComponentEdit(component: ReconstructionComponent, label: string) {
    try {
      await reconstructionApi.updateComponent(component.id, { label })
      if (screenId) await loadDraft(screenId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan komponen')
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ReconstructionComponent[]>()
    for (const component of draft?.components ?? []) {
      if (!map.has(component.region)) map.set(component.region, [])
      map.get(component.region)!.push(component)
    }
    return [...map.entries()]
  }, [draft])

  const unresolved = (draft?.assumptions ?? []).filter((a) => !a.resolved).length
  const canReview = can('screens:review')

  return (
    <div>
      <PageHeader
        title="UI Reconstruction"
        description="Ubah hasil capture menjadi draf React + TypeScript. Semua asumsi wajib dicek manusia sebelum draf disetujui."
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
                setScreenId(null)
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
                setProjectId(Number(e.target.value) || null)
                setScreenId(null)
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

          <Field label="Layar">
            <select
              className="input min-w-[220px]"
              value={screenId ?? ''}
              onChange={(e) => setScreenId(Number(e.target.value) || null)}
            >
              <option value="">— pilih layar —</option>
              {screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </Field>

          <Button onClick={() => void handleAnalyze()} disabled={!screenId} loading={analyzing}>
            Analisis & buat draf
          </Button>
        </div>
        {screens.length === 0 && projectId && (
          <p className="mt-3 text-xs text-slate-500">
            Belum ada layar di project ini. Ambil screenshot dulu lewat Capture Studio.
          </p>
        )}
      </Card>

      {!screenId ? (
        <div className="mt-4">
          <EmptyState
            title="Pilih layar dulu"
            description="Pilih salah satu layar hasil capture untuk dianalisis menjadi draf React."
          />
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-slate-300" />
        </div>
      ) : !draft ? (
        <div className="mt-4">
          <EmptyState
            title="Belum ada draf rekonstruksi"
            description="Tekan 'Analisis & buat draf' untuk membaca struktur layar dan membuat draf React."
          />
        </div>
      ) : (
        <>
          {/* Ringkasan draf */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone={draft.status === 'approved' ? 'success' : draft.status === 'rejected' ? 'danger' : 'warning'}>
              Status: {draft.status}
            </Badge>
            <Badge tone="neutral">{draft.components.length} komponen</Badge>
            <Badge tone={unresolved > 0 ? 'danger' : 'success'}>
              {unresolved > 0 ? `${unresolved} asumsi belum dicek` : 'Semua asumsi sudah dicek'}
            </Badge>
            <span className="text-xs text-slate-500">
              dibuat oleh {draft.generated_by} · {new Date(draft.created_at).toLocaleString('id-ID')}
            </span>
            {canReview && (
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleReview('in_review')}
                >
                  Minta review
                </Button>
                <Button size="sm" onClick={() => void handleReview('approved')}>
                  Setujui draf
                </Button>
              </div>
            )}
          </div>

          {/* Perbandingan: asli vs wireframe */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Tampilan asli" description="Screenshot hasil capture (versi termasking).">
              {screenshot ? (
                <img
                  src={screenshot}
                  alt="Tampilan asli"
                  className="w-full rounded border border-slate-200"
                />
              ) : (
                <div className="grid aspect-[16/10] place-items-center text-xs text-slate-400">
                  Screenshot tidak tersedia
                </div>
              )}
            </Card>

            <Card
              title="Draf struktur"
              description="Peta komponen yang terdeteksi mesin — bandingkan dengan aslinya."
            >
              <Wireframe draft={draft} />
            </Card>
          </div>

          {/* Komponen */}
          <Card title="Komponen terdeteksi" className="mt-4">
            {grouped.map(([region, components]) => (
              <div key={region} className="mb-4 last:mb-0">
                <p className="mb-1.5 text-[13px] font-medium capitalize text-slate-700">{region}</p>
                <ul className="flex flex-wrap gap-2">
                  {components.map((component) => (
                    <li key={component.id}>
                      <div
                        className={cn(
                          'rounded border px-2.5 py-1.5 text-xs',
                          COMPONENT_COLOR[component.component_type] ?? 'border-slate-300 bg-slate-50 text-slate-700',
                        )}
                      >
                        <span className="font-medium">{component.component_type}</span>
                        {component.label && <span className="ml-1.5 opacity-80">{component.label}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              Label komponen bisa dikoreksi manual bila mesin salah membaca.
            </p>
            <ul className="mt-2 space-y-2">
              {(draft.components ?? []).slice(0, 12).map((component) => (
                <li key={component.id} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-slate-400">
                    {component.component_type}
                  </span>
                  <input
                    className="input h-8 py-1 text-[13px]"
                    defaultValue={component.label ?? ''}
                    placeholder="label komponen"
                    onBlur={(e) => {
                      if (e.target.value !== (component.label ?? '')) {
                        void handleComponentEdit(component, e.target.value)
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          </Card>

          {/* Asumsi */}
          <Card
            title="Asumsi yang harus dicek manusia"
            description="Aturan bisnis tidak bisa dibaca dari tampilan. Centang setiap asumsi yang sudah Anda verifikasi."
            className="mt-4"
          >
            <ul className="space-y-2">
              {draft.assumptions.map((assumption) => (
                <li
                  key={assumption.id}
                  className="flex items-start gap-3 rounded border border-slate-200 px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => void handleResolve(assumption.id, !assumption.resolved)}
                    aria-label={assumption.resolved ? 'Batalkan tanda dicek' : 'Tandai sudah dicek'}
                    className={cn(
                      'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors',
                      assumption.resolved
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white hover:border-slate-400',
                    )}
                  >
                    {assumption.resolved && <IconCheck size={13} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-slate-900">{assumption.topic}</span>
                      <Badge tone={CONFIDENCE_TONE[assumption.confidence] ?? 'neutral'}>
                        keyakinan {assumption.confidence}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{assumption.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Kode */}
          <Card
            title="Draf React + TypeScript"
            description="Bisa diedit langsung di sini. Setiap perubahan mengembalikan status ke draft."
            className="mt-4"
            actions={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void navigator.clipboard?.writeText(code)}
                >
                  <IconExternal size={13} /> Salin
                </Button>
                <Button size="sm" onClick={() => void handleSaveCode()}>
                  Simpan kode
                </Button>
              </div>
            }
          >
            <textarea
              className="input min-h-[380px] font-mono text-[12px] leading-relaxed"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
            />
          </Card>
        </>
      )}
    </div>
  )
}

function Wireframe({ draft }: { draft: Reconstruction }) {
  const viewport = draft.layout?.viewport ?? { width: 1440, height: 900 }
  const regions = draft.layout?.regions ?? {}
  const sections = (draft.layout as { sections?: DraftSection[] } | null)?.sections ?? []
  const vw = viewport.width || 1440
  const vh = viewport.height || 900

  const pct = (value: number, total: number) => `${(value / total) * 100}%`

  return (
    <div
      className="relative w-full overflow-hidden rounded border border-slate-200 bg-slate-50"
      style={{ aspectRatio: `${vw} / ${vh}` }}
    >
      {/* Area sidebar bila terdeteksi */}
      {regions.sidebar && (
        <div
          className="absolute top-0 bg-ink-900/90"
          style={{
            left: 0,
            width: pct(regions.sidebar.w, vw),
            height: '100%',
          }}
        >
          <span className="absolute left-1.5 top-1.5 text-[9px] font-medium text-white/70">
            sidebar
          </span>
        </div>
      )}

      {/* Blueprint per section */}
      {sections.map((section) => (
        <div
          key={section.index}
          className="absolute rounded border border-dashed border-slate-300 bg-white/80"
          style={{
            left: pct(section.x, vw),
            top: pct(section.top, vh),
            width: pct(section.width, vw),
            height: pct(Math.max(section.height, 24), vh),
            minWidth: 90,
          }}
        >
          <span className="absolute -top-[9px] left-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-white">
            {section.index}. {section.label}
          </span>
          <div className="flex flex-wrap gap-1 p-1.5">
            {section.types.map((type) => (
              <span
                key={type}
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[9px] text-slate-600"
              >
                {type}
                <span className="ml-1 text-slate-400">×{countOf(section.items, type)}</span>
              </span>
            ))}
          </div>
        </div>
      ))}

      {sections.length === 0 && (
        <div className="grid h-full place-items-center text-xs text-slate-400">
          Belum ada struktur yang bisa digambar
        </div>
      )}
    </div>
  )
}

interface DraftSection {
  index: number
  label: string
  types: string[]
  top: number
  height: number
  x: number
  width: number
  items: { type: string; label: string | null }[]
}

function countOf(items: { type: string }[], type: string): number {
  return items.filter((item) => item.type === type).length
}
