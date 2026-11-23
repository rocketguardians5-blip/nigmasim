import type { ReactNode } from 'react'
import { cn } from '../cn'
import type { SortDir, TableColumn } from '../types'
import { EmptyState } from './EmptyState'

interface DataTableProps<T> {
  columns: TableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  sortKey?: string | null
  sortDir?: SortDir
  onSortChange?: (key: string) => void
  empty?: ReactNode
  footer?: ReactNode
  'data-testid'?: string
}

const ALIGN: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDir = 'asc',
  onSortChange,
  empty,
  footer,
  'data-testid': testId,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <>
        {empty ?? (
          <EmptyState
            title="Belum ada data"
            description="Tambahkan data baru atau ubah kata kunci pencarian Anda."
          />
        )}
        {footer}
      </>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid={testId}>
          <thead className="sim-table-head">
            <tr>
              {columns.map((column) => {
                const align = column.align ?? 'left'
                const isSorted = sortKey === column.key
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn('whitespace-nowrap px-3 py-2.5', ALIGN[align], column.className)}
                    aria-sort={
                      isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(column.key)}
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-700"
                      >
                        {column.label}
                        <span aria-hidden="true" className={cn('text-[9px]', !isSorted && 'opacity-30')}>
                          {isSorted && sortDir === 'desc' ? '▼' : '▲'}
                        </span>
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="sim-table-row transition-colors hover:bg-slate-50">
                {columns.map((column) => {
                  const align = column.align ?? 'left'
                  return (
                    <td
                      key={column.key}
                      className={cn('px-3 py-2.5 align-middle', ALIGN[align], column.className)}
                    >
                      {column.render
                        ? column.render(row)
                        : String((row as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </>
  )
}
