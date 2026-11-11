import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { applicationsApi, healthApi, usersApi } from '../lib/api'
import type { Application } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../components/ui'

const PHASES = [
  { name: '1 · Registry + Capture Studio', state: ' sedang dikerjakan' },
  { name: '2 · Screen Repository', state: ' belum mulai' },
  { name: '3 · UI Reconstruction', state: ' belum mulai' },
  { name: '4 · Full Simulation', state: ' belum mulai' },
  { name: '5 · Workflow + Walkthrough', state: ' belum mulai' },
  { name: '6 · SOP Generator', state: ' belum mulai' },
  { name: '7 · Publish + Export', state: ' belum mulai' },
]

export function DashboardPage() {
  const { user } = useAuth()
  const [applications, setApplications] = useState<Application[]>([])
  const [users, setUsers] = useState<{ total: number; active: number }>({ total: 0, active: 0 })
  const [apiStatus, setApiStatus] = useState<'ok' | 'down' | 'checking'>('checking')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [apps, usersPage] = await Promise.all([
          applicationsApi.list({ page: 1 }),
          usersApi.list(),
        ])
        await healthApi.check()
        if (cancelled) return
        setApplications(apps.items)
        setUsers({
          total: usersPage.total,
          active: usersPage.items.filter((u) => u.status === 'active').length,
        })
        setApiStatus('ok')
      } catch {
        if (!cancelled) setApiStatus('down')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const approved = applications.filter((a) => a.authorization_status === 'approved').length
  const pending = applications.filter((a) => a.authorization_status === 'pending').length

  const stats = [
    { label: 'Aplikasi terdaftar', value: applications.length, tone: 'text-slate-900' },
    { label: 'Sudah diotorisasi', value: approved, tone: 'text-emerald-600' },
    { label: 'Menunggu otorisasi', value: pending, tone: 'text-amber-600' },
    { label: 'Pengguna aktif', value: users.active, tone: 'text-brand-600' },
  ]

  return (
    <div>
      <PageHeader
        title={`Halo, ${user?.name?.split(' ')[0] ?? 'Admin'}`}
        description="Ringkasan aktivitas platform NigmaSim."
        actions={
          <Link
            to="/applications"
            className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
          >
            Kelola Aplikasi
          </Link>
        }
      />

      {apiStatus === 'down' && (
        <div className="mb-4">
          <Alert tone="danger" title="API tidak terjangkau">
            Pastikan backend berjalan di http://localhost:8000 sebelum membuka dashboard.
          </Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <p className="text-[13px] text-slate-500">{stat.label}</p>
            {loading ? (
              <Spinner className="mt-2 h-5 w-5 text-slate-300" />
            ) : (
              <p className={`mt-1 text-2xl font-semibold tabular ${stat.tone}`}>{stat.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card
          title="Aplikasi terbaru"
          description="Lima aplikasi terakhir didaftarkan."
          className="lg:col-span-2"
        >
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-6 w-6 text-slate-300" />
            </div>
          ) : applications.length === 0 ? (
            <EmptyState
              title="Belum ada aplikasi"
              description="Daftarkan aplikasi sumber yang sudah mendapat izin capture untuk memulai."
              action={
                <Link to="/applications" className="text-sm font-medium text-brand-600 hover:underline">
                  Buka Application Registry
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {applications.slice(0, 5).map((app) => (
                <li key={app.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      to={`/applications/${app.id}`}
                      className="truncate text-[13px] font-medium text-slate-900 transition-colors hover:text-brand-600"
                    >
                      {app.name}
                    </Link>
                    <p className="truncate text-xs text-slate-500">{app.source_url}</p>
                  </div>
                  <AuthorizationBadge status={app.authorization_status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Status pengembangan" description="Progres per fase proyek.">
          <ol className="space-y-2">
            {PHASES.map((phase, index) => (
              <li key={phase.name} className="flex items-start gap-2.5 text-[13px]">
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-medium ${
                    index === 0 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {index + 1}
                </span>
                <span className={index === 0 ? 'text-slate-900' : 'text-slate-500'}>
                  {phase.name}
                  <span className="ml-1.5 text-xs text-slate-400">{phase.state}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">
              Status API:{' '}
              {apiStatus === 'ok' ? (
                <span className="font-medium text-emerald-600">terhubung</span>
              ) : apiStatus === 'down' ? (
                <span className="font-medium text-rose-600">tidak terjangkau</span>
              ) : (
                <span className="text-slate-400">memeriksa…</span>
              )}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

export function AuthorizationBadge({ status }: { status: string }) {
  if (status === 'approved') return <Badge tone="success">Approved</Badge>
  if (status === 'revoked') return <Badge tone="danger">Revoked</Badge>
  return <Badge tone="warning">Pending</Badge>
}
