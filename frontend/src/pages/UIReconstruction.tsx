import { useCallback, useEffect, useState } from 'react'
import { applicationsApi, projectsApi, ApiError } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { screensApi } from '../lib/capture'
import type { Screen } from '../lib/capture'
import { reconstructionApi } from '../lib/reconstruction'
import type { Reconstruction, ReconstructionComponent, UsabilityCheckResult } from '../lib/reconstruction'
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
import { IconWarning, IconInfo, IconMagic } from '../components/icons'
import { HotspotEditor, type HotspotBox } from '../components/HotspotEditor'
import { AIResultPanel } from '../components/AIResultPanel'

const CONFIDENCE_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
}

const USABILITY_WARNING_FALLBACK =
  'Draf ini belum bisa dipakai Simulation Builder: belum ada komponen hasil AI Vision atau koreksi manual. Jalankan AI Vision.'

function convertComponentsToHotspots(draft: Reconstruction): HotspotBox[] {
  const boxes: HotspotBox[] = []
  const tombstones = new Set((draft.layout?.tombstones ?? []).map((value) => String(value)))

  for (const component of draft.components ?? []) {
    const rawId = String(component.id)
    if (
      tombstones.has(rawId)
      || tombstones.has(`auto_${rawId}`)
      || tombstones.has(`manual_${rawId}`)
    ) {
      continue
    }
    const props = component.props || {}
    const box = props.box
    
    if (!box || typeof box.x !== 'number' || typeof box.y !== 'number') {
      continue // Skip components without valid coordinates
    }
    
    // Determine element type from component
    let elementType: 'button' | 'dropdown' | 'input_data' = 'button'
    if (component.element_type === 'dropdown' || component.component_type === 'dropdown') {
      elementType = 'dropdown'
    } else if (component.element_type === 'input_data' || component.component_type === 'field' || component.component_type === 'input') {
      elementType = 'input_data'
    }
    
    boxes.push({
      id: `comp-${component.id}`,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      label: component.label || component.component_type,
      action: typeof props.action === 'string' ? props.action : '',
      component_type: component.component_type,
      layer: component.source === 'manual' || component.region === 'manual' ? 'manual' : 'auto',
      source: component.source,
      element_type: elementType,
      config_json: component.config_json || undefined,
    })
  }
  
  return boxes
}

