import { useState } from 'react'
import { FormField, Select } from '../components'
import type { SimField, SimLinkRight } from './types'

export type FormValues = Record<string, string | boolean>

export function defaultFormValues(fields: SimField[]): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    values[field.key] = field.type === 'checkbox' ? false : ''
  }
  return values
}

export function validateForm(fields: SimField[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    if (!field.required) continue
    const value = values[field.key]
    if (field.type === 'checkbox') {
      if (!value) errors[field.key] = 'Wajib dicentang.'
      continue
    }
    const text = String(value ?? '').trim()
    if (!text) {
      errors[field.key] = 'Wajib diisi.'
      continue
    }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      errors[field.key] = 'Format email tidak valid.'
    }
  }
  return errors
}

/** Render SVG icon secara aman dari data URI tanpa dangerouslySetInnerHTML */
function SafeIcon({ svgString, className }: { svgString?: string; className?: string }) {
  if (!svgString || !svgString.trim().startsWith('<svg')) return null
  const encoded = encodeURIComponent(svgString.trim())
  const dataUri = `data:image/svg+xml;utf8,${encoded}`
  return (
    <img
      src={dataUri}
      alt=""
      aria-hidden="true"
      className={className ?? 'h-4 w-4 shrink-0 object-contain'}
    />
  )
}

/** Ikon mata inline (SVG bawaan, tanpa dependency eksternal). */
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
      {crossed ? <path d="M4.5 19.5 19.5 4.5" strokeLinecap="round" /> : null}
    </svg>
  )
}

interface FieldGridProps {
  fields: SimField[]
  values: FormValues
  errors?: Record<string, string>
  onChange: (key: string, value: string | boolean) => void
  idPrefix?: string
  /** true → field ditumpuk satu kolom (dipakai layar auth). */
  stacked?: boolean
  /** Slot tautan di kanan baris checkbox. */
  linkRight?: SimLinkRight
  /** Dipanggil saat tautan kanan diklik. */
  onLinkRight?: (link: SimLinkRight) => void
}

export function FieldGrid({
  fields,
  values,
  errors,
  onChange,
  idPrefix = 'sim',
  stacked = false,
  linkRight,
  onLinkRight,
}: FieldGridProps) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  const checkboxFields = fields.filter((field) => field.type === 'checkbox')
  const singleCheckbox = checkboxFields.length === 1 ? checkboxFields[0] : null
  const gridFields = singleCheckbox
    ? fields.filter((field) => field.key !== singleCheckbox.key)
    : fields

  const toggleReveal = (key: string) => {
    setRevealed((current) => ({ ...current, [key]: !current[key] }))
  }

  const renderCheckbox = (field: SimField, id: string, value: FormValues[string]) => (
    <label className="flex items-center gap-2 py-2 text-[13px] text-slate-700">
      <input
        id={id}
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onChange(field.key, event.target.checked)}
        data-testid={`field-${field.key}`}
        className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-300"
      />
      <span>{field.label}</span>
    </label>
  )

  const renderField = (field: SimField) => {
    const id = `${idPrefix}-${field.key}`
    const value = values[field.key]
    const wide = field.type === 'textarea'
    // Tombol mata: otomatis untuk field password, bisa dimatikan lewat
    // `toggleVisibility: false` atau dipaksa lewat `toggleVisibility: true`.
    const canToggle =
      field.type === 'password' ? field.toggleVisibility !== false : field.toggleVisibility === true
    const shown = Boolean(revealed[field.key])
    const inputType = shown ? 'text' : (field.type ?? 'text')

    if (field.type === 'checkbox') {
      return renderCheckbox(field, id, value)
    }

    return (
      <FormField
        key={field.key}
        label={field.label}
        htmlFor={id}
        required={field.required}
        error={errors?.[field.key]}
        hint={field.hint}
        className={wide ? 'sm:col-span-2' : undefined}
      >
        {field.type === 'select' ? (
          <Select
            id={id}
            value={String(value ?? '')}
            onChange={(next) => onChange(field.key, next)}
            options={field.options ?? []}
            placeholder={`Pilih ${field.label.toLowerCase()}…`}
            dependsOnValue={
              field.dependsOn ? String(values[field.dependsOn] ?? '') : undefined
            }
            invalid={Boolean(errors?.[field.key])}
            data-testid={`field-${field.key}`}
          />
        ) : field.type === 'textarea' ? (
          <textarea
            id={id}
            value={String(value ?? '')}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            aria-invalid={errors?.[field.key] ? true : undefined}
            data-testid={`field-${field.key}`}
            className="sim-input min-h-[88px] py-2"
          />
        ) : canToggle ? (
          <div className="relative">
            {field.iconSvg ? (
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <SafeIcon svgString={field.iconSvg} className="h-4 w-4" />
              </div>
            ) : null}
            <input
              id={id}
              type={inputType}
              value={String(value ?? '')}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
              aria-invalid={errors?.[field.key] ? true : undefined}
              data-testid={`field-${field.key}`}
              style={field.style as React.CSSProperties | undefined}
              className={`sim-input pr-10 ${field.iconSvg ? 'pl-9' : ''}`}
            />
            <button
              type="button"
              onClick={() => toggleReveal(field.key)}
              aria-label={shown ? 'Sembunyikan password' : 'Tampilkan password'}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-colors hover:text-slate-600"
            >
              <EyeIcon crossed={shown} />
            </button>
          </div>
        ) : (
          <div className="relative">
            {field.iconSvg ? (
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <SafeIcon svgString={field.iconSvg} className="h-4 w-4" />
              </div>
            ) : null}
            <input
              id={id}
              type={field.type ?? 'text'}
              value={String(value ?? '')}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
              aria-invalid={errors?.[field.key] ? true : undefined}
              data-testid={`field-${field.key}`}
              style={field.style as React.CSSProperties | undefined}
              className={`sim-input ${field.iconSvg ? 'pl-9' : ''}`}
            />
          </div>
        )}
      </FormField>
    )
  }

  return (
    <div className="space-y-4">
      <div className={stacked ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'}>
        {gridFields.map((field) => renderField(field))}
      </div>

      {singleCheckbox ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {renderCheckbox(singleCheckbox, `${idPrefix}-${singleCheckbox.key}`, values[singleCheckbox.key])}
          {linkRight ? (
            <button
              type="button"
              onClick={() => onLinkRight?.(linkRight)}
              className="text-[12px] font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline"
            >
              {linkRight.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
