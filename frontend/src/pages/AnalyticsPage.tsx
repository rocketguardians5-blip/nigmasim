import { useCallback, useEffect, useState } from 'react'
import { analyticsApi } from '../lib/analytics'
import type { VisitorStatsSummary } from '../lib/analytics'
import { useAuth } from '../lib/auth'
import { Alert, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { IconChart, IconPanel, IconUsers } from '../components/icons'

export function AnalyticsPage() {
  const { can } = useAuth()
  const [stats, setStats] = useState<VisitorStatsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canRead = can('analytics:read')

  const loadStats = useCallback(async () => {
    if (!canRead) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await analyticsApi.getStats(50)
      setStats(data)
    } catch {
      setError('Gagal memuat statistik pengunjung')
    } finally {
      setLoading(false)
    }
  }, [canRead])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const totalVisits = stats?.total_visits ?? 0
  const topPath = stats?.visits_by_path[0]

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Statistik kunjungan halaman publik dan demo. Tidak ada data pribadi sensitif yang dikumpulkan."
      />

      {!canRead && (
        <div className="mb-4">
          <Alert tone="warning">Anda tidak memiliki izin melihat statistik pengunjung.</Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Total Kunjungan">
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-slate-900">{totalVisits}</span>
            <span className="text-xs text-slate-500">kunjungan</span>
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
            <IconChart size={12} /> Data diperbarui otomatis
          </div>
        </Card>

        <Card title="Screen Paling Banyak Dilihat">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
              <IconPanel size={16} />
            </div>
            <div>
              <p className="text-[13px] font-medium text-slate-900 truncate">
                {topPath ? topPath.path : '—'}
              </p>
              <p className="text-xs text-slate-500">
                {topPath ? topPath.count : 0} kunjungan
              </p>
            </div>
          </div>
        </Card>

        <Card title="Pengunjung Unik (per IP)">
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-slate-900">
              {stats?.recent_visits.length ?? 0}
            </span>
            <span className="text-xs text-slate-500">aktivitas terbaru</span>
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
            <IconUsers size={12} /> Berdasarkan IP pengunjung
          </div>
        </Card>
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="danger" title="Gagal">{error}</Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Kunjungan per Halaman">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-3 text-xs font-semibold text-slate-500">Halaman</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {loading || !stats ? (
                  <tr>
                    <td className="py-4 text-slate-400">Memuat...</td>
                    <td className="py-4 text-slate-400 text-right">—</td>
                  </tr>
                ) : stats.visits_by_path.length === 0 ? (
                  <tr>
                    <td className="py-4 text-slate-400">Belum ada data</td>
                    <td className="py-4 text-slate-400 text-right">—</td>
                  </tr>
                ) : (
                  stats.visits_by_path.map((item) => (
                    <tr key={item.path} className="border-b border-slate-100">
                      <td className="py-3 text-slate-700 truncate">{item.path}</td>
                      <td className="py-3 text-slate-900 font-medium text-right">{item.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {stats && stats.visits_by_path.length === 0 && !loading && (
            <EmptyState title="Belum ada kunjungan" description="Kunjungan akan muncul setelah ada pengunjung membuka halaman publik/demo." />
          )}
        </Card>

        <Card title="Kunjungan Terbaru">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-3 text-xs font-semibold text-slate-500">Waktu</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500">Halaman</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 text-right">IP</th>
                </tr>
              </thead>
              <tbody>
                {loading || !stats ? (
                  <tr>
                    <td className="py-4 text-slate-400">Memuat...</td>
                    <td className="py-4 text-slate-400">—</td>
                    <td className="py-4 text-slate-400 text-right">—</td>
                  </tr>
                ) : stats.recent_visits.length === 0 ? (
                  <tr>
                    <td className="py-4 text-slate-400">Belum ada data</td>
                    <td className="py-4 text-slate-400">—</td>
                    <td className="py-4 text-slate-400 text-right">—</td>
                  </tr>
                ) : (
                  stats.recent_visits.map((visit) => (
                    <tr key={visit.id} className="border-b border-slate-100">
                      <td className="py-3 text-slate-700">
                        {new Date(visit.visited_at).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 text-slate-700 truncate">{visit.path}</td>
                      <td className="py-3 text-slate-700 text-right truncate">
                        {visit.ip_address ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {stats && stats.recent_visits.length === 0 && !loading && (
            <EmptyState title="Belum ada aktivitas" description="Kunjungan terbaru akan ditampilkan di sini." />
          )}
        </Card>
      </div>

      {loading && !error && !stats && (
        <div className="mt-8 grid h-64 place-items-center">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      )}
    </div>
  )
}
