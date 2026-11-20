import { useCallback, useEffect, useState } from 'react'
import { ApiError, usersApi } from '../lib/api'
import type { Role, User } from '../lib/api'
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

export function UsersPage() {
  const { can, user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role_id: 0 })
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [userPage, roleList] = await Promise.all([usersApi.list(search || undefined), usersApi.roles()])
      setUsers(userPage.items)
      setRoles(roleList)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat pengguna')
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
      await usersApi.create({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role_id: form.role_id,
      })
      setCreateOpen(false)
      setForm({ name: '', email: '', password: '', role_id: 0 })
      setNotice('Pengguna baru berhasil dibuat.')
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal membuat pengguna')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(target: User) {
    const next = target.status === 'active' ? 'disabled' : 'active'
    try {
      await usersApi.setStatus(target.id, next)
      setNotice(`Akun ${target.name} kini ${next === 'active' ? 'aktif' : 'dinonaktifkan'}.`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah status akun')
    }
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Akun yang dapat mengakses platform NigmaSim beserta peran dan izinnya."
        actions={
          can('users:write') ? (
            <Button onClick={() => setCreateOpen(true)}>Tambah Pengguna</Button>
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Pengguna" className="lg:col-span-2">
          <div className="mb-4">
            <input
              className="input max-w-xs"
              placeholder="Cari nama atau email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6 text-slate-300" />
            </div>
          ) : users.length === 0 ? (
            <EmptyState title="Belum ada pengguna" description="Tambahkan akun pertama untuk platform." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="table-head">
                  <tr>
                    <th className="pb-2.5 pr-4">Nama</th>
                    <th className="pb-2.5 pr-4">Peran</th>
                    <th className="pb-2.5 pr-4">Status</th>
                    <th className="pb-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.id} className="table-row">
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600">{row.role.name}</td>
                      <td className="py-2.5 pr-4">
                        {row.status === 'active' ? (
                          <Badge tone="success">Aktif</Badge>
                        ) : (
                          <Badge tone="danger">Nonaktif</Badge>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        {can('users:write') && row.id !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => void toggleStatus(row)}
                            className="rounded px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                          >
                            {row.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Peran dan izin" description="Izin ditegakkan di backend, bukan hanya di menu.">
          <ul className="space-y-3">
            {roles.map((role) => (
              <li key={role.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">{role.name}</p>
                {role.description && (
                  <p className="mt-0.5 text-xs text-slate-500">{role.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {role.permissions.slice(0, 8).map((perm) => (
                    <span
                      key={perm}
                      className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
                    >
                      {perm}
                    </span>
                  ))}
                  {role.permissions.length > 8 && (
                    <span className="text-[10px] text-slate-400">
                      +{role.permissions.length - 8} lainnya
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Modal
        open={createOpen}
        title="Tambah Pengguna"
        description="Password minimal 8 karakter. Pengguna baru dapat langsung login."
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
        <div className="space-y-3.5">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Nama lengkap" required>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Email" required>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="nama@nigmagrid.com"
            />
          </Field>
          <Field label="Password awal" required hint="Minimal 8 karakter.">
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="Peran" required>
            <select
              className="input"
              value={form.role_id}
              onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}
            >
              <option value={0}>— pilih peran —</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
