import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { simulationApi } from '../lib/simulation'
import type { SimRow, SimulationDefinition } from '../lib/simulation'
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../components/ui'
import { IconCheck, IconExternal, IconSearch } from '../components/icons'

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

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<SimRow | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const data = await simulationApi.getByProject(Number(projectId))
      setDefinition(data)
      setScreenKey((current) => current ?? data.screens[0]?.key ?? null)
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
    const rows = dataset?.rows ?? []
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
      const numbers = rows
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

    // Validasi sisi client - sama seperti aturan di master prompt
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

  return (
    <div className="flex h-full bg-slate-50">
      {/* Navigasi aplikasi (meniru aplikasi sumber) */}
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
          <div className="ml-auto flex items-center gap-2">
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
                  <div key={card.label} className="card px-4 py-3.5">
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
                            <th key={column.key} className="pb-2.5 pr-4">
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
                          <th className="pb-2.5 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row) => (
                          <tr key={row._id} className="table-row">
                            {columns.map((column) => (
                              <td key={column.key} className="py-2.5 pr-4 text-slate-700">
                                {String(row[column.key] ?? '')}
                              </td>
                            ))}
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
                        ))}
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

            {/* Tombol dari sumber hanya ditampilkan kalau ada aksi nyata (form) */}
            {(screen?.layout.buttons ?? []).length > 0 && screen?.layout.form && (
              <div className="flex flex-wrap gap-2">
                {(screen?.layout.buttons ?? []).map((button) => (
                  <Button key={button.label} variant="secondary">
                    {button.label}
                    <IconExternal size={12} />
                  </Button>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
