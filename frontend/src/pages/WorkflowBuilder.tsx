import { useCallback, useEffect, useState } from 'react'
import { applicationsApi, projectsApi, ApiError } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { simulationApi, workflowApi } from '../lib/simulation'
import type { WorkflowDefinition, WorkflowTransition } from '../lib/simulation'
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

const ROLE_OPTIONS = [
  { value: 'staf', label: 'Staf' },
  { value: 'manager', label: 'Manajer' },
]

export function WorkflowBuilderPage() {
  const { can } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [simulationId, setSimulationId] = useState<number | null>(null)
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [form, setForm] = useState<WorkflowTransition>({
    from: 'draft',
    to: 'submitted',
    action: 'submit',
    label: 'Ajukan',
    role: 'staf',
  })

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
      setWorkflow(null)
      setSimulationId(null)
      return
    }
    setLoading(true)
    try {
      const simulation = await simulationApi.getByProject(projectId)
      setSimulationId(simulation.id)
      setWorkflow(await workflowApi.get(simulation.id))
      setError(null)
    } catch (err) {
      setWorkflow(null)
      setSimulationId(null)
      setError(err instanceof ApiError ? err.message : 'Simulasi belum ada')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function addTransition() {
    if (!simulationId || !workflow) return
    try {
      const updated = await workflowApi.update(simulationId, {
        transitions: [...workflow.transitions, form],
      })
      setWorkflow(updated)
      setNotice('Transisi baru ditambahkan.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menambah transisi')
    }
  }

  async function removeTransition(index: number) {
    if (!simulationId || !workflow) return
    const transitions = workflow.transitions.filter((_, i) => i !== index)
    try {
      const updated = await workflowApi.update(simulationId, { transitions })
      setWorkflow(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menghapus transisi')
    }
  }

  async function resetToDefault() {
    if (!simulationId) return
    try {
      const updated = await workflowApi.reset(simulationId)
      setWorkflow(updated)
      setNotice('Alur dikembalikan ke definisi standar.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengembalikan alur')
    }
  }

  return (
    <div>
      <PageHeader
        title="Workflow Builder"
        description="Atur alur status dan siapa yang boleh menjalankan tiap aksi."
        actions={
          workflow && can('simulation:write') ? (
            <Button variant="secondary" onClick={() => void resetToDefault()}>
              Alur standar
            </Button>
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
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-slate-300" />
        </div>
      ) : !workflow ? (
        <div className="mt-4">
          <EmptyState
            title="Alur belum tersedia"
            description="Buat simulasi dulu di Simulation Builder, lalu alur workflow dibuat otomatis."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card title="Status" description="Status yang tersedia dalam alur ini." className="lg:col-span-1">
            <ul className="space-y-1.5">
              {workflow.states.map((state) => (
                <li key={state.key} className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-slate-800">{state.label}</span>
                  <Badge tone="neutral">{state.role ?? '-'}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              Status awal: <strong>{workflow.initial_state}</strong>
            </p>
          </Card>

          <Card
            title="Transisi"
            description="Aturan: dari status A, aksi apa yang boleh dilakukan siapa."
            className="lg:col-span-2"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="table-head">
                  <tr>
                    <th className="pb-2.5 pr-4">Dari</th>
                    <th className="pb-2.5 pr-4">Aksi</th>
                    <th className="pb-2.5 pr-4">Ke</th>
                    <th className="pb-2.5 pr-4">Peran</th>
                    <th className="pb-2.5 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {workflow.transitions.map((transition, index) => (
                    <tr key={`${transition.action}-${index}`} className="table-row">
                      <td className="py-2.5 pr-4 text-slate-700">{transition.from}</td>
                      <td className="py-2.5 pr-4">
                        <span className="font-medium text-slate-900">{transition.label}</span>
                        <span className="ml-1.5 text-[11px] text-slate-400">{transition.action}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700">{transition.to}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{transition.role ?? '-'}</td>
                      <td className="py-2.5 text-right">
                        {can('simulation:write') && (
                          <button
                            type="button"
                            onClick={() => void removeTransition(index)}
                            className="rounded px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                          >
                            Hapus
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {can('simulation:write') && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-[13px] font-medium text-slate-700">Tambah transisi</p>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Dari status">
                    <select
                      className="input w-40"
                      value={form.from}
                      onChange={(e) => setForm({ ...form, from: e.target.value })}
                    >
                      {workflow.states.map((state) => (
                        <option key={state.key} value={state.key}>
                          {state.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Aksi">
                    <input
                      className="input w-32"
                      value={form.action}
                      onChange={(e) => setForm({ ...form, action: e.target.value })}
                    />
                  </Field>
                  <Field label="Label">
                    <input
                      className="input w-40"
                      value={form.label}
                      onChange={(e) => setForm({ ...form, label: e.target.value })}
                    />
                  </Field>
                  <Field label="Ke status">
                    <select
                      className="input w-40"
                      value={form.to}
                      onChange={(e) => setForm({ ...form, to: e.target.value })}
                    >
                      {workflow.states.map((state) => (
                        <option key={state.key} value={state.key}>
                          {state.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Peran">
                    <select
                      className="input w-32"
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button onClick={() => void addTransition()}>
                    Tambah
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
