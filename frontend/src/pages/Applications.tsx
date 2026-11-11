import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, applicationsApi } from '../lib/api'
import type { Application } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
} from '../components/ui'
import { AuthorizationBadge } from './Dashboard'

const EMPTY_FORM = {
  name: '',
  description: '',
  owner: '',
  category: '',
  source_url: '',
  login_url: '',
  environment_label: 'staging',
  version_label: '',
}

export function ApplicationsPage() {
  const { can } = useAuth()
  const [items, setItems] = useState<Application[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [authTarget, setAuthTarget] = useState<Application | null>(null)
  const [authForm, setAuthForm] = useState({
    authorization_status: 'approved',
    authorization_ref: '',
    authorization_note: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const page = await applicationsApi.list({ search: search || undefined })
      setItems(page.items)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat daftar aplikasi')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250)
    return () => clearTimeout(timer)
  }, [load])

  async function submitCreate() {
    setSaving(true)
    setFormError(null)
    try {
      const created = await applicationsApi.create({
        name: form.name.trim(),
        description: form.description.trim() || null,
        owner: form.owner.trim() || null,
        category: form.category.trim() || null,
        source_url: form.source_url.trim(),
        login_url: form.login_url.trim() || null,
        environment_label: form.environment_label,
        version_label: form.version_label.trim() || null,
      })
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      setNotice(`Aplikasi "${created.name}" terdaftar dengan status Pending.`)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal menyimpan aplikasi')
    } finally {
      setSaving(false)
    }
  }

  async function submitAuthorize() {
    if (!authTarget) return
    setSaving(true)
    setFormError(null)
    try {
      await applicationsApi.authorize(authTarget.id, {
        authorization_status: authForm.authorization_status,
        authorization_ref: authForm.authorization_ref.trim() || undefined,
        authorization_note: authForm.authorization_note.trim() || undefined,
      })
      setNotice(`Status otorisasi "${authTarget.name}" diperbarui.`)
      setAuthTarget(null)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal memperbarui otorisasi')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(app: Application) {
    if (!window.confirm(`Hapus aplikasi "${app.name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return
    }
    try {
      await applicationsApi.remove(app.id)
      setNotice(`Aplikasi "${app.name}" dihapus.`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menghapus aplikasi')
    }
  }

  return (
    <div>
      <PageHeader
        title="Application Registry"
        description="Daftarkan aplikasi sumber yang telah mendapat izin capture."
        actions={
          can('applications:write') ? (
            <Button onClick={() => setCreateOpen(true)}>+ Tambah Aplikasi</Button>
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
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            className="input max-w-xs"
            placeholder="Cari aplikasi…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-xs text-slate-500 tabular">{items.length} aplikasi</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 text-slate-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada aplikasi terdaftar"
            description="Tambahkan aplikasi sumber terlebih dahulu, lalu lengkapi data otorisasi capture-nya."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="table-head">
                <tr>
                  <th className="pb-2.5 pr-4">Aplikasi</th>
                  <th className="pb-2.5 pr-4">Kategori</th>
                  <th className="pb-2.5 pr-4">Environment</th>
                  <th className="pb-2.5 pr-4">Otorisasi</th>
                  <th className="pb-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((app) => (
                  <tr key={app.id} className="table-row">
                    <td className="py-2.5 pr-4">
                      <Link
                        to={`/applications/${app.id}`}
                        className="font-medium text-slate-900 transition-colors hover:text-brand-600"
                      >
                        {app.name}
                      </Link>
                      <p className="max-w-xs truncate text-xs text-slate-500">{app.source_url}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{app.category ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{app.environment_label}</td>
                    <td className="py-2.5 pr-4">
                      <AuthorizationBadge status={app.authorization_status} />
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-0.5">
                        <Link
                          to={`/applications/${app.id}`}
                          className="rounded px-2 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50"
                        >
                          Detail
                        </Link>
                        {can('applications:authorize') && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthTarget(app)
                              setAuthForm({
                                authorization_status: app.authorization_status,
                                authorization_ref: app.authorization_ref ?? '',
                                authorization_note: app.authorization_note ?? '',
                              })
                              setFormError(null)
                            }}
                            className="rounded px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                          >
                            Otorisasi
                          </button>
                        )}
                        {can('applications:write') && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(app)}
                            className="rounded px-2 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        title="Tambah Aplikasi"
        description="Sumber URL akan diakses hanya oleh Capture Worker, atas aksi operator."
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void submitCreate()} loading={saving}>
              Simpan
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); void submitCreate() }} className="space-y-3.5">
          {formError && <Alert tone="danger">{formError}</Alert>}

          <Field label="Nama aplikasi" required>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="NigmaRisk"
              required
            />
          </Field>

          <Field label="URL aplikasi" required hint="Hanya http/https, alamat jaringan internal ditolak.">
            <input
              className="input"
              value={form.source_url}
              onChange={(e) => setForm({ ...form, source_url: e.target.value })}
              placeholder="https://nignarisk.example.com"
              required
            />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Kategori">
              <input
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Risk Management"
              />
            </Field>
            <Field label="Pemilik">
              <input
                className="input"
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                placeholder="PT Nigmagrid Indo Nesia"
              />
            </Field>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="URL login">
              <input
                className="input"
                value={form.login_url}
                onChange={(e) => setForm({ ...form, login_url: e.target.value })}
                placeholder="https://nignarisk.example.com/login"
              />
            </Field>
            <Field label="Environment">
              <select
                className="input"
                value={form.environment_label}
                onChange={(e) => setForm({ ...form, environment_label: e.target.value })}
              >
                <option value="staging">Staging</option>
                <option value="production">Production</option>
                <option value="demo">Demo</option>
              </select>
            </Field>
          </div>

          <Field label="Deskripsi">
            <textarea
              className="input min-h-[70px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ringkasan singkat aplikasi sumber"
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={authTarget !== null}
        title="Data Otorisasi Capture"
        description="Status approved wajib menyertakan rujukan dokumen izin."
        onClose={() => setAuthTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAuthTarget(null)}>
              Batal
            </Button>
            <Button onClick={() => void submitAuthorize()} loading={saving}>
              Simpan
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); void submitAuthorize() }} className="space-y-3.5">
          {formError && <Alert tone="danger">{formError}</Alert>}

          <Field label="Status otorisasi">
            <select
              className="input"
              value={authForm.authorization_status}
              onChange={(e) =>
                setAuthForm({ ...authForm, authorization_status: e.target.value })
              }
            >
              <option value="approved">Approved — boleh di-capture</option>
              <option value="pending">Pending — belum boleh di-capture</option>
              <option value="revoked">Revoked — izin dicabut</option>
            </select>
          </Field>

          <Field label="Rujukan dokumen izin" required>
            <input
              className="input"
              value={authForm.authorization_ref}
              onChange={(e) => setAuthForm({ ...authForm, authorization_ref: e.target.value })}
              placeholder="IZIN/2026/001"
            />
          </Field>

          <Field label="Catatan">
            <textarea
              className="input min-h-[70px]"
              value={authForm.authorization_note}
              onChange={(e) => setAuthForm({ ...authForm, authorization_note: e.target.value })}
              placeholder="Siapa yang memberi izin, kapan, dan batasanannya"
            />
          </Field>
        </form>
      </Modal>
    </div>
  )
}
