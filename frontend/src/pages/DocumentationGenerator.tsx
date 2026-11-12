import { useCallback, useEffect, useState } from 'react'
import { applicationsApi, projectsApi, ApiError, downloadWithAuth } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { simulationApi, tutorialApi } from '../lib/simulation'
import type { SimulationDefinition, Tutorial } from '../lib/simulation'
import { documentsApi } from '../lib/documents'
import type { DocumentSummary, GeneratedDocument } from '../lib/documents'
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

const DOC_TYPES = [
  { value: 'sop', label: 'Standard Operating Procedure (SOP)' },
  { value: 'user_guide', label: 'Panduan Pengguna' },
  { value: 'module', label: 'Dokumentasi Modul' },
  { value: 'role', label: 'Panduan Per Peran' },
  { value: 'workflow', label: 'Dokumentasi Alur Kerja' },
]

export function DocumentationGeneratorPage() {
  const { can } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [simulation, setSimulation] = useState<SimulationDefinition | null>(null)
  const [tutorials, setTutorials] = useState<Tutorial[]>([])
  const [summary, setSummary] = useState<DocumentSummary[]>([])

  const [title, setTitle] = useState('SOP Penggunaan Aplikasi')
  const [docType, setDocType] = useState('sop')
  const [tutorialId, setTutorialId] = useState<number | null>(null)

  const [document, setDocument] = useState<GeneratedDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<'preview' | 'isi' | 'markdown'>('preview')
  const [downloading, setDownloading] = useState<'pdf' | 'md' | null>(null)

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
      setSummary([])
      return
    }
    setLoading(true)
    try {
      const sim = await simulationApi.getByProject(projectId)
      setSimulation(sim)
      setTutorials(await tutorialApi.list(sim.id))
      setSummary(await documentsApi.list(projectId))
      setError(null)
    } catch {
      setSimulation(null)
      setTutorials([])
      setSummary(await documentsApi.list(projectId).catch(() => []))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function generate() {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const result = await documentsApi.generate({
        project_id: projectId,
        title,
        doc_type: docType,
        simulation_id: simulation?.id ?? null,
        tutorial_id: tutorialId,
      })
      setDocument(result)
      setNotice('Dokumen dibuat. Silakan review lalu publish.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat dokumen')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!document) return
    try {
      const result = await documentsApi.update(document.id, {
        content: document.content,
        title: document.title,
      })
      setDocument(result)
      setNotice('Dokumen disimpan.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan dokumen')
    }
  }

  async function publish() {
    if (!document) return
    try {
      const result = await documentsApi.publish(document.id, { status: 'published' })
      setDocument(result)
      setNotice('Dokumen dipublikasikan.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menerbitkan dokumen')
    }
  }

  async function download(format: 'pdf' | 'md') {
    if (!document) return
    setDownloading(format)
    setError(null)
    try {
      const safeTitle = document.title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'dokumen'
      await downloadWithAuth(
        documentsApi.downloadUrl(document.id, format),
        `${safeTitle}.${format}`,
        format === 'pdf' ? 'application/pdf' : 'text/markdown',
      )
      setNotice(`Berkas ${format.toUpperCase()} berhasil diunduh.`)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal mengunduh. Pastikan Capture Worker berjalan untuk PDF.',
      )
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Documentation Generator"
        description="Susun SOP atau panduan pengguna dari layar, tutorial, dan alur kerja yang sudah direview."
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
              className="input min-w-[160px]"
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
              className="input min-w-[160px]"
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

          <Field label="Jenis dokumen">
            <select
              className="input min-w-[230px]"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {DOC_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Sumber langkah" hint="Ambil langkah dari tutorial yang ada.">
            <select
              className="input min-w-[190px]"
              value={tutorialId ?? ''}
              onChange={(e) => setTutorialId(Number(e.target.value) || null)}
            >
              <option value="">— tanpa tutorial —</option>
              {tutorials.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} ({item.steps.length} langkah)
                </option>
              ))}
            </select>
          </Field>

          <Field label="Judul dokumen">
            <input
              className="input min-w-[220px]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          {can('documents:write') && (
            <Button onClick={() => void generate()} loading={loading}>
              Buat dokumen
            </Button>
          )}
        </div>
      </Card>

      {loading && !document ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-slate-300" />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* Preview */}
          <Card
            title="Dokumen"
            className="lg:col-span-2"
            actions={
              document ? (
                <div className="flex gap-1">
                  {(['preview', 'isi', 'markdown'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTab(item)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        tab === item
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {item === 'preview' ? 'Pratinjau' : item === 'isi' ? 'Isi' : 'Markdown'}
                    </button>
                  ))}
                </div>
              ) : undefined
            }
          >
            {!document ? (
              <EmptyState
                title="Belum ada dokumen"
                description="Pilih project, tentukan jenis dokumen, lalu tekan 'Buat dokumen'."
              />
            ) : tab === 'preview' ? (
              <iframe
                title="Pratinjau dokumen"
                srcDoc={document.html}
                className="h-[560px] w-full rounded border border-slate-200 bg-white"
              />
            ) : tab === 'markdown' ? (
              <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-700">
                {document.markdown}
              </pre>
            ) : (
              <div className="max-h-[560px] space-y-3 overflow-auto">
                <Field label="Tujuan">
                  <textarea
                    className="input min-h-[70px]"
                    value={document.content.purpose}
                    onChange={(e) =>
                      setDocument({
                        ...document,
                        content: { ...document.content, purpose: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Cakupan">
                  <textarea
                    className="input min-h-[60px]"
                    value={document.content.scope}
                    onChange={(e) =>
                      setDocument({
                        ...document,
                        content: { ...document.content, scope: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Prasyarat" hint="Satu baris per prasyarat.">
                  <textarea
                    className="input min-h-[80px]"
                    value={document.content.prerequisites.join('\n')}
                    onChange={(e) =>
                      setDocument({
                        ...document,
                        content: {
                          ...document.content,
                          prerequisites: e.target.value.split('\n').filter(Boolean),
                        },
                      })
                    }
                  />
                </Field>
                <div>
                  <p className="label">Langkah ({document.content.steps.length})</p>
                  {document.content.steps.map((step, index) => (
                    <div key={index} className="mb-2 rounded border border-slate-200 p-2.5">
                      <input
                        className="input h-8 py-1 text-[13px]"
                        value={step.instruction}
                        onChange={(e) => {
                          const steps = [...document.content.steps]
                          steps[index] = { ...step, instruction: e.target.value }
                          setDocument({
                            ...document,
                            content: { ...document.content, steps },
                          })
                        }}
                      />
                      <input
                        className="input mt-1.5 h-8 py-1 text-[13px]"
                        placeholder="Hasil yang diharapkan"
                        value={step.expected ?? ''}
                        onChange={(e) => {
                          const steps = [...document.content.steps]
                          steps[index] = { ...step, expected: e.target.value }
                          setDocument({
                            ...document,
                            content: { ...document.content, steps },
                          })
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {document && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <Badge tone={document.status === 'published' ? 'success' : 'warning'}>
                  {document.status}
                </Badge>
                <span className="text-xs text-slate-500">Revisi {document.version}</span>
                <div className="ml-auto flex gap-2">
                  {can('documents:write') && (
                    <Button size="sm" variant="secondary" onClick={() => void save()}>
                      Simpan
                    </Button>
                  )}
                  {can('documents:review') && (
                    <Button size="sm" onClick={() => void publish()}>
                      Publish
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={downloading === 'pdf'}
                    onClick={() => void download('pdf')}
                  >
                    Unduh PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={downloading === 'md'}
                    onClick={() => void download('md')}
                  >
                    Markdown
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Daftar dokumen */}
          <Card title="Dokumen yang ada" description="Dokumen di project ini.">
            {summary.length === 0 ? (
              <EmptyState title="Belum ada dokumen" description="Buat dokumen pertama Anda." />
            ) : (
              <ul className="space-y-2">
                {summary.map((item) => (
                  <li key={item.id} className="rounded border border-slate-200 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-slate-900">{item.title}</p>
                      <Badge tone={item.status === 'published' ? 'success' : 'warning'}>
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {item.doc_type} · {item.step_count} langkah · revisi {item.version}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void documentsApi.get(item.id).then((result) => {
                          setDocument(result)
                          setTab('preview')
                        })
                      }}
                      className="mt-1.5 text-xs font-medium text-brand-600 hover:underline"
                    >
                      Buka
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
