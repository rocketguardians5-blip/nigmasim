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
import { IconExternal } from '../components/icons'

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
      return
    }
    setLoading(true)
    try {
      const data = await simulationApi.getByProject(projectId)
      setDefinition(data)
      setSimName(data.name)
      setDatasets(await simulationApi.datasets(data.id))
      setError(null)
    } catch {
      setDefinition(null)
      setDatasets([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function build() {
    if (!projectId) return
    setBuilding(true)
    setError(null)
    try {
      const data = await simulationApi.build(projectId, simName)
      setDefinition(data)
      setDatasets(await simulationApi.datasets(data.id))
      setNotice(
        `Simulasi dibuat: ${data.screens.length} layar, ${Object.keys(data.datasets).length} dataset.`,
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat simulasi')
    } finally {
      setBuilding(false)
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
              className="inline-flex h-9 items-center gap-1.5 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              Buka Player <IconExternal size={14} />
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

          {can('simulation:write') && (
            <Button onClick={() => void build()} disabled={!projectId} loading={building}>
              {definition ? 'Bangun ulang' : 'Buat simulasi'}
            </Button>
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
