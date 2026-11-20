import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { screensApi } from '../lib/capture'
import { simulationApi, tutorialApi, workflowApi } from '../lib/simulation'
import type {
  SimRow,
  SimulationDefinition,
  Tutorial,
  WorkflowDefinition,
  WorkflowRecord,
} from '../lib/simulation'
import { Alert, Badge, Button, Card, EmptyState, Spinner, cn } from '../components/ui'
import { IconSearch } from '../components/icons'

const ROLES = [
  { key: 'staf', label: 'Staf' },
  { key: 'manager', label: 'Manajer' },
]

/**
 * Simulation Player - ini yang dilihat klien saat demo.
 * Semua data adalah data dummy di dalam simulasi (tidak menyentuh aslinya).
 */
export function SimulationPlayerPage() {
  const { projectId } = useParams()
  const [params, setParams] = useSearchParams()
  const [definition, setDefinition] = useState<SimulationDefinition | null>(null)
  const [screenKey, setScreenKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [role, setRole] = useState('staf')
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null)
  const [records, setRecords] = useState<WorkflowRecord[]>([])
  const [tutorials, setTutorials] = useState<Tutorial[]>([])
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<SimRow | null>(null)

  // Tutorial (guided walkthrough)
  const [tutorial, setTutorial] = useState<Tutorial | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [spotlight, setSpotlight] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  )
  const [spotlightMissing, setSpotlightMissing] = useState(false)
  const [showHotspots, setShowHotspots] = useState(false)

  // Dropdown & Input Data state (persisted during simulation session)
  const [dropdownStates, setDropdownStates] = useState<Record<string, string>>({})
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null)
  const [inputDataStates, setInputDataStates] = useState<Record<string, any>>({})

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const data = await simulationApi.getByProject(Number(projectId))
      setDefinition(data)
      const urlScreen = params.get('screen')
      const initialScreen = urlScreen && data.screens.some(s => s.key === urlScreen)
        ? urlScreen
        : data.screens[0]?.key ?? null
      setScreenKey(initialScreen)

      try {
        const flow = await workflowApi.get(data.id)
        setWorkflow(flow)
        setRecords(await workflowApi.records(data.id))
      } catch {
        setWorkflow(null)
      }
      try {
        setTutorials(await tutorialApi.list(data.id))
      } catch {
        setTutorials([])
      }
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Simulasi belum tersedia')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const screen = useMemo(
    () => definition?.screens.find((item) => item.key === screenKey),
    [definition, screenKey],
  )

  // Muat screenshot untuk layar yang dipakai di visual clone mode
  useEffect(() => {
    const srcId = screen?.source_screen_id ?? null
    if (!srcId) {
      setScreenshotUrl(null)
      return
    }
    void (async () => {
      try {
        const url = await screensApi.screenshotUrl(srcId, true)
        setScreenshotUrl(url)
      } catch {
        setScreenshotUrl(null)
      }
    })()
  }, [screen?.source_screen_id])

  const datasetName = screen?.layout.table?.dataset ?? screen?.layout.form?.dataset ?? null
  const dataset = datasetName ? definition?.datasets[datasetName] : undefined
  const columns = dataset?.schema ?? []
  const pageSize = screen?.layout.table?.page_size ?? 6

  const rows = useMemo(() => {
    let list = [...(dataset?.rows ?? [])]
    if (search.trim()) {
      const needle = search.toLowerCase()
      list = list.filter((row) =>
        Object.entries(row).some(
          ([key, value]) => key !== '_id' && String(value ?? '').toLowerCase().includes(needle),
        ),
      )
    }
    if (sortKey) {
      list.sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]
        const cmp =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av ?? '').localeCompare(String(bv ?? ''))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [dataset, search, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const cards = useMemo(() => {
    const result: { label: string; value: string }[] = []
    const datasetRows = dataset?.rows ?? []
    for (const card of screen?.layout.cards ?? []) {
      const source = card.dataset ? definition?.datasets[card.dataset] : dataset
      const sourceRows = source?.rows ?? []
      if (!source) {
        result.push({ label: card.label, value: '—' })
        continue
      }

      // 1) Kalau label kartu mengandung salah satu nilai kolom
      //    (mis. kartu "Risiko Tinggi" dan kolom "Tingkat" berisi "Tinggi")
      //    -> tampilkan jumlah baris yang cocok.
      let matched = 0
      let matchedColumn = false
      const target = card.label.trim().toLowerCase()
      for (const column of source?.schema ?? []) {
        const values = new Set(
          sourceRows
            .map((row) => String(row[column.key] ?? '').trim().toLowerCase())
            .filter((value) => value.length >= 4),
        )
        const hits = [...values].filter((value) => target.includes(value))
        if (hits.length > 0) {
          matched = sourceRows.filter((row) =>
            hits.includes(String(row[column.key] ?? '').trim().toLowerCase()),
          ).length
          matchedColumn = true
          break
        }
      }
      if (matchedColumn) {
        result.push({ label: card.label, value: String(matched) })
        continue
      }

      // 2) Kalau ada kolom numerik -> tampilkan rata-ratanya
      const numbers = datasetRows
        .map((row) => Number(row.nilai_risiko ?? row.nilai ?? NaN))
        .filter((value) => !Number.isNaN(value))
      if (numbers.length > 0) {
        result.push({
          label: card.label,
          value: String(Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length)),
        })
        continue
      }

      // 3) Fallback: jumlah baris
      result.push({ label: card.label, value: String(sourceRows.length) })
    }
    return result
  }, [screen, definition, dataset])

  /* ---------------- Workflow ---------------- */

  const recordFor = useCallback(
    (rowId: string): WorkflowRecord | undefined => records.find((r) => r.row_id === rowId),
    [records],
  )

  const stateLabel = useCallback(
    (key: string): string =>
      workflow?.states.find((state) => state.key === key)?.label ?? key,
    [workflow],
  )

  const actionsFor = useCallback(
    (rowId: string) => {
      if (!workflow) return []
      const current = recordFor(rowId)?.current_state ?? workflow.initial_state
      return workflow.transitions.filter(
        (transition) =>
          transition.from === current && (!transition.role || transition.role === role),
      )
    },
    [workflow, recordFor, role],
  )

  async function runTransition(row: SimRow, action: string, label: string) {
    if (!definition || !datasetName) return
    try {
      await workflowApi.transition(definition.id, {
        dataset: datasetName,
        row_id: row._id,
        action,
        role,
      })
      setNotice(`Status diperbarui: ${label}.`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah status')
    }
  }

  /* ---------------- Navigasi & form ---------------- */

  function switchScreen(key: string) {
    setScreenKey(key)
    setSearch('')
    setSortKey(null)
    setPage(1)
    setFormOpen(false)
    setEditingRow(null)
    params.set('screen', key)
    setParams(params, { replace: true })
  }

  function openCreate() {
    setEditingRow(null)
    setFormValues(Object.fromEntries(columns.map((column) => [column.key, ''])))
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(row: SimRow) {
    setEditingRow(row)
    setFormValues({ ...row })
    setFormError(null)
    setFormOpen(true)
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault()
    if (!definition || !datasetName) return

    const missing = (screen?.layout.form?.fields ?? []).filter(
      (field) => field.required && !String(formValues[field.key] ?? '').trim(),
    )
    if (missing.length > 0) {
      setFormError(`Wajib diisi: ${missing.map((field) => field.label).join(', ')}`)
      return
    }
    const badNumber = (screen?.layout.form?.fields ?? []).find(
      (field) =>
        field.type === 'number' &&
        String(formValues[field.key] ?? '').trim() !== '' &&
        Number.isNaN(Number(formValues[field.key])),
    )
    if (badNumber) {
      setFormError(`${badNumber.label} harus berupa angka`)
      return
    }

    const payload: Record<string, unknown> = {}
    for (const column of columns) payload[column.key] = formValues[column.key] ?? ''

    try {
      if (editingRow) {
        await simulationApi.updateRow(definition.id, datasetName, editingRow._id, payload)
        setNotice('Data berhasil diperbarui.')
      } else {
        await simulationApi.addRow(definition.id, datasetName, payload)
        setNotice('Data berhasil disimpan.')
      }
      setFormOpen(false)
      setEditingRow(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan data')
    }
  }

  async function removeRow(row: SimRow) {
    if (!definition || !datasetName) return
    if (!window.confirm('Hapus baris ini? (hanya data dummy)')) return
    try {
      await simulationApi.deleteRow(definition.id, datasetName, row._id)
      setNotice('Baris dihapus.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menghapus baris')
    }
  }

  // Handlers for dropdown & input_data
  const handleDropdownSelect = useCallback((hotspotId: number, value: string) => {
    setDropdownStates(prev => ({ ...prev, [hotspotId]: value }))
    setOpenDropdownId(null)
  }, [])

  const handleInputDataChange = useCallback((hotspotId: number, value: any) => {
    setInputDataStates(prev => ({ ...prev, [hotspotId]: value }))
  }, [])

  const handleClickOutside = useCallback((e: MouseEvent) => {
    // Close dropdown if click outside
    setOpenDropdownId(null)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpenDropdownId(null)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleClickOutside, handleKeyDown])

  async function resetData() {
    if (!definition) return
    if (!window.confirm('Kembalikan semua data ke kondisi awal?')) return
    try {
      const result = await simulationApi.reset(definition.id)
      setNotice(result.message)
      setDropdownStates({})
      setInputDataStates({})
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal reset data')
    }
  }

  /* ---------------- Tutorial ---------------- */

  const currentStep = tutorial?.steps[stepIndex] ?? null

  useEffect(() => {
    if (!currentStep?.target) {
      setSpotlight(null)
      setSpotlightMissing(false)
      return
    }
    // Ganti layar sesuai langkah tutorial
    if (currentStep.screen && currentStep.screen !== screenKey) {
      switchScreen(currentStep.screen)
    }
    const selector = targetSelector(currentStep.target)
    const element = selector ? document.querySelector(selector) : null
    if (!element) {
      setSpotlight(null)
      setSpotlightMissing(true)
      return
    }
    setSpotlightMissing(false)
    const rect = element.getBoundingClientRect()
    setSpotlight({
      x: rect.left - 6,
      y: rect.top - 6,
      w: rect.width + 12,
      h: rect.height + 12,
    })
  }, [currentStep, screenKey])

  function startTutorial(item: Tutorial) {
    setTutorial(item)
    setStepIndex(0)
  }

  function closeTutorial() {
    setTutorial(null)
    setSpotlight(null)
  }

  if (loading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="h-7 w-7 text-slate-300" />
      </div>
    )
  }

  if (error && !definition) {
    return (
      <div className="p-6">
        <Alert tone="danger" title="Simulasi belum siap">
          {error}
        </Alert>
      </div>
    )
  }

  if (!definition) return null

  const publishedTutorials = tutorials.filter((item) => item.steps.length > 0)

  return (
    <div className="flex h-full bg-slate-50">
      {/* Navigasi aplikasi */}
      <aside className="hidden w-60 shrink-0 flex-col bg-ink-900 md:flex">
        <div className="border-b border-white/5 px-4 py-4">
          <p className="text-[13px] font-semibold text-white">{definition.name}</p>
          <p className="text-[11px] text-slate-500">Simulasi · data dummy</p>
        </div>
        <nav className="flex-1 space-y-px overflow-y-auto px-2.5 py-3">
          {definition.screens.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => switchScreen(item.key)}
              className={`flex w-full items-center gap-2.5 rounded px-2.5 py-[7px] text-left text-[13px] transition-colors ${
                item.key === screenKey
                  ? 'bg-white/[0.08] text-white'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              {item.title}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/5 p-2.5">
          <button
            type="button"
            onClick={() => void resetData()}
            className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-200"
          >
            Reset data
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-900">
              {screen?.layout.title ?? screen?.title}
            </h1>
            {screen?.layout.subtitle && (
              <p className="truncate text-[11px] text-slate-500">{screen.layout.subtitle}</p>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {workflow && (
              <div className="flex items-center gap-1 rounded border border-slate-200 p-0.5">
                <span className="px-1.5 text-[11px] text-slate-500">Peran</span>
                {ROLES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setRole(item.key)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      role === item.key
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            {publishedTutorials.length > 0 && (
              <div className="flex items-center gap-1">
                {publishedTutorials.map((item) => (
                  <Button key={item.id} size="sm" variant="secondary" onClick={() => startTutorial(item)}>
                    Tutorial
                  </Button>
                ))}
              </div>
            )}

            <Badge tone="info">Simulasi</Badge>
            {screen?.layout.visual_mode && (
              <Button
                size="sm"
                variant={showHotspots ? 'primary' : 'secondary'}
                onClick={() => setShowHotspots((v) => !v)}
                title="Tampilkan garis bantu area klik interaktif"
              >
                {showHotspots ? 'Garis Klik: Aktif' : 'Lihat Area Klik'}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => void resetData()}>
              Reset data
            </Button>
            {screen?.layout.form && (
              <Button size="sm" onClick={openCreate}>
                Tambah
              </Button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-6">
          {/* --- VISUAL CLONE MODE: screenshot sebagai background + hotspot klik --- */}
          {screen?.layout.visual_mode && screenshotUrl && (
            <VisualClone
              screenshotUrl={screenshotUrl}
              viewport={screen.layout.viewport ?? { width: 1440, height: 900 }}
              hotspots={screen.layout.hotspots ?? []}
              showHotspots={showHotspots}
              onNavigate={(key) => switchScreen(key)}
              onUnmapped={(label) =>
                setNotice(
                  'Area «' + label + '» belum diarahkan ke layar tujuan. Atur di Simulation Builder.',
                )
              }
              dropdownStates={dropdownStates}
              openDropdownId={openDropdownId}
              setOpenDropdownId={setOpenDropdownId}
              onDropdownSelect={(hotspotId, value) => setDropdownStates({ ...dropdownStates, [hotspotId]: value })}
              inputDataStates={inputDataStates}
              onInputDataChange={(hotspotId, value) => setInputDataStates({ ...inputDataStates, [hotspotId]: value })}
            />
          )}

          {/* --- MODE GENERIK (default) --- */}
          {!screen?.layout.visual_mode && (
            <div className="mx-auto max-w-5xl space-y-4">
              {notice && <Alert tone="success">{notice}</Alert>}
              {error && <Alert tone="danger">{error}</Alert>}

              <Alert tone="info" title="Mode tampilan generik">
                Layar ini memakai tampilan generik (kartu & tabel data dummy), bukan klon visual dari
                tangkapan layar. Untuk menampilkannya persis seperti capture, buka <strong>Simulation
                Builder</strong> &rarr; centang <strong>Clone visual</strong> &rarr; klik{' '}
                <strong>Bangun ulang</strong>.
              </Alert>

              {cards.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((card) => (
                  <div key={card.label} className="card px-4 py-3.5" data-sim-card={card.label}>
                    <p className="text-[13px] text-slate-500">{card.label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular text-slate-900">{card.value}</p>
                  </div>
                ))}
              </div>
            )}

            {screen?.layout.table && dataset && (
              <Card
                title="Data"
                description={`${rows.length} baris data dummy${search ? ' (difilter)' : ''}`}
                actions={
                  <div className="relative">
                    <IconSearch
                      size={14}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      className="input h-8 w-52 pl-8 py-1 text-[13px]"
                      placeholder="Cari…"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value)
                        setPage(1)
                      }}
                    />
                  </div>
                }
              >
                {visibleRows.length === 0 ? (
                  <EmptyState
                    title="Belum ada data"
                    description="Tambahkan data melalui tombol Tambah, atau reset ke data awal."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead className="table-head">
                        <tr>
                          {columns.map((column) => (
                            <th key={column.key} className="pb-2.5 pr-4" data-sim-col={column.label}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (sortKey === column.key) {
                                    setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
                                  } else {
                                    setSortKey(column.key)
                                    setSortDir('asc')
                                  }
                                  setPage(1)
                                }}
                                className="inline-flex items-center gap-1 hover:text-slate-800"
                              >
                                {column.label}
                                {sortKey === column.key && (
                                  <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                                )}
                              </button>
                            </th>
                          ))}
                          {workflow && <th className="pb-2.5 pr-4">Alur</th>}
                          <th className="pb-2.5 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row) => {
                          const record = recordFor(row._id)
                          const state = record?.current_state ?? workflow?.initial_state
                          const actions = actionsFor(row._id)
                          return (
                            <tr key={row._id} className="table-row">
                              {columns.map((column) => (
                                <td key={column.key} className="py-2.5 pr-4 text-slate-700">
                                  {String(row[column.key] ?? '')}
                                </td>
                              ))}
                              {workflow && (
                                <td className="py-2.5 pr-4">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge tone="neutral">{stateLabel(state ?? '')}</Badge>
                                    {actions.map((action) => (
                                      <button
                                        key={action.action}
                                        type="button"
                                        onClick={() => void runTransition(row, action.action, action.label)}
                                        className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-[#4268ff] hover:text-[#4268ff]"
                                      >
                                        {action.label}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              )}
                              <td className="py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => openEdit(row)}
                                  className="rounded px-2 py-1 text-xs font-medium text-[#4268ff] hover:bg-[#4268ff]/10"
                                >
                                  Ubah
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeRow(row)}
                                  className="rounded px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                                >
                                  Hapus
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">
                      Halaman {currentPage} dari {totalPages}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={currentPage <= 1}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        Sebelumnya
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage(currentPage + 1)}
                      >
                        Berikutnya
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {formOpen && screen?.layout.form && (
              <Card
                title={editingRow ? 'Ubah data' : 'Tambah data'}
                description="Data ini hanya disimpan di dalam simulasi."
                actions={
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Tutup
                  </button>
                }
              >
                <form onSubmit={submitForm} className="space-y-3">
                  {formError && <Alert tone="danger">{formError}</Alert>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {screen.layout.form.fields.map((field) => (
                      <label key={field.key} className="block">
                        <span className="label">
                          {field.label}
                          {field.required && <span className="ml-1 text-slate-400">*</span>}
                        </span>
                        <input
                          className="input"
                          data-sim-field={field.key}
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={String(formValues[field.key] ?? '')}
                          onChange={(e) =>
                            setFormValues({ ...formValues, [field.key]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="submit">
                      {screen.layout.form.submit_label ?? 'Simpan'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {(screen?.layout.buttons ?? []).length > 0 && screen?.layout.form && (
              <div className="flex flex-wrap gap-2">
                {(screen?.layout.buttons ?? []).map((button) => (
                  <Button key={button.label} variant="secondary" data-sim-button={button.label}>
                    {button.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
        </main>
      </div>

      {/* Overlay tutorial (spotlight) */}
      {tutorial && currentStep && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute bg-slate-900/60 transition-all duration-300"
            style={
              spotlight
                ? {
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${spotlight.y}px, ${spotlight.x}px ${spotlight.y}px, ${spotlight.x}px ${spotlight.y + spotlight.h}px, ${spotlight.x + spotlight.w}px ${spotlight.y + spotlight.h}px, ${spotlight.x + spotlight.w}px 100%, 0 100%)`,
                  }
                : { inset: 0 }
            }
          />
          <div className="absolute bottom-6 left-1/2 w-[min(92vw,520px)] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-4 shadow-overlay">
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                {tutorial.title} · Langkah {stepIndex + 1} dari {tutorial.steps.length}
              </p>
              <button
                type="button"
                onClick={closeTutorial}
                className="text-[11px] text-slate-500 hover:text-slate-800"
              >
                Keluar
              </button>
            </div>
            <p className="text-sm font-medium text-slate-900">{currentStep.instruction}</p>
            {currentStep.expected && (
              <p className="mt-1 text-xs text-slate-500">Hasil yang diharapkan: {currentStep.expected}</p>
            )}
            {spotlightMissing && (
              <p className="mt-1 text-xs text-amber-700">
                Elemen yang disorot tidak ada di layar ini. Lanjutkan ke langkah berikutnya.
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              >
                Sebelumnya
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (stepIndex >= tutorial.steps.length - 1) {
                    closeTutorial()
                    setNotice('Tutorial selesai.')
                  } else {
                    setStepIndex((i) => i + 1)
                  }
                }}
              >
                {stepIndex >= tutorial.steps.length - 1 ? 'Selesai' : 'Berikutnya'}
              </Button>
              <Button size="sm" variant="ghost" onClick={closeTutorial}>
                Lewati
              </Button>
              <div className="ml-auto flex gap-1">
                {tutorial.steps.map((_step, index) => (
                  <span
                    key={index}
                    className={`h-1.5 rounded-full transition-all ${
                      index === stepIndex ? 'w-4 bg-slate-800' : 'w-1.5 bg-slate-300'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Visual Clone: menampilkan tangkapan layar asli sebagai background lalu menaruh
 * area klik transparan di atasnya pada posisi persis seperti elemen aslinya.
 *
 * Semua posisi memakai PERSENTAGE terhadap viewport capture, jadi tampilan tetap
 * presisi meski ukuran layar berbeda (tidak gepeng, tidak terpotong).
 */
function VisualClone({
  screenshotUrl,
  hotspots,
  showHotspots = false,
  onNavigate,
  onUnmapped,
  dropdownStates = {},
  openDropdownId = null,
  setOpenDropdownId = () => {},
  onDropdownSelect = () => {},
  inputDataStates = {},
  onInputDataChange = () => {},
}: {
  screenshotUrl: string
  viewport?: { width: number; height: number }
  hotspots: Array<{
    id: number
    label: string
    type: string
    box: { x: number; y: number; w: number; h: number }
    target_screen_key: string | null
    element_type?: 'button' | 'dropdown' | 'input_data'
    config_json?: string
    action?: string
  }>
  showHotspots?: boolean
  onNavigate: (screenKey: string) => void
  onUnmapped: (label: string) => void
  dropdownStates?: Record<string, string>
  openDropdownId?: number | null
  setOpenDropdownId?: (id: number | null) => void
  onDropdownSelect?: (hotspotId: number, value: string) => void
  inputDataStates?: Record<string, any>
  onInputDataChange?: (hotspotId: number, value: any) => void
}) {
  const safeHotspots = Array.isArray(hotspots) ? hotspots : []

  // Parse config_json for dropdown options
  const getDropdownOptions = (configJson?: string) => {
    if (!configJson) return []
    try {
      const parsed = JSON.parse(configJson)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  // Get display value for dropdown (selected value or original label)
  const getDropdownDisplay = (hotspot: any) => {
    const selected = dropdownStates[hotspot.id]
    if (selected) {
      const options = getDropdownOptions(hotspot.config_json)
      const option = options.find((o: any) => o.value === selected)
      return option?.label || selected
    }
    return hotspot.label
  }

  // Get distinct highlight color based on element_type
  const getHighlightColor = (elementType?: string, isHover = false) => {
    if (showHotspots) {
      if (elementType === 'dropdown') {
        return isHover ? 'border-amber-500 bg-amber-500/35 hover:border-amber-500' : 'border-amber-500/70 bg-amber-500/15'
      }
      if (elementType === 'input_data') {
        return isHover ? 'border-emerald-500 bg-emerald-500/35 hover:border-emerald-500' : 'border-emerald-500/70 bg-emerald-500/15'
      }
      return isHover ? 'border-blue-500 hover:bg-blue-500/35' : 'border-blue-500/70 bg-blue-500/15'
    }
    if (elementType === 'dropdown') {
      return isHover ? 'hover:border-amber-500/60 hover:bg-amber-500/20 hover:shadow-sm' : 'border-transparent bg-transparent hover:border-amber-500/60 hover:bg-amber-500/20 hover:shadow-sm'
    }
    if (elementType === 'input_data') {
      return isHover ? 'hover:border-emerald-500/60 hover:bg-emerald-500/20 hover:shadow-sm' : 'border-transparent bg-transparent hover:border-emerald-500/60 hover:bg-emerald-500/20 hover:shadow-sm'
    }
    return isHover ? 'hover:border-blue-500/60 hover:bg-blue-500/20 hover:shadow-sm' : 'border-transparent bg-transparent hover:border-blue-500/60 hover:bg-blue-500/20 hover:shadow-sm'
  }

  return (
    <div className="flex w-full min-w-0 justify-center">
      {/* 1. Parent wrapper: position relative, ukuran murni mengikuti screenshot dan independen dari sidebar */}
      <div className="relative inline-block max-w-full overflow-hidden rounded border border-slate-200 bg-slate-900 shadow-card">
        {/* Tag <img> screenshot asli: z-0 */}
        <img
          src={screenshotUrl}
          alt="Tampilan asli capture"
          className="relative z-0 block max-w-full h-auto select-none"
          draggable={false}
        />

        {/* 2. Container overlay hotspot: absolute inset-0 dengan z-20 agar posisi pasti di atas gambar */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          {safeHotspots.map((hotspot) => {
            const box = hotspot.box ?? { x: 0, y: 0, w: 0, h: 0 }
            const target = hotspot.target_screen_key
            const elementType = hotspot.element_type || 'button'
            const options = getDropdownOptions(hotspot.config_json)
            const isDropdown = elementType === 'dropdown'
            const isInputData = elementType === 'input_data'
            const isOpen = openDropdownId === hotspot.id
            const displayValue = getDropdownDisplay(hotspot)

            const handleClick = (e: React.MouseEvent) => {
              e.stopPropagation()
              if (isDropdown) {
                setOpenDropdownId(isOpen ? null : hotspot.id)
              } else if (isInputData) {
                const currentValue = inputDataStates[hotspot.id]
                const newValue = prompt(`Input data untuk: ${hotspot.label}`, currentValue ?? '')
                if (newValue !== null) {
                  onInputDataChange(hotspot.id, newValue)
                }
              } else {
                if (target) onNavigate(target)
                else onUnmapped(hotspot.label)
              }
            }

            const handleKeyDown = (e: React.KeyboardEvent) => {
              if (!isDropdown) return
              const opts = options.map((o: any) => o.value).filter(Boolean)
              const currentIndex = opts.indexOf(dropdownStates[hotspot.id])
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                const nextIndex = (currentIndex + 1) % opts.length
                onDropdownSelect(hotspot.id, opts[nextIndex])
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                const prevIndex = (currentIndex - 1 + opts.length) % opts.length
                onDropdownSelect(hotspot.id, opts[prevIndex])
              } else if (e.key === 'Enter' && currentIndex >= 0) {
                e.preventDefault()
                setOpenDropdownId(null)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setOpenDropdownId(null)
              }
            }

            return (
              <div key={hotspot.id} className="absolute" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}>
                {isDropdown && isOpen && (
                  <div
                    className="absolute z-50 w-full mt-1 origin-top"
                    style={{ minWidth: '160px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="rounded-md border border-slate-700 bg-slate-800 shadow-lg overflow-hidden">
                      <ul className="py-1 max-h-48 overflow-auto">
                        {options.map((option: any, index: number) => (
                          <li key={option.value ?? index}>
                            <button
                              type="button"
                              className={cn(
                                'w-full px-3 py-2 text-left text-sm text-slate-100 transition-colors',
                                dropdownStates[hotspot.id] === option.value
                                  ? 'bg-amber-500/30 text-amber-300'
                                  : 'hover:bg-slate-700'
                              )}
                              onClick={(e) => {
                                e.stopPropagation()
                                onDropdownSelect(hotspot.id, option.value)
                                if (hotspot.action) {
                                  console.log('Execute action:', hotspot.action)
                                }
                              }}
                              onKeyDown={handleKeyDown}
                            >
                              {option.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  aria-label={hotspot.label}
                  aria-haspopup={isDropdown ? 'listbox' : undefined}
                  aria-expanded={isDropdown ? isOpen : undefined}
                  onClick={handleClick}
                  onKeyDown={isDropdown ? handleKeyDown : undefined}
                  className={cn(
                    'group absolute cursor-pointer pointer-events-auto rounded transition-all w-full h-full',
                    getHighlightColor(elementType, false),
                    isDropdown && isOpen && 'shadow-md',
                  )}
                >
                  <span className="pointer-events-none absolute -top-6 left-0 z-30 hidden whitespace-nowrap rounded bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white shadow-card group-hover:block">
                    {hotspot.label}
                  </span>
                  {isDropdown && dropdownStates[hotspot.id] && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-2 text-[11px] font-medium text-amber-300 bg-amber-500/20 rounded">
                      {displayValue}
                    </span>
                  )}
                  {isInputData && inputDataStates[hotspot.id] && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-2 text-[11px] font-medium text-emerald-300 bg-emerald-500/20 rounded">
                      {typeof inputDataStates[hotspot.id] === 'string'
                        ? inputDataStates[hotspot.id].substring(0, 20)
                        : 'Data'}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {safeHotspots.length === 0 && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/60 text-slate-200">
            <p className="text-sm font-medium">Tidak ada area klik terdeteksi pada layar ini</p>
            <p className="mt-1 text-xs text-slate-400">
              Tambahkan di UI Reconstruction, lalu bangun ulang simulasi.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Terjemahkan target langkah tutorial menjadi selector CSS. */
function targetSelector(target: string): string | null {
  const [kind, ...rest] = target.split(':')
  const value = rest.join(':')
  if (!value) return null
  if (kind === 'card') return `[data-sim-card="${cssEscape(value)}"]`
  if (kind === 'field') return `[data-sim-field="${cssEscape(value)}"]`
  if (kind === 'col') return `[data-sim-col="${cssEscape(value)}"]`
  if (kind === 'button') return `[data-sim-button="${cssEscape(value)}"]`
  return null
}

function cssEscape(value: string): string {
  return value.replace(/"/g, '\\"')
}
