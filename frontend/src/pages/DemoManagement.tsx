import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { applicationsApi } from '../lib/api'
import type { Application } from '../lib/api'
import { demoApi } from '../lib/demo'
import type {
  DemoLink,
  DemoLinkUpdate,
  DemoScenario,
} from '../lib/demo'
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
} from '../components/ui'
import { IconPlus, IconExternal } from '../components/icons'

export function DemoManagementPage() {
  const { can } = useAuth()
  const [links, setLinks] = useState<DemoLink[]>([])
  const [scenarios, setScenarios] = useState<DemoScenario[]>([])
  const [apps, setApps] = useState<Application[]>([])
  const [openCreateLink, setOpenCreateLink] = useState(false)
  const [openEditLink, setOpenEditLink] = useState(false)
  const [openCreateScenario, setOpenCreateScenario] = useState(false)
  const [editingLink, setEditingLink] = useState<DemoLink | null>(null)
  const [linkName, setLinkName] = useState('')
  const [linkDesc, setLinkDesc] = useState('')
  const [linkProjectId, setLinkProjectId] = useState<number | null>(null)
  const [linkScreenIds, setLinkScreenIds] = useState<string>('')
  const [linkPassword, setLinkPassword] = useState('')
  const [scenarioName, setScenarioName] = useState('')
  const [scenarioDesc, setScenarioDesc] = useState('')
  const [scenarioProjectId, setScenarioProjectId] = useState<number | null>(null)
  const [scenarioSteps, setScenarioSteps] = useState<Array<{ screen_id: number; title: string; instructor_notes: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<'links' | 'scenarios'>('links')
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)

  const canManage = can('demo:write')
  const canRead = can('demo:read')

  const loadLinks = useCallback(async () => {
    if (!canRead) return
    try {
      const data = await demoApi.listLinks(selectedAppId ?? undefined)
      setLinks(data)
    } catch {
      setError('Gagal memuat demo link')
    }
  }, [canRead, selectedAppId])

  const loadScenarios = useCallback(async () => {
    if (!canRead) return
    try {
      const data = await demoApi.listScenarios(selectedAppId ?? undefined)
      setScenarios(data)
    } catch {
      /* biarkan kosong */
    }
  }, [canRead, selectedAppId])

  const loadApps = useCallback(async () => {
    try {
      const page = await applicationsApi.list()
      setApps(page.items.filter((a) => a.authorization_status === 'approved'))
    } catch {
      setError('Gagal memuat aplikasi')
    }
  }, [])

  useEffect(() => {
    void loadApps()
  }, [loadApps])

  useEffect(() => {
    void loadLinks()
    void loadScenarios()
  }, [loadLinks, loadScenarios])

  async function run<T>(action: () => Promise<T>, success: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
      setNotice(success)
      void loadLinks()
      void loadScenarios()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setBusy(false)
    }
  }

  function resetLinkForm() {
    setLinkName('')
    setLinkDesc('')
    setLinkProjectId(null)
    setLinkScreenIds('')
    setLinkPassword('')
    setEditingLink(null)
    setOpenCreateLink(false)
    setOpenEditLink(false)
  }

  function resetScenarioForm() {
    setScenarioName('')
    setScenarioDesc('')
    setScenarioProjectId(null)
    setScenarioSteps([])
    setOpenCreateScenario(false)
  }

  async function handleCreateLink() {
    const screenIds = linkScreenIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !isNaN(n))

    await run(
      () =>
        demoApi.createLink({
          name: linkName,
          description: linkDesc || null,
          project_id: linkProjectId || undefined,
          screen_ids: screenIds,
          password: linkPassword || undefined,
        }),
      'Demo link berhasil dibuat',
    )
    resetLinkForm()
  }

  async function handleUpdateLink() {
    if (!editingLink) return
    const screenIds = linkScreenIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !isNaN(n))

    const payload: DemoLinkUpdate = {
      name: linkName,
      description: linkDesc || null,
      project_id: linkProjectId || undefined,
      screen_ids: screenIds,
      ...(linkPassword ? { password: linkPassword } : {}),
    }

    await run(() => demoApi.updateLink(editingLink.id, payload), 'Demo link diperbarui')
    resetLinkForm()
  }

  async function deleteLink(link: DemoLink) {
    if (!window.confirm(`Hapus demo link "${link.name}"?`)) return
    await run(() => demoApi.deleteLink(link.id), 'Demo link dihapus')
  }

  async function handleCreateScenario() {
    await run(
      () =>
        demoApi.createScenario({
          name: scenarioName,
          description: scenarioDesc || null,
          steps: scenarioSteps.map((s) => ({
            screen_id: s.screen_id,
            title: s.title,
            instructor_notes: s.instructor_notes || undefined,
          })),
          project_id: scenarioProjectId || undefined,
        }),
      'Skenario demo berhasil dibuat',
    )
    resetScenarioForm()
  }

  async function deleteScenario(scenario: DemoScenario) {
    if (!window.confirm(`Hapus skenario demo "${scenario.name}"?`)) return
    await run(() => demoApi.deleteScenario(scenario.id), 'Skenario demo dihapus')
  }

  return (
    <div>
      <PageHeader
        title="Published Demos"
        description="Bagikan layar hasil capture ke calon klien tanpa login. Atur link publik, password, dan skenario demo."
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Aplikasi sumber">
          <Field label="Pilih aplikasi">
            <select
              className="input"
              value={selectedAppId ?? ''}
              onChange={(e) => setSelectedAppId(Number(e.target.value) || null)}
            >
              <option value="">— semua aplikasi —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </Card>

        <Card className="col-span-full sm:col-span-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('links')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${activeTab === 'links' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Link Demo
            </button>
            <button
              onClick={() => setActiveTab('scenarios')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${activeTab === 'scenarios' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Skenario Demo
            </button>
          </div>

          {activeTab === 'links' ? (
            <div className="mt-4">
              {!canManage ? (
                <Alert tone="warning">Anda tidak memiliki izin mengelola demo link.</Alert>
              ) : (
                <Button onClick={() => setOpenCreateLink(true)} variant="primary">
                  <IconPlus size={14} /> Buat Link Demo
                </Button>
              )}
              {links.length === 0 && canManage && (
                <div className="mt-4">
                  <EmptyState title="Belum ada demo link" description="Buat link demo pertama untuk membagikan layar." />
                </div>
              )}
              <ul className="divide-y divide-slate-100 mt-2">
                {links.map((link) => (
                  <li key={link.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex items-center gap-3">
                      <Badge tone={link.is_active ? 'success' : 'neutral'}>
                        {link.is_active ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                      <div>
                        <p className="truncate text-[13px] font-medium text-slate-900">{link.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {link.description ?? 'Tanpa deskripsi'} · {link.screen_ids.length} layar
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/public/demo/${link.token}`}
                        className="text-xs font-medium text-brand-600 hover:underline flex items-center gap-1"
                      >
                        <IconExternal size={12} /> Buka Demo
                      </Link>
                      {canManage && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setLinkName(link.name)
                            setLinkDesc(link.description ?? '')
                            setLinkProjectId(link.project_id ?? null)
                            setLinkScreenIds(link.screen_ids.join(', '))
                            setLinkPassword('')
                            setEditingLink(link)
                            setOpenEditLink(true)
                          }}
                        >
                          <IconExternal size={14} /> Edit
                        </Button>
                      )}
                      {canManage && (
                        <Button variant="danger" size="sm" onClick={() => deleteLink(link)}>
                          <IconExternal size={14} /> Hapus
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4">
              {!canManage ? (
                <Alert tone="warning">Anda tidak memiliki izin mengelola skenario demo.</Alert>
              ) : (
                <Button onClick={() => setOpenCreateScenario(true)} variant="primary">
                  <IconPlus size={14} /> Buat Skenario Demo
                </Button>
              )}
              {scenarios.length === 0 && canManage && (
                <div className="mt-4">
                  <EmptyState title="Belum ada skenario demo" description="Buat skenario demo untuk alur presentasi terpandu." />
                </div>
              )}
              <ul className="divide-y divide-slate-100 mt-2">
                {scenarios.map((scenario) => (
                  <li key={scenario.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-slate-900">{scenario.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {scenario.description ?? 'Tanpa deskripsi'} ·
                        {scenario.steps.length} langkah
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManage && (
                        <Button variant="secondary" size="sm" onClick={() => deleteScenario(scenario)}>
                          <IconExternal size={14} /> Hapus
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={openCreateLink || openEditLink}
        title={editingLink ? 'Edit Demo Link' : 'Buat Demo Link'}
        onClose={resetLinkForm}
      >
        <div className="space-y-4">
          <Field label="Nama demo" required>
            <input className="input" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
          </Field>
          <Field label="Deskripsi">
            <input className="input" value={linkDesc} onChange={(e) => setLinkDesc(e.target.value)} />
          </Field>
          <Field label="Project (opsional)">
            <select className="input" value={linkProjectId ?? ''} onChange={(e) => setLinkProjectId(Number(e.target.value) || null)}>
              <option value="">— tanpa project —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="ID layar (pisahkan koma)" hint="Contoh: 1, 2, 3">
            <input className="input" value={linkScreenIds} onChange={(e) => setLinkScreenIds(e.target.value)} />
          </Field>
          <Field label="Password (opsional)" hint="Kosongkan untuk akses publik tanpa sandi">
            <input className="input" type="password" value={linkPassword} onChange={(e) => setLinkPassword(e.target.value)} />
          </Field>
        </div>
        <footer className="flex justify-end gap-2 pt-4 border-t border-slate-200">
          <Button variant="secondary" onClick={resetLinkForm}>Batal</Button>
          <Button onClick={editingLink ? handleUpdateLink : handleCreateLink} loading={busy}>{editingLink ? 'Simpan Perubahan' : 'Buat Link'}</Button>
        </footer>
      </Modal>

      <Modal
        open={openCreateScenario}
        title="Buat Skenario Demo"
        onClose={resetScenarioForm}
      >
        <div className="space-y-4">
          <Field label="Nama skenario" required>
            <input className="input" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
          </Field>
          <Field label="Deskripsi">
            <input className="input" value={scenarioDesc} onChange={(e) => setScenarioDesc(e.target.value)} />
          </Field>
          <Field label="Project (opsional)">
            <select className="input" value={scenarioProjectId ?? ''} onChange={(e) => setScenarioProjectId(Number(e.target.value) || null)}>
              <option value="">— tanpa project —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <div>
            <p className="text-xs text-slate-500 mb-2">Langkah-langkah demo</p>
            <ul className="divide-y divide-slate-100">
              {scenarioSteps.map((step, idx) => (
                <li key={idx} className="p-3 bg-slate-50 rounded border border-slate-200">
                  <div className="grid gap-2 sm:grid-cols-3 items-end">
                    <input className="input" placeholder="ID layar" value={String(step.screen_id)} onChange={(e) => {
                      const v = Number(e.target.value)
                      const next = [...scenarioSteps]
                      next[idx] = { ...next[idx], screen_id: isNaN(v) ? 0 : v }
                      setScenarioSteps(next)
                    }} />
                    <input className="input" placeholder="Judul langkah" value={step.title} onChange={(e) => {
                      const next = [...scenarioSteps]
                      next[idx] = { ...next[idx], title: e.target.value }
                      setScenarioSteps(next)
                    }} />
                    <input className="input" placeholder="Catatan presenter (opsional)" value={step.instructor_notes} onChange={(e) => {
                      const next = [...scenarioSteps]
                      next[idx] = { ...next[idx], instructor_notes: e.target.value }
                      setScenarioSteps(next)
                    }} />
                    <Button variant="danger" size="sm" onClick={() => setScenarioSteps(scenarioSteps.filter((_, i) => i !== idx))}>Hapus</Button>
                  </div>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" onClick={() => setScenarioSteps([...scenarioSteps, { screen_id: 0, title: '', instructor_notes: '' }] )}>
              <IconPlus size={14} /> Tambah Langkah
            </Button>
          </div>
        </div>
        <footer className="flex justify-end gap-2 pt-4 border-t border-slate-200">
          <Button variant="secondary" onClick={resetScenarioForm}>Batal</Button>
          <Button onClick={handleCreateScenario} loading={busy}>Buat Skenario</Button>
        </footer>
      </Modal>
    </div>
  )
}
