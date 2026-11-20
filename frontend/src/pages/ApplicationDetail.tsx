import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, applicationsApi, projectsApi } from '../lib/api'
import type { Application, Project } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
} from '../components/ui'
import { AuthorizationBadge } from '../components/StatusBadge'

const PROJECT_STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  capturing: { label: 'Capturing', tone: 'info' },
  building: { label: 'Building', tone: 'warning' },
  published: { label: 'Published', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
}

export function ApplicationDetailPage() {
  const { id } = useParams()
  const appId = Number(id)
  const { can } = useAuth()

  const [app, setApp] = useState<Application | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDesc, setProjectDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [detail, projectPage] = await Promise.all([
        applicationsApi.get(appId),
        projectsApi.listByApplication(appId),
      ])
      setApp(detail)
      setProjects(projectPage.items)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat detail aplikasi')
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  async function submitProject() {
    if (!app) return
    setSaving(true)
    setFormError(null)
    try {
      await projectsApi.create(app.id, {
        name: projectName.trim(),
        description: projectDesc.trim() || undefined,
      })
      setCreateOpen(false)
      setProjectName('')
      setProjectDesc('')
      setNotice('Project dibuat dengan status Draft.')
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal membuat project')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7 text-slate-300" />
      </div>
    )
  }

  if (!app) {
    return (
      <div>
        <Alert tone="danger" title="Aplikasi tidak ditemukan">
          {error ?? 'Data tidak tersedia.'}
        </Alert>
        <Link to="/applications" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
          ← Kembali ke registry
        </Link>
      </div>
    )
  }

  const canCapture = app.authorization_status === 'approved'

  return (
    <div>
      <PageHeader
        title={app.name}
        description={`${app.category ?? 'Tanpa kategori'} · ${app.environment_label} · ${app.source_url}`}
        actions={
          <>
            <Link
              to="/applications"
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Kembali
            </Link>
            <Button
              disabled={!canCapture}
              title={
                canCapture
                  ? 'Membuka Capture Studio'
                  : 'Aplikasi belum memiliki status otorisasi approved'
              }
            >
              Buka Capture Studio
            </Button>
          </>
        }
      />

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Informasi aplikasi" className="lg:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label="Nama" value={app.name} />
            <Info label="Kategori" value={app.category ?? '—'} />
            <Info label="Pemilik" value={app.owner ?? '—'} />
            <Info label="Versi aplikasi" value={app.version_label ?? '—'} />
            <Info label="URL aplikasi" value={app.source_url} />
            <Info label="URL login" value={app.login_url ?? '—'} />
            <div className="sm:col-span-2">
              <Info label="Deskripsi" value={app.description ?? '—'} />
            </div>
          </dl>
        </Card>

        <Card title="Otorisasi capture">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Status</span>
              <AuthorizationBadge status={app.authorization_status} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600">Rujukan izin</span>
              <span className="text-sm font-medium text-slate-900">
                {app.authorization_ref ?? '—'}
              </span>
            </div>
            {app.authorization_note && (
              <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                {app.authorization_note}
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs leading-relaxed text-slate-500">
              {canCapture
                ? 'Aplikasi ini boleh di-capture. Capture hanya dilakukan atas aksi operator, dengan login manual.'
                : 'Aplikasi ini belum boleh di-capture. Status otorisasi harus approved lebih dulu.'}
            </p>
          </div>
        </Card>
      </div>

      <Card
        title="Project"
        description="Satu project = satu upaya pembuatan simulasi dari aplikasi ini."
        className="mt-6"
        actions={
          can('projects:write') ? (
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!canCapture}>
              Project baru
            </Button>
          ) : undefined
        }
      >
        {projects.length === 0 ? (
          <EmptyState
            title="Belum ada project"
            description="Buat project untuk mulai.capture layar dan membangun simulasi."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="table-head">
                <tr>
                  <th className="pb-2.5 pr-4">Project</th>
                  <th className="pb-2.5 pr-4">Versi</th>
                  <th className="pb-2.5 pr-4">Status</th>
                  <th className="pb-2.5">Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const status = PROJECT_STATUS[project.status] ?? PROJECT_STATUS.draft
                  return (
                    <tr key={project.id} className="table-row">
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-slate-900">{project.name}</p>
                        {project.description && (
                          <p className="text-xs text-slate-500">{project.description}</p>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600 tabular">{project.version}</td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td className="py-2.5 text-xs text-slate-500 tabular">
                        {new Date(project.created_at).toLocaleDateString('id-ID')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        title="Buat Project"
        description="Project dipakai untuk menampung hasil capture, rekonstruksi, dan simulasi."
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void submitProject()} loading={saving}>
              Buat
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Nama project" required>
            <input
              className="input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Pilot Demo Klien"
            />
          </Field>
          <Field label="Deskripsi">
            <textarea
              className="input min-h-[70px]"
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              placeholder="Tujuan project"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-slate-900">{value}</dd>
    </div>
  )
}
