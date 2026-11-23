import type { FieldConfig, FieldRule } from '../types'

export type ValidationErrors = Record<string, string>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRule(
  rule: FieldRule,
  value: string,
  values: Record<string, string>,
): string | null {
  const trimmed = value.trim()

  if (rule.required && !trimmed) return rule.message ?? 'Wajib diisi.'
  if (!trimmed) return null

  if (rule.minLength && trimmed.length < rule.minLength) {
    return rule.message ?? `Minimal ${rule.minLength} karakter.`
  }
  if (rule.maxLength && trimmed.length > rule.maxLength) {
    return rule.message ?? `Maksimal ${rule.maxLength} karakter.`
  }
  if (rule.number && Number.isNaN(Number(trimmed))) {
    return rule.message ?? 'Harus berupa angka.'
  }
  if (rule.email && !EMAIL_PATTERN.test(trimmed)) {
    return rule.message ?? 'Format email tidak valid.'
  }
  if (rule.pattern && !rule.pattern.test(trimmed)) {
    return rule.message ?? 'Format tidak valid.'
  }
  if (rule.custom) {
    const custom = rule.custom(trimmed, values)
    if (custom) return rule.message ?? custom
  }
  return null
}

export function validateForm(
  fields: FieldConfig[],
  values: Record<string, string>,
): ValidationErrors {
  const errors: ValidationErrors = {}
  for (const field of fields) {
    for (const rule of field.rules ?? []) {
      const message = validateRule(rule, values[field.key] ?? '', values)
      if (message) {
        errors[field.key] = message
        break
      }
    }
  }
  return errors
}
