import type { ReactNode } from 'react'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  useConfirm,
  useToast,
} from '@sim/core'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatDate, primaryLinkClass, secondaryLinkClass, statusTone, typeTone } from '../format'
import { useCustomerStore } from '../store'

export function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()

  const items = useCustomerStore((state) => state.items)
  const hydrated = useCustomerStore((state) => state.hydrated)
  const remove = useCustomerStore((state) => state.remove)

  const customer = items.find((item) => item.id === id)

  if (!customer) {
    if (!hydrated) {
      return <p className="text-[13px] text-slate-500">Memuat data pelanggan…</p>
    }
    return (
      <EmptyState
        title="Pelanggan tidak ditemukan"
        description="Data mungkin sudah dihapus atau direset ke seed."
        action={
          <Link to="/customers" className={primaryLinkClass}>
            Kembali ke daftar
          </Link>
        }
      />
    )
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Hapus ${customer.name}?`,
      description: 'Data pelanggan akan dihapus dari simulasi. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Hapus',
      tone: 'danger',
    })
    if (!ok) return
    remove(customer.id)
    toast(`Pelanggan ${customer.name} dihapus.`, 'success')
    navigate('/customers')
  }

  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: 'Email', value: customer.email },
    { label: 'Telepon', value: customer.phone },
    { label: 'Tipe pelanggan', value: <Badge tone={typeTone(customer.type)}>{customer.type}</Badge> },
    { label: 'Status', value: <Badge tone={statusTone(customer.status)}>{customer.status}</Badge> },
    { label: 'Provinsi', value: customer.province },
    { label: 'Kota', value: customer.city },
    { label: 'Terdaftar', value: formatDate(customer.createdAt) },
    { label: 'ID simulasi', value: <code className="text-[12px] text-slate-500">{customer.id}</code> },
  ]

  return (
    <div className="space-y-4" data-testid="page-customer-detail">
      <PageHeader
        title={customer.name}
        description={customer.company}
        actions={
          <>
            <Link to="/customers" className={secondaryLinkClass}>
              Kembali
            </Link>
            <Link to={`/customers/${customer.id}/edit`} className={primaryLinkClass}>
              Edit
            </Link>
            <Button variant="danger" onClick={() => void handleDelete()}>
              Hapus
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-[13px] font-semibold text-slate-900">Profil pelanggan</h2>
          </div>
          <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {row.label}
                </dt>
                <dd className="mt-0.5 break-words text-[13px] text-slate-800">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="h-fit">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-[13px] font-semibold text-slate-900">Catatan simulasi</h2>
          </div>
          <div className="space-y-2 p-4 text-[12px] leading-relaxed text-slate-600">
            <p>
              Data ini tersimpan lokal di browser (IndexedDB) dan tidak dikirim ke server mana
              pun.
            </p>
            <p>
              Gunakan tombol <strong>Reset data</strong> di bar atas untuk mengembalikan seluruh
              pelanggan ke data seed.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
