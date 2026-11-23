import type { SortDir } from '../types'

/** Pencarian case-insensitive pada kolom tertentu. */
export function searchRows<T>(rows: T[], query: string, keys: Array<keyof T & string>): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((row) =>
    keys.some((key) => String(row[key] ?? '').toLowerCase().includes(needle)),
  )
}

/** Filter exact-match; nilai kosong berarti tanpa filter. */
export function filterRows<T>(
  rows: T[],
  filters: Partial<Record<keyof T & string, string>>,
): T[] {
  const active = Object.entries(filters).filter(([, value]) => Boolean(value)) as Array<
    [keyof T & string, string]
  >
  if (active.length === 0) return rows
  return rows.filter((row) => active.every(([key, value]) => String(row[key] ?? '') === value))
}

/** Urutkan tanpa memutasi array asli. */
export function sortRows<T>(rows: T[], key: (keyof T & string) | null, dir: SortDir): T[] {
  if (!key) return rows
  const copy = [...rows]
  copy.sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    const cmp =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''), 'id', { numeric: true })
    return dir === 'asc' ? cmp : -cmp
  })
  return copy
}

export interface PageResult<T> {
  rows: T[]
  page: number
  totalPages: number
  total: number
  pageSize: number
}

/** Pagination aman: page selalu dijepit ke rentang valid. */
export function paginate<T>(rows: T[], page: number, pageSize: number): PageResult<T> {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
    pageSize,
  }
}
