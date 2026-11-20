import { useCallback, useEffect, useState } from 'react'
import { applicationsApi, projectsApi, ApiError } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { simulationApi, tutorialApi } from '../lib/simulation'
import type { SimulationDefinition, Tutorial, TutorialStep } from '../lib/simulation'
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

export function TutorialBuilderPage() {
  const { can } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [simulation, setSimulation] = useState<SimulationDefinition | null>(null)
  const [tutorials, setTutorials] = useState<Tutorial[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [title, setTitle] = useState('Cara Menggunakan Simulasi')
  const [steps, setSteps] = useState<TutorialStep[]>([
    { no: 1, screen: null, target: null, instruction: '', expected: null },
  ])

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
      setSimulation(null)
      setTutorials([])
      return
    }
    setLoading(true)
    try {
      const data = await simulationApi.getByProject(projectId)
      setSimulation(data)
      setTutorials(await tutorialApi.list(data.id))
      setError(null)
    } catch (err) {
      setSimulation(null)
      setTutorials([])
      setError(err instanceof ApiError ? err.message : 'Simulasi belum ada')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  function updateStep(index: number, patch: Partial<TutorialStep>) {
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  }

  async function createTutorial() {
    if (!simulation) return
    const valid = steps.filter((step) => step.instruction.trim())
    if (valid.length === 0) {
      setError('Minimal satu langkah dengan instruksi.')
      return
    }
    try {
      await tutorialApi.create(simulation.id, { title, steps: valid })
      setNotice('Tutorial dibuat.')
      setSteps([{ no: 1, screen: null, target: null, instruction: '', expected: null }])
      setTitle('Cara Menggunakan Simulasi')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat tutorial')
    }
  }

  async function togglePublish(item: Tutorial) {
    if (!simulation) return
    try {
      await tutorialApi.update(simulation.id, item.id, {
        status: item.status === 'published' ? 'draft' : 'published',
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah status tutorial')
    }
  }

  async function removeTutorial(item: Tutorial) {
    if (!simulation) return
    if (!window.confirm(`Hapus tutorial "${item.title}"?`)) return
    try {
      await tutorialApi.remove(simulation.id, item.id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menghapus tutorial')
    }
  }

  const targetHelp =
    'Format target: card:Nama Kartu | field:judul | col:ID Risiko | button:Tambah'

  return (
    <div>
      <PageHeader
        title="Tutorial Builder"
        description="Buat panduan langkah demi langkah dengan sorotan pada elemen tertentu."
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
      ) : !simulation ? (
        <div className="mt-4">
          <EmptyState
            title="Simulasi belum ada"
            description="Buat simulasi dulu di Simulation Builder, lalu susun tutorialnya di sini."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Tutorial yang ada">
            {tutorials.length === 0 ? (
              <EmptyState
                title="Belum ada tutorial"
                description="Buat langkah pertama di sebelah kanan."
              />
            ) : (
              <ul className="space-y-2">
                {tutorials.map((item) => (
                  <li key={item.id} className="rounded border border-slate-200 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.steps.length} langkah</p>
                      </div>
                      <Badge tone={item.status === 'published' ? 'success' : 'neutral'}>
                        {item.status}
                      </Badge>
                    </div>
                    {can('simulation:write') && (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void togglePublish(item)}
                          className="rounded px-2 py-1 text-xs font-medium text-[#4268ff] hover:bg-[#4268ff]/10"
                        >
                          {item.status === 'published' ? 'Tarik dari published' : 'Publish'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeTutorial(item)}
                          className="rounded px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Hapus
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {can('simulation:write') && (
            <Card title="Tutorial baru" description="Langkah akan disorot saat player dijalankan.">
              <div className="space-y-3">
                <Field label="Judul tutorial">
                  <input
                    className="input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>

                {steps.map((step, index) => (
                  <div key={index} className="rounded border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[13px] font-medium text-slate-700">Langkah {index + 1}</p>
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          hapus
                        </button>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Layar">
                        <select
                          className="input"
                          value={step.screen ?? ''}
                          onChange={(e) => updateStep(index, { screen: e.target.value || null })}
                        >
                          <option value="">— layar sekarang —</option>
                          {simulation.screens.map((screen) => (
                            <option key={screen.key} value={screen.key}>
                              {screen.title}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Target sorotan" hint={targetHelp}>
                        <input
                          className="input"
                          placeholder="card:Risiko Tinggi"
                          value={step.target ?? ''}
                          onChange={(e) => updateStep(index, { target: e.target.value || null })}
                        />
                      </Field>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Field label="Instruksi">
                        <input
                          className="input"
                          placeholder="Klik tombol Tambah Risiko"
                          value={step.instruction}
                          onChange={(e) => updateStep(index, { instruction: e.target.value })}
                        />
                      </Field>
                      <Field label="Hasil yang diharapkan">
                        <input
                          className="input"
                          value={step.expected ?? ''}
                          onChange={(e) => updateStep(index, { expected: e.target.value || null })}
                        />
                      </Field>
                    </div>
                  </div>
                ))}

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setSteps((prev) => [
                        ...prev,
                        { no: prev.length + 1, screen: null, target: null, instruction: '', expected: null },
                      ])
                    }
                  >
                    Tambah langkah
                  </Button>
                  <Button onClick={() => void createTutorial()}>Simpan tutorial</Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
