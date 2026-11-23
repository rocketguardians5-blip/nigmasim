import { FormField, Select } from '../components'
import type { SimField } from './types'

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

interface FieldGridProps {
  fields: SimField[]
  values: FormValues
  errors?: Record<string, string>
  onChange: (key: string, value: string | boolean) => void
  idPrefix?: string
}

export function FieldGrid({ fields, values, errors, onChange, idPrefix = 'sim' }: FieldGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`
        const value = values[field.key]
        const wide = field.type === 'textarea'
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
            ) : field.type === 'checkbox' ? (
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
            ) : (
              <input
                id={id}
                type={field.type ?? 'text'}
                value={String(value ?? '')}
                onChange={(event) => onChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                aria-invalid={errors?.[field.key] ? true : undefined}
                data-testid={`field-${field.key}`}
                className="sim-input"
              />
            )}
          </FormField>
        )
      })}
    </div>
  )
}
