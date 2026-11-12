import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { simulationApi, tutorialApi, workflowApi } from '../lib/simulation'
import type {
  SimRow,
  SimulationDefinition,
  Tutorial,
  WorkflowDefinition,
  WorkflowRecord,
} from '../lib/simulation'
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../components/ui'
import { IconCheck, IconExternal, IconSearch } from '../components/icons'

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

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const data = await simulationApi.getByProject(Number(projectId))
      setDefinition(data)
      setScreenKey((current) => current ?? data.screens[0]?.key ?? null)

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

  async function resetData() {
    if (!definition) return
    if (!window.confirm('Kembalikan semua data ke kondisi awal?')) return
    try {
      const result = await simulationApi.reset(definition.id)
      setNotice(result.message)
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
          <div className="mx-auto max-w-5xl space-y-4">
            {notice && <Alert tone="success">{notice}</Alert>}
            {error && <Alert tone="danger">{error}</Alert>}

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
                                        className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-700"
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
                                  className="rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
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
                      <IconCheck size={14} />
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
                    <IconExternal size={12} />
                  </Button>
                ))}
              </div>
            )}
          </div>
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
