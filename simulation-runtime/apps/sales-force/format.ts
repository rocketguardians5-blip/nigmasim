import type { BadgeTone } from '@sim/core'
import type { CustomerStatus, CustomerType } from './seed'

export function statusTone(status: CustomerStatus): BadgeTone {
  if (status === 'Aktif') return 'success'
  if (status === 'Prospek') return 'warning'
  return 'neutral'
}

export function typeTone(type: CustomerType): BadgeTone {
  if (type === 'Corporate') return 'brand'
  if (type === 'Government') return 'danger'
  return 'neutral'
}

export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export const primaryLinkClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded bg-brand-500 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-600'

export const secondaryLinkClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded border border-slate-300 bg-white px-3.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50'