function getComponentsWithoutPosition(draft: Reconstruction): ReconstructionComponent[] {
  return (draft.components ?? []).filter(component => {
    const props = component.props || {}
    const box = props.box
    return !box || typeof box.x !== 'number' || typeof box.y !== 'number'
  })
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
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [usability, setUsability] = useState<UsabilityCheckResult | null>(null)
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [pendingApproveStatus, setPendingApproveStatus] = useState<'approved' | 'in_review' | 'rejected' | null>(null)
  
  // Hotspot editor state
  const [hotspots, setHotspots] = useState<HotspotBox[]>([])
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const loadDraft = useCallback(async (id: number): Promise<Reconstruction | null> => {
    try {
      const result = await reconstructionApi.get(id)
      setDraft(result)
      setCode(result.code_text ?? '')
      
      // Convert reconstruction components to hotspot boxes
      const boxes = convertComponentsToHotspots(result)
      setHotspots(boxes)

      // Check usability for generator
      try {
        const usabilityResult = await reconstructionApi.checkUsability(id)
        setUsability(usabilityResult)
      } catch {
        setUsability(null)
      }
      return result
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setDraft(null)
        setCode('')
        setHotspots([])
        setUsability(null)
        return null
      }

      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal memuat draf rekonstruksi. Periksa koneksi lalu coba lagi.',
      )
      return null
    }
  }, [])

  const saveHotspotsToBackend = useCallback(async (boxes: HotspotBox[]) => {
    if (!screenId || !draft) return
    
    try {
      // Update existing components with new positions
      for (const box of boxes) {
        if (box.id.startsWith('comp-')) {
          const componentId = parseInt(box.id.replace('comp-', ''), 10)
          if (!isNaN(componentId)) {
            const existingComponent = draft.components.find(c => c.id === componentId)
            if (existingComponent) {
              const props = existingComponent.props || {}
              const oldBox = props.box
              const currentAction = typeof props.action === 'string' ? props.action : ''
              const nextBox = { x: box.x, y: box.y, w: box.w, h: box.h }
              const changed = (
                !oldBox
                || oldBox.x !== box.x
                || oldBox.y !== box.y
                || oldBox.w !== box.w
                || oldBox.h !== box.h
                || existingComponent.label !== box.label
                || currentAction !== (box.action ?? '')
                || (box.component_type !== undefined
                  && existingComponent.component_type !== box.component_type)
              )

              if (changed) {
                await reconstructionApi.updateComponent(componentId, {
                  label: box.label ?? existingComponent.label,
                  notes: existingComponent.notes,
                  region: existingComponent.region,
                  component_type: box.component_type ?? existingComponent.component_type,
                  element_type: box.element_type ?? existingComponent.element_type,
                  config_json: existingComponent.config_json,
                  props: {
                    ...props,
                    box: nextBox,
                    action: box.action ?? currentAction,
                  },
                })
              }
            }
          }
        } else if (box.layer === 'manual') {
          // Create new manual component
          await reconstructionApi.createComponent(screenId, {
            region: box.component_type === 'nav-item' ? 'sidebar' : box.component_type === 'header-item' ? 'header' : 'main',
            component_type: box.component_type,
            label: box.label,
            props: {
              box: { x: box.x, y: box.y, w: box.w, h: box.h },
              action: box.action,
            },
            element_type: box.element_type || 'button',
            config_json: box.config_json,
          })
        }
      }
      
      // Refresh draft to get updated components
      await loadDraft(screenId)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal menyimpan perubahan hotspot ke server.',
      )
    }
  }, [screenId, draft, loadDraft])

  const handleDeleteBoxes = useCallback(async (ids: string[]) => {
    if (!screenId || !draft || ids.length === 0) return

    try {
      const autoTombstones: string[] = []
      for (const id of ids) {
        if (!id.startsWith('comp-')) continue
        const componentId = Number(id.replace('comp-', ''))
        if (!Number.isFinite(componentId)) continue
        const component = draft.components.find((item) => item.id === componentId)
        if (!component) continue

        if (component.source === 'manual' || component.region === 'manual') {
          await reconstructionApi.deleteComponent(componentId)
        } else {
          autoTombstones.push(String(componentId))
        }
      }

      if (autoTombstones.length > 0) {
        const deleted = Array.from(new Set([
          ...(draft.layout?.tombstones ?? []).map((value) => String(value)),
          ...autoTombstones,
        ]))
        await reconstructionApi.updateHotspotState(screenId, {
          deleted,
          overrides: draft.layout?.overrides ?? {},
        })
      }

      await loadDraft(screenId)
      setNotice('Hotspot yang dihapus berhasil disimpan')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal menyimpan penghapusan hotspot ke server.',
      )
    }
  }, [screenId, draft, loadDraft])

  const handleHotspotsChange = useCallback((boxes: HotspotBox[]) => {
    setHotspots(boxes)
    // Debounced save to backend
    setTimeout(() => {
      void saveHotspotsToBackend(boxes)
    }, 500)
  }, [saveHotspotsToBackend])

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

  useEffect(() => {
    if (screenId) {
      void loadDraft(screenId)
    } else {
      setDraft(null)
      setCode('')
      setScreenshot(null)
      setHotspots([])
    }
  }, [screenId, loadDraft])

  // Load screenshot when screen changes
  useEffect(() => {
    if (!screenId) return
    void (async () => {
      try {
        const url = await screensApi.screenshotUrl(screenId, true)
        setScreenshot(url)
      } catch {
        setScreenshot(null)
      }
    })()
  }, [screenId])

  const handleAnalyze = useCallback(async () => {
    if (!screenId) return
    setAnalyzing(true)
    setError(null)
    try {
      await reconstructionApi.analyze(screenId)
      await loadDraft(screenId)
      setNotice('Analisis selesai — draf dibuat')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Analisis gagal')
    } finally {
      setAnalyzing(false)
    }
  }, [screenId, loadDraft])

  const handleAIAnalyze = useCallback(async () => {
    if (!screenId) return
    setAnalyzing(true)
    setError(null)
    setNotice(null)
    try {
      const response = await reconstructionApi.aiAnalyze(screenId, true)
      const updated = await loadDraft(screenId)
      if (
        response.status === 'success'
        && updated?.layout?.ai_status === 'success'
      ) {
        setNotice('AI Vision selesai — draf diperbarui')
      } else {
        setError(
          response.error
          || updated?.layout?.ai_error
          || response.message
          || 'AI Vision gagal.',
        )
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'AI Vision gagal')
    } finally {
      setAnalyzing(false)
    }
  }, [screenId, loadDraft])

  const handleReview = useCallback(async (status: 'in_review' | 'approved' | 'rejected') => {
    if (!screenId || !draft) return

    // If approving and usability is 0, show confirmation dialog
    if (status === 'approved' && usability && usability.usable_count === 0) {
      setPendingApproveStatus(status)
      setShowApproveConfirm(true)
      return
    }

    try {
      await reconstructionApi.review(screenId, status)
      const updated = await reconstructionApi.get(screenId)
      setDraft(updated)
      setNotice(`Draf di${status === 'approved' ? 'setujui' : status === 'rejected' ? 'tolak' : 'minta review'}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Review gagal')
    }
  }, [screenId, draft, usability])

  const handleConfirmApprove = useCallback(async () => {
    if (!screenId || !draft || !pendingApproveStatus) return
    try {
      await reconstructionApi.review(screenId, pendingApproveStatus)
      const updated = await reconstructionApi.get(screenId)
      setDraft(updated)
      setNotice(`Draf di${pendingApproveStatus === 'approved' ? 'setujui' : pendingApproveStatus === 'rejected' ? 'tolak' : 'minta review'}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Review gagal')
    } finally {
      setShowApproveConfirm(false)
      setPendingApproveStatus(null)
    }
  }, [screenId, draft, pendingApproveStatus])

  if (!appId) {
    return (
      <EmptyState title="Belum ada aplikasi" description="Buat aplikasi di halaman Application Registry." />
    )
  }

  const unresolved = draft?.assumptions?.filter((a) => !a.resolved).length ?? 0
  const canWrite = can('screens:write')
  const canReview = can('screens:review')

  return (
    <div className="space-y-6">
      <PageHeader
        title="UI Reconstruction"
        description="Analisis screenshot, buat draf struktur UI, dan kelola asumsi."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void loadScreens()}>Muat ulang</Button>
          </div>
        }
      />

      {error && <Alert tone="danger" title={error} />}
      {notice && <Alert tone="success" title={notice} />}

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Aplikasi">
            <select
              className="input min-w-[200px]"
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
              <option value="">— pilih —</option>
              {screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({new Date(s.captured_at).toLocaleString('id-ID')})
                </option>
              ))}
            </select>
          </Field>

          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant={analyzing ? 'secondary' : 'primary'}
              disabled={analyzing || !screenId || !canWrite}
              onClick={handleAnalyze}
            >
              <Spinner className={analyzing ? 'h-3.5 w-3.5 mr-1' : 'hidden'} />
              Analisis & buat draf
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={analyzing || !screenId || !canWrite}
              onClick={handleAIAnalyze}
            >
              <IconMagic size={14} className="mr-1" />
              AI Vision
            </Button>
          </div>
        </div>
      </Card>

      {screenId && !draft && (
        <div className="space-y-6">
          <EmptyState title="Belum ada draf" description="Klik 'Analisis & buat draf' untuk memulai." />
          <AIResultPanel
            draft={draft}
            analyzing={analyzing}
            canRunAI={canWrite}
            onRunAI={() => void handleAIAnalyze()}
          />
        </div>
      )}

      {draft && (
        <div className="space-y-6">
          {/* Ringkasan draf */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone={draft.status === 'approved' ? 'success' : draft.status === 'rejected' ? 'danger' : 'warning'}>
              Status: {draft.status}
            </Badge>
            <Badge tone="neutral">{draft.components.length} komponen</Badge>
            <Badge tone={unresolved > 0 ? 'danger' : 'success'}>
              {unresolved > 0 ? `${unresolved} asumsi belum dicek` : 'Semua asumsi sudah dicek'}
            </Badge>
            {/* Generator Usability Warning */}
            {usability && usability.usable_count === 0 && (
              <Badge tone="warning">
                <span className="flex items-center gap-1">
                  <IconWarning size={10} />
                  Usable AI/manual: {usability.valid_components} komponen
                </span>
              </Badge>
            )}
            {usability && usability.usable_count > 0 && (
              <Badge tone="success">
                <span className="flex items-center gap-1">
                  <IconInfo size={10} />
                  AI/manual usable: {usability.usable_count} elemen
                </span>
              </Badge>
            )}
            <span className="text-xs text-slate-500">
              dibuat oleh {draft.generated_by} · {new Date(draft.created_at).toLocaleString('id-ID')}
            </span>
            
            {/* AI Status & Model Badge */}
            {draft.layout?.ai_status && (
              <>
                {draft.layout.ai_status === 'success' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone="success">
                      <span className="flex items-center gap-1">
                        <IconInfo size={10} /> AI Vision aktif
                      </span>
                    </Badge>
                    <Badge tone="neutral">
                      {draft.layout.ai_model || 'Gemini'}
                    </Badge>
                    {draft.layout.ai_source === 'fallback' && (
                      <Badge tone="warning">
                        <span className="flex items-center gap-1">
                          <IconWarning size={10} /> Dianalisis dengan model cadangan
                        </span>
                      </Badge>
                    )}
                  </div>
                )}
                {draft.layout.ai_status === 'failed' && (
                  <Badge tone="danger">
                    <span className="flex items-center gap-1">
                      <IconWarning size={10} /> AI gagal: {draft.layout.ai_error || 'Unknown error'}
                    </span>
                  </Badge>
                )}
                {draft.layout.ai_status === 'not_configured' && (
                  <Badge tone="warning">
                    <span className="flex items-center gap-1">
                      <IconWarning size={10} /> AI belum aktif: {draft.layout.ai_error || 'GEMINI_API_KEY tidak dikonfigurasi'}
                    </span>
                  </Badge>
                )}
              </>
            )}
            
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

          <AIResultPanel
            draft={draft}
            analyzing={analyzing}
            canRunAI={canWrite}
            onRunAI={() => void handleAIAnalyze()}
          />

          {usability && usability.usable_count === 0 && (
            <Alert
              tone="warning"
              title={usability.warning ?? USABILITY_WARNING_FALLBACK}
            >
              Pemeriksaan usability di atas hanya menghitung komponen AI Vision
              (<code>ai-vision</code>) dan koreksi manual (<code>manual</code>) yang valid.
              Generator sendiri juga dapat memakai sumber lain yang lolos filter, termasuk item
              section layout. Jalankan AI Vision atau tambah hotspot manual agar jumlah komponen
              AI/manual yang dapat digunakan bertambah.
            </Alert>
          )}

          {/* Perbandingan: asli vs Draf struktur (editor kotak) */}
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
              title="Draf struktur (Editor Kotak)"
              description="Screenshot dengan overlay kotak komponen. Drag/resize kotak, klik kanan untuk menu, B untuk gambar kotak manual."
            >
              {screenshot ? (
                <>
                  {!isEditorOpen ? (
                    <div className="grid aspect-[16/10] place-items-center gap-4 p-8 border-2 border-dashed border-white/20 rounded-xl">
                      <div className="text-center">
                        <p className="text-lg font-medium text-slate-300">Editor Kotak Hotspot</p>
                        <p className="text-sm text-slate-500 mt-1">
                          Klik tombol di bawah untuk membuka editor mode layar penuh
                        </p>
                        <img
                          src={screenshot}
                          alt="Preview screenshot"
                          className="mt-4 max-h-48 mx-auto rounded border border-white/10 shadow-lg"
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="flex justify-center gap-3 py-4">
                    {!isEditorOpen && screenshot && (
                      <button
                        type="button"
                        onClick={() => setIsEditorOpen(true)}
                        disabled={!canWrite}
                        title={canWrite ? undefined : 'Anda tidak memiliki izin screens:write'}
                        className="h-10 px-5 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Buka Editor Layar Penuh
                      </button>
                    )}
                  </div>
                  {isEditorOpen && (
                    <HotspotEditor
                      screenId={screenId ?? undefined}
                      screenshot={screenshot}
                      boxes={hotspots}
                      saving={false}
                      onChange={handleHotspotsChange}
                      onDeleteBoxes={(ids) => void handleDeleteBoxes(ids)}
                      onClose={() => setIsEditorOpen(false)}
                      onSaveManual={undefined}
                    />
                  )}
                </>
              ) : (
                <div className="grid aspect-[16/10] place-items-center text-xs text-slate-400">
                  Screenshot tidak tersedia untuk editor kotak
                </div>
              )}
            </Card>
          </div>

          {/* Komponen tanpa posisi */}
          {getComponentsWithoutPosition(draft).length > 0 && (
            <Card title="Komponen belum memiliki posisi" className="mt-4">
              <p className="text-sm text-slate-600 mb-2">
                {getComponentsWithoutPosition(draft).length} komponen tidak memiliki koordinat (x, y). 
                Gunakan editor di atas untuk menempatkan kotak, atau klik kanan pada area kosong untuk menambah kotak manual.
              </p>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {getComponentsWithoutPosition(draft).map((component) => (
                  <li key={component.id} className="text-xs text-slate-700 flex items-center gap-2">
                    <Badge tone="neutral">{component.component_type}</Badge>
                    <span>{component.label || '(tanpa label)'}</span>
                    <span className="text-slate-400">(source: {component.source})</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Asumsi */}
          {draft.assumptions && draft.assumptions.length > 0 && (
            <Card title="Asumsi (wajib dicek manusia)">
              <ul className="space-y-2">
                {draft.assumptions.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 p-3 rounded border border-slate-200 bg-slate-50">
                    <Badge tone={CONFIDENCE_TONE[a.confidence]}>{a.confidence}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800">{a.topic}</p>
                      <p className="text-sm text-slate-600">{a.description}</p>
                    </div>
                    {a.resolved ? (
                      <Badge tone="success">Sudah dicek</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline-primary"
                        disabled={!canWrite}
                        onClick={() => void reconstructionApi.resolve(a.id).then(() => void loadDraft(screenId!))}
                      >
                        Tandai dicek
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Kode React */}
          <Card title="Kode React (draf)" description="Hasil generasi — bisa diedit manual.">
            <div className="relative">
              <textarea
                className="w-full h-[400px] font-mono text-sm p-3 border border-slate-300 rounded bg-slate-50 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={code}
                readOnly={!canWrite}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
              />
              <div className="absolute top-2 right-2 flex gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigator.clipboard.writeText(code)}
                >
                  Salin
                </Button>
                <Button
                  size="sm"
                  disabled={!canWrite || code === draft.code_text}
                  title={canWrite ? undefined : 'Anda tidak memiliki izin screens:write'}
                  onClick={async () => {
                    try {
                      await reconstructionApi.updateCode(draft.screen_id, code)
                      const updated = await reconstructionApi.get(screenId!)
                      setDraft(updated)
                      setNotice('Kode disimpan')
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : 'Gagal simpan kode')
                    }
                  }}
                >
                  Simpan
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Confirmation Dialog for Approving Unusable Draft */}
      {showApproveConfirm && usability && usability.usable_count === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-amber-100 text-amber-600">
                <IconWarning size={24} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Peringatan: Draf Tidak Usable Generator</h3>
            </div>
            <p className="text-slate-600 mb-4">
              {usability.warning ?? USABILITY_WARNING_FALLBACK}
            </p>
            <p className="text-slate-600 mb-4">
              Draf ini memiliki <strong>0 elemen usable</strong> oleh Simulation Generator.
              Pemeriksaan <code>usable_count</code> hanya menghitung komponen AI Vision
              (<code>ai-vision</code>) dan koreksi manual (<code>manual</code>) yang valid. Filter
              generator sebenarnya juga dapat memproses sumber valid lain, termasuk item section
              layout.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
              <p className="font-medium mb-1">Detail:</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Komponen valid (ai-vision/manual): <strong>{usability.valid_components}</strong></li>
                <li>Item section layout: <strong>{usability.section_items}</strong></li>
                <li>Jumlah section: <strong>{usability.sections_count}</strong></li>
              </ul>
            </div>
            <p className="text-slate-600 text-sm mb-6">
              Jika draf ini ternyata tidak punya komponen atau section yang bisa dipakai,
              Simulation Builder akan gagal generate untuk layar ini dengan pesan:
              <br />
              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                "Rekonstruksi tidak punya komponen atau section yang bisa dipakai"
              </code>
            </p>
            <p className="text-slate-600 text-sm mb-6">
              <strong>Saran:</strong> Jalankan <strong>AI Vision</strong> untuk menghasilkan komponen ai-vision,
              atau tambah komponen manual via editor kotak, sebelum menyetujui.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowApproveConfirm(false); setPendingApproveStatus(null); }}>
                Batal
              </Button>
              <Button variant="danger" onClick={handleConfirmApprove}>
                Tetap Setujui
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}