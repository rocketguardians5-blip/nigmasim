import { Badge, Card, PageHeader } from '@sim/core'
import { Link } from 'react-router-dom'
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, type CustomerStatus } from '../seed'
import { formatDate, primaryLinkClass, statusTone, typeTone } from '../format'
import { useCustomerStore } from '../store'

export function Dashboard() {
  const items = useCustomerStore((state) => state.items)

  const total = items.length
  const statusCounts = CUSTOMER_STATUSES.map((status) => ({
    status,
    count: items.filter((item) => item.status === status).length,
  }))
  const typeCounts = CUSTOMER_TYPES.map((type) => ({
    type,
    count: items.filter((item) => item.type === type).length,
  }))
  const recent = [...items]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .slice(0, 5)

  return (
    <div className="space-y-5" data-testid="page-dashboard">
      <PageHeader
        title="Dashboard"
        description="Ringkasan pelanggan dihitung langsung dari data simulasi."
        actions={
          <Link to="/customers/new" className={primaryLinkClass}>
            Tambah Pelanggan
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="px-4 py-3.5">
          <p className="text-[12px] text-slate-500">Total pelanggan</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900" data-testid="stat-total">
            {total}
          </p>
        </Card>
        {statusCounts.map(({ status, count }) => (
          <Card key={status} className="px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] text-slate-500">Status {status}</p>
              <Badge tone={statusTone(status as CustomerStatus)}>{status}</Badge>
            </div>
            <p
              className="mt-1 text-2xl font-semibold tabular-nums text-slate-900"
              data-testid={`stat-status-${status.toLowerCase()}`}
            >
              {count}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-[13px] font-semibold text-slate-900">Komposisi tipe pelanggan</h2>
          </div>
          <div className="space-y-3 px-4 py-4">
            {typeCounts.map(({ type, count }) => {
              const percent = total === 0 ? 0 : Math.round((count / total) * 100)
              return (
                <div key={type}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-slate-700">{type}</span>
                    <span className="tabular-nums text-slate-500">
                      {count} · {percent}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {total === 0 && (
              <p className="text-[12px] text-slate-500">Belum ada data pelanggan.</p>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-[13px] font-semibold text-slate-900">Pelanggan terbaru</h2>
            <Link to="/customers" className="text-[12px] font-medium text-brand-600 hover:text-brand-700">
              Lihat semua
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {recent.map((customer) => (
              <li key={customer.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <Link
                    to={`/customers/${customer.id}`}
                    className="block truncate text-[13px] font-medium text-slate-800 hover:text-brand-600"
                  >
                    {customer.name}
                  </Link>
                  <p className="truncate text-[11px] text-slate-500">{customer.company}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={typeTone(customer.type)}>{customer.type}</Badge>
                  <span className="text-[11px] tabular-nums text-slate-400">
                    {formatDate(customer.createdAt)}
                  </span>
                </div>
              </li>
            ))}
            {recent.length === 0 && (
              <li className="px-4 py-6 text-center text-[12px] text-slate-500">
                Belum ada pelanggan. Tambahkan data pertama Anda.
              </li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  )
}
