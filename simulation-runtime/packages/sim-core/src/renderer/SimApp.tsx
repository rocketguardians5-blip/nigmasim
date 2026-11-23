import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import {
  HashRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { Badge, type BadgeTone } from '../components/Badge'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { DataTable } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import { useConfirm } from '../hooks/useConfirm'
import { useSimReset } from '../hooks/useSimReset'
import { useToast } from '../hooks/useToast'
import { SimUIProvider } from '../providers'
import type { TableColumn } from '../types'
import { FieldGrid, defaultFormValues, validateForm, type FormValues } from './fields'
import { SimStoresProvider, useDatasetStore, useOptionalDatasetStore, useSimStores } from './store'
import type {
  SimAction,
  SimAppDefinition,
  SimDataset,
  SimPage,
  SimRecord,
  SimSection,
  SimSeedData,
} from './types'

export interface SimAppProps {
  definition: SimAppDefinition
  seed: SimSeedData
  slug: string
}

const DefinitionContext = createContext<SimAppDefinition | null>(null)

/** Renderer generik untuk app yang ditulis generator. */
export function SimApp({ definition, seed, slug }: SimAppProps) {
  return (
    <SimUIProvider>
      <DefinitionContext.Provider value={definition}>
        <SimStoresProvider slug={slug} datasets={definition.datasets} seed={seed}>
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <SimShell definition={definition} slug={slug} />
          </HashRouter>
        </SimStoresProvider>
      </DefinitionContext.Provider>
    </SimUIProvider>
  )
}

function SimShell({ definition, slug }: { definition: SimAppDefinition; slug: string }) {
  const stores = useSimStores()
  const toast = useToast()

  const handleReset = useCallback(() => {
    for (const store of Object.values(stores)) {
      store.getState().resetToSeed()
    }
    toast('Data simulasi dikembalikan ke seed awal.', 'success')
  }, [stores, toast])

  useSimReset({ onReset: handleReset, slug })

  const authPages = definition.pages.filter((page) => page.kind === 'auth')
  const appPages = definition.pages.filter((page) => page.kind !== 'auth')
  const defaultRoute = authPages[0]?.route ?? appPages[0]?.route ?? '/'

  return (
    <Routes>
      {authPages.map((page) => (
        <Route
          key={page.key}
          path={page.route}
          element={<AuthPage page={page} definition={definition} />}
        />
      ))}

      {appPages.length > 0 && (
        <Route element={<AppLayout definition={definition} />}>
          {appPages.map((page) => (
            <Route
              key={page.key}
              path={page.route === '/' ? '' : page.route.replace(/^\//, '')}
              element={<PageView page={page} definition={definition} />}
            />
          ))}
        </Route>
      )}

      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  )
}

function AppLayout({ definition }: { definition: SimAppDefinition }) {
  const location = useLocation()
  const nav = definition.nav.length
    ? definition.nav
    : definition.pages
        .filter((page) => page.kind !== 'auth')
        .map((page) => ({ page: page.key, label: page.title }))

  const current = definition.pages.find(
    (page) =>
      page.route === location.pathname ||
      page.route === `/${location.pathname.replace(/^\//, '')}`,
  )

  return (
    <div className="flex min-h-full bg-slate-50">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5">
          <span className="grid h-8 w-8 place-items-center rounded bg-brand-500 text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 18V6l6 7 6-7v12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-900">
              {definition.brand ?? definition.name}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Simulasi</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Navigasi simulasi">
          {nav.map((item) => {
            const page = definition.pages.find((candidate) => candidate.key === item.page)
            if (!page) return null
            return (
              <NavLink
                key={item.page}
                to={page.route}
                end={page.route === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded px-2.5 py-2 text-[13px] transition-colors ${
                    isActive
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" aria-hidden="true" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="border-t border-slate-100 px-3 py-2.5 text-[10px] leading-relaxed text-slate-400">
          Data lokal di browser. Tidak terhubung ke API asli.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-900">
                {current?.title ?? definition.name}
              </p>
              <p className="text-[11px] text-slate-500">{current?.subtitle ?? definition.description}</p>
            </div>
            <Badge tone="brand">Mode simulasi</Badge>
          </div>

          <nav className="mt-2 flex gap-1 overflow-x-auto md:hidden" aria-label="Navigasi simulasi">
            {nav.map((item) => {
              const page = definition.pages.find((candidate) => candidate.key === item.page)
              if (!page) return null
              return (
                <NavLink
                  key={item.page}
                  to={page.route}
                  end={page.route === '/'}
                  className={({ isActive }) =>
                    `shrink-0 rounded px-2.5 py-1.5 text-[12px] ${
                      isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function AuthPage({ page, definition }: { page: SimPage; definition: SimAppDefinition }) {
  return (
    <div className="grid min-h-full place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-500 text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 18V6l6 7 6-7v12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="mt-2 text-[15px] font-semibold text-slate-900">
            {definition.brand ?? definition.name}
          </p>
          <p className="text-[11px] text-slate-500">Simulasi — tidak ada autentikasi nyata</p>
        </div>

        <div data-testid={`page-${page.key}`} className="space-y-4">
          {page.sections.map((section, index) => (
            <SectionView key={`${section.type}-${index}`} section={section} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PageView({ page, definition }: { page: SimPage; definition: SimAppDefinition }) {
  return (
    <div data-testid={`page-${page.key}`} className="space-y-4">
      <PageHeader title={page.title} description={page.subtitle} />
      {page.sections.map((section, index) => (
        <SectionView key={`${section.type}-${index}`} section={section} />
      ))}
      {page.sections.length === 0 && (
        <EmptyState
          title="Halaman ini belum punya komponen"
          description={`${definition.name} tidak menemukan komponen yang bisa dirender untuk halaman ini.`}
        />
      )}
    </div>
  )
}

function SectionView({ section }: { section: SimSection }) {
  switch (section.type) {
    case 'stats':
      return <StatsSection section={section} />
    case 'text':
      return <TextSection section={section} />
    case 'actions':
      return <ActionsSection section={section} />
    case 'form':
      return <FormSection section={section} />
    case 'table':
      return <TableSection section={section} />
    case 'list':
      return <ListSection section={section} />
    case 'code':
      return <CodeSection section={section} />
    default:
      return null
  }
}

function StatsSection({ section }: { section: Extract<SimSection, { type: 'stats' }> }) {
  return (
    <Card title={section.title}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {section.items.map((item) => (
          <div key={`${item.label}-${item.value}`} className="rounded-lg border border-slate-200 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{item.value}</p>
            {item.hint && <p className="mt-0.5 text-[11px] text-slate-400">{item.hint}</p>}
          </div>
        ))}
      </div>
    </Card>
  )
}

function TextSection({ section }: { section: Extract<SimSection, { type: 'text' }> }) {
  return (
    <Card title={section.title}>
      <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-600">{section.body}</p>
    </Card>
  )
}

function ActionsSection({ section }: { section: Extract<SimSection, { type: 'actions' }> }) {
  const toast = useToast()
  const navigate = useNavigate()

  const handleClick = (action: SimAction) => {
    if (action.toast) toast(action.toast, 'info')
    if (action.navigateTo) navigate(action.navigateTo)
  }

  return (
    <Card title={section.title}>
      <div className="flex flex-wrap gap-2">
        {section.items.map((action) => (
          <Button
            key={action.label}
            variant={action.variant ?? 'secondary'}
            onClick={() => handleClick(action)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </Card>
  )
}

function FormSection({ section }: { section: Extract<SimSection, { type: 'form' }> }) {
  const toast = useToast()
  const navigate = useNavigate()
  const store = useOptionalDatasetStore(section.dataset)
  const [values, setValues] = useState<FormValues>(() => defaultFormValues(section.fields))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setValue = (key: string, value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateForm(section.fields, values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (store) {
      store.getState().add(values as unknown as Omit<SimRecord, 'id'>)
    }
    toast(section.successToast ?? `${section.submitLabel} disimulasikan.`, 'success')
    if (section.navigateTo) {
      navigate(section.navigateTo)
    } else {
      setValues(defaultFormValues(section.fields))
    }
  }

  const applyPrefill = () => {
    if (!section.prefill) return
    setValues((current) => ({ ...current, ...section.prefill!.values }))
    toast('Isi otomatis dari asumsi rekonstruksi diterapkan.', 'info')
  }

  return (
    <Card title={section.title} description={section.description}>
      <form onSubmit={handleSubmit} data-testid="sim-form" className="space-y-4">
        <FieldGrid
          fields={section.fields}
          values={values}
          errors={errors}
          onChange={setValue}
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <Button type="submit" variant="primary" data-testid="sim-form-submit">
            {section.submitLabel}
          </Button>
          {section.prefill && (
            <Button type="button" variant="secondary" onClick={applyPrefill}>
              {section.prefill.label}
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}

function TableSection({ section }: { section: Extract<SimSection, { type: 'table' }> }) {
  const toast = useToast()
  const confirm = useConfirm()
  const store = useDatasetStore(section.dataset)
  const rows = store((state) => state.items)

  const dataset = useDatasetForSection(section.dataset)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<SimRecord | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [values, setValues] = useState<FormValues>(() => defaultFormValues(dataset.fields))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (needle) {
        const searchable = dataset.searchKeys ?? dataset.fields.map((field) => field.key)
        const hit = searchable.some((key) =>
          String(row[key] ?? '').toLowerCase().includes(needle),
        )
        if (!hit) return false
      }
      for (const [key, value] of Object.entries(filters)) {
        if (value && String(row[key] ?? '') !== value) return false
      }
      return true
    })
  }, [dataset, filters, query, rows])

  const openCreate = () => {
    setEditing(null)
    setValues(defaultFormValues(dataset.fields))
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (row: SimRecord) => {
    const next: FormValues = {}
    for (const field of dataset.fields) {
      const value = row[field.key]
      next[field.key] = typeof value === 'boolean' ? value : String(value ?? '')
    }
    setEditing(row)
    setValues(next)
    setErrors({})
    setModalOpen(true)
  }

  const save = () => {
    const nextErrors = validateForm(dataset.fields, values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (editing) {
      store.getState().update(editing.id, values as unknown as Partial<Omit<SimRecord, 'id'>>)
      toast('Data simulasi diperbarui.', 'success')
    } else {
      store.getState().add(values as unknown as Omit<SimRecord, 'id'>)
      toast('Data simulasi ditambahkan.', 'success')
    }
    setModalOpen(false)
  }

  const remove = async (row: SimRecord) => {
    const ok = await confirm({
      title: 'Hapus data simulasi?',
      description: 'Data ini hanya ada di browser Anda dan bisa dikembalikan lewat reset.',
      confirmLabel: 'Hapus',
      tone: 'danger',
    })
    if (!ok) return
    store.getState().remove(row.id)
    toast('Data simulasi dihapus.', 'success')
  }

  const columns: TableColumn<SimRecord>[] = dataset.columns.map((column) => ({
    key: column.key,
    label: column.label,
    align: column.type === 'number' ? 'right' : 'left',
    render:
      column.type === 'action'
        ? (row) => (
            <div className="flex gap-1">
              <Button size="sm" onClick={() => openEdit(row)}>
                Ubah
              </Button>
              <Button size="sm" variant="danger" onClick={() => void remove(row)}>
                Hapus
              </Button>
            </div>
          )
        : column.type === 'status'
          ? (row) => {
              const value = String(row[column.key] ?? '')
              return <Badge tone={statusTone(value)}>{value}</Badge>
            }
          : column.template
            ? (row) => renderTemplate(column.template!, row)
            : undefined,
  }))

  return (
    <Card title={section.title} description={section.description}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="sim-label" htmlFor={`search-${dataset.key}`}>
              Cari
            </label>
            <input
              id={`search-${dataset.key}`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Cari ${dataset.label.toLowerCase()}…`}
              className="sim-input"
              data-testid={`search-${dataset.key}`}
            />
          </div>

          {(section.filters ?? []).map((filter) => (
            <div key={filter.key} className="min-w-[160px]">
              <label className="sim-label" htmlFor={`filter-${filter.key}`}>
                {filter.label}
              </label>
              <Select
                id={`filter-${filter.key}`}
                value={filters[filter.key] ?? ''}
                onChange={(next) =>
                  setFilters((current) => ({ ...current, [filter.key]: next }))
                }
                options={filter.options}
                placeholder="Semua"
                data-testid={`filter-${filter.key}`}
              />
            </div>
          ))}

          <Button variant="primary" onClick={openCreate} data-testid={`add-${dataset.key}`}>
            {section.createLabel ?? 'Tambah data'}
          </Button>
        </div>

        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(row) => row.id}
          data-testid={`table-${dataset.key}`}
          empty={
            <EmptyState
              title="Belum ada data"
              description="Tambahkan data baru atau ubah kata kunci pencarian."
              action={
                <Button variant="primary" onClick={openCreate}>
                  {section.createLabel ?? 'Tambah data'}
                </Button>
              }
            />
          }
        />
        <p className="text-[11px] text-slate-400">
          {visible.length} dari {rows.length} baris · data lokal, bukan data asli
        </p>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? `Ubah ${dataset.label}` : section.createLabel ?? `Tambah ${dataset.label}`}
        description="Perubahan hanya tersimpan di browser ini."
        onClose={() => setModalOpen(false)}
        width="lg"
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>Batal</Button>
            <Button variant="primary" onClick={save} data-testid={`save-${dataset.key}`}>
              Simpan
            </Button>
          </>
        }
      >
        <FieldGrid
          fields={dataset.fields}
          values={values}
          errors={errors}
          onChange={(key, value) => {
            setValues((current) => ({ ...current, [key]: value }))
            setErrors((current) => {
              if (!current[key]) return current
              const next = { ...current }
              delete next[key]
              return next
            })
          }}
          idPrefix={`table-${dataset.key}`}
        />
      </Modal>
    </Card>
  )
}

function ListSection({ section }: { section: Extract<SimSection, { type: 'list' }> }) {
  return (
    <Card title={section.title} description={section.description}>
      <ul className="divide-y divide-slate-100">
        {section.items.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-[13px] text-slate-700">{item.label}</span>
            {item.meta && <span className="text-[11px] text-slate-400">{item.meta}</span>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function CodeSection({ section }: { section: Extract<SimSection, { type: 'code' }> }) {
  return (
    <Card title={section.title}>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-[12px] leading-relaxed text-slate-100">
        <code>{section.body}</code>
      </pre>
    </Card>
  )
}

/** Dataset dicari dari definisi lewat context ringan (tanpa prop drilling). */
function useDatasetForSection(key: string): SimDataset {
  const definition = useContext(DefinitionContext)
  const dataset = definition?.datasets.find((candidate) => candidate.key === key)
  if (!dataset) {
    throw new Error(`Dataset "${key}" tidak ditemukan untuk tabel.`)
  }
  return dataset
}

function statusTone(value: string): BadgeTone {
  if (/^2/.test(value)) return 'success'
  if (/^4/.test(value)) return 'warning'
  if (/^5/.test(value)) return 'danger'
  return 'neutral'
}

function renderTemplate(template: string, row: SimRecord): string {
  return template.replace(/\{([^}]+)\}/g, (_, raw: string) => {
    const key = raw.trim()
    return String(row[key] ?? '')
  })
}


