import { Fragment, useEffect, useMemo } from 'react'
import { cn } from '../cn'
import type { SelectOption } from '../types'

interface SelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  /**
   * Dropdown bertingkat: hanya opsi dengan `parent` yang sama (atau tanpa
   * parent) yang ditampilkan. Bila nilai saat ini tidak valid untuk parent
   * baru, nilai di-reset ke string kosong.
   */
  dependsOnValue?: string
  'data-testid'?: string
}

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder = 'Pilih…',
  disabled,
  invalid,
  className,
  dependsOnValue,
  'data-testid': testId,
}: SelectProps) {
  const visible = useMemo(
    () =>
      options.filter(
        (option) =>
          option.parent === undefined ||
          dependsOnValue === undefined ||
          option.parent === dependsOnValue,
      ),
    [options, dependsOnValue],
  )

  // Reset nilai bila parent berubah dan nilai lama tidak lagi tersedia.
  useEffect(() => {
    if (!value) return
    if (!visible.some((option) => option.value === value)) {
      onChange('')
    }
  }, [value, visible, onChange])

  const groups = useMemo(() => {
    const map = new Map<string, SelectOption[]>()
    for (const option of visible) {
      const key = option.group ?? ''
      const bucket = map.get(key)
      if (bucket) bucket.push(option)
      else map.set(key, [option])
    }
    return [...map.entries()]
  }, [visible])

  const hasGroups = visible.some((option) => Boolean(option.group))

  const renderOption = (option: SelectOption) => (
    <option key={option.value} value={option.value} disabled={option.disabled}>
      {option.label}
    </option>
  )

  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      data-testid={testId}
      className={cn(
        'sim-input pr-8',
        invalid && 'border-rose-400 focus:border-rose-500',
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {hasGroups
        ? groups.map(([group, groupOptions]) =>
            group ? (
              <optgroup key={group} label={group}>
                {groupOptions.map(renderOption)}
              </optgroup>
            ) : (
              <Fragment key="__ungrouped">{groupOptions.map(renderOption)}</Fragment>
            ),
          )
        : visible.map(renderOption)}
    </select>
  )
}
