import type { ReactNode } from 'react'

export type BaseRecord = { id: string }

export interface SelectOption {
  value: string
  label: string
  /** Untuk dropdown bertingkat: nilai parent (mis. provinsi untuk kota). */
  parent?: string
  /** Untuk <optgroup>. */
  group?: string
  disabled?: boolean
}

export interface TableColumn<T> {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
  render?: (row: T) => ReactNode
}

export interface FieldRule {
  required?: boolean
  minLength?: number
  maxLength?: number
  number?: boolean
  email?: boolean
  pattern?: RegExp
  message?: string
  custom?: (value: string, values: Record<string, string>) => string | null
}

export interface FieldConfig {
  key: string
  label: string
  type?: 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select'
  placeholder?: string
  hint?: string
  options?: SelectOption[]
  /** Key field induk; opsi Select difilter berdasarkan nilai field ini. */
  dependsOn?: string
  rules?: FieldRule[]
}

export type SortDir = 'asc' | 'desc'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
}
