import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  FormField,
  PageHeader,
  Select,
  filterRows,
  paginate,
  searchRows,
  sortRows,
  useConfirm,
  useToast,
  type SortDir,
  type TableColumn,
} from '@sim/core'
import { Link, useNavigate } from 'react-router-dom'
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, type Customer } from '../seed'
import { formatDate, primaryLinkClass, statusTone, typeTone } from '../format'
import { useCustomerStore } from '../store'

const PAGE_SIZE = 8

const statusFilterOptions = CUSTOMER_STATUSES.map((status) => ({ value: status, label: status }))
const typeFilterOptions = CUSTOMER_TYPES.map((type) => ({ value: type, label: type }))

export function CustomerList() {
  const items = useCustomerStore((state) => state.items)
  const remove = useCustomerStore((state) => state.remove)
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [sortKey, setSortKey] = useState('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [query, status, type, sortKey, sortDir])

  const filtered = useMemo(() => {
    let rows = searchRows(items, query, ['name', 'company', 'email', 'city'])
    rows = filterRows(rows, { status, type })
    return sortRows(rows, sortKey as keyof Customer & string, sortDir)
  }, [items, query, status, type, sortKey, sortDir])

  const result = paginate(filtered, page, PAGE_SIZE)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const handleDelete = async (customer: Customer) => {
    const ok = await confirm({
      title: `Hapus ${customer.name}?`,
      description: 'Data pelanggan akan dihapus dari simulasi. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Hapus',
      tone: 'danger',
    })
    if (!ok) return
    remove(customer.id)
    toast(`Pelanggan ${customer.name} dihapus.`, 'success')
  }

  const columns: TableColumn<Customer>[] = [
    {
      key: 'name',
      label: 'Pelanggan',
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <Link
            to={`/customers/${row.id}`}
            className="block truncate font-medium text-slate-800 hover:text-brand-600"
          >
            {row.name}
          </Link>
          <p className="truncate text-[11px] text-slate-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'company',
      label: 'Perusahaan',
      sortable: true,
      render: (row) => <span className="block max-w-[220px] truncate">{row.company}</span>,
    },
    {
      key: 'type',
      label: 'Tipe',
      render: (row) => <Badge tone={typeTone(row.type)}>{row.type}</Badge>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
    },
    {
      key: 'city',
      label: 'Kota',
      render: (row) => (
        <div>
          <p className="text-[12px] text-slate-700">{row.city}</p>
          <p className="text-[11px] text-slate-400">{row.province}</p>
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: 'Terdaftar',
      sortable: true,
      render: (row) => <span className="tabular-nums text-slate-500">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      label: 'Aksi',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => navigate(`/customers/${row.id}`)}>
            Detail
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/customers/${row.id}/edit`)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:bg-rose-50"
            onClick={() => void handleDelete(row)}
          >
            Hapus
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4" data-testid="page-customers">
      <PageHeader
        title="Daftar Pelanggan"
        description={`${filtered.length} dari ${items.length} pelanggan ditampilkan.`}
        actions={
          <Link to="/customers/new" className={primaryLinkClass}>
            Tambah Pelanggan
          </Link>
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="sim-label" htmlFor="customer-search">
              Cari
            </label>
            <input
              id="customer-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nama, perusahaan, email, atau kota…"
              className="sim-input"
            />
          </div>
          <FormField label="Status" htmlFor="filter-status">
            <Select
              id="filter-status"
              value={status}
              onChange={setStatus}
              options={statusFilterOptions}
              placeholder="Semua status"
            />
          </FormField>
          <FormField label="Tipe" htmlFor="filter-type">
            <Select
              id="filter-type"
              value={type}
              onChange={setType}
              options={typeFilterOptions}
              placeholder="Semua tipe"
            />
          </FormField>
        </div>

        <DataTable
          columns={columns}
          rows={result.rows}
          rowKey={(row) => row.id}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={handleSort}
          data-testid="customer-table"
          empty={
            <EmptyState
              title="Tidak ada pelanggan yang cocok"
              description="Ubah kata kunci atau filter, atau tambahkan pelanggan baru."
              action={
                <Link to="/customers/new" className={primaryLinkClass}>
                  Tambah Pelanggan
                </Link>
              }
            />
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
              <p className="text-[12px] text-slate-500">
                Halaman {result.page} dari {result.totalPages} · {result.total} baris
              </p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  disabled={result.page <= 1}
                  onClick={() => setPage(result.page - 1)}
                >
                  Sebelumnya
                </Button>
                <Button
                  size="sm"
                  disabled={result.page >= result.totalPages}
                  onClick={() => setPage(result.page + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          }
        />
      </Card>
    </div>
  )
}
