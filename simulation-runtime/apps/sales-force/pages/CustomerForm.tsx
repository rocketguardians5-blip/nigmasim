import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  EmptyState,
  FormField,
  PageHeader,
  Select,
  validateForm,
  useToast,
} from '@sim/core'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { buildCustomerFields } from '../fields'
import type { Customer, CustomerStatus, CustomerType } from '../seed'
import { primaryLinkClass, secondaryLinkClass } from '../format'
import { useCustomerStore } from '../store'

function toValues(customer: Customer): Record<string, string> {
  return {
    name: customer.name,
    company: customer.company,
    email: customer.email,
    phone: customer.phone,
    type: customer.type,
    status: customer.status,
    province: customer.province,
    city: customer.city,
  }
}

export function CustomerForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const toast = useToast()

  const items = useCustomerStore((state) => state.items)
  const hydrated = useCustomerStore((state) => state.hydrated)
  const add = useCustomerStore((state) => state.add)
  const update = useCustomerStore((state) => state.update)

  const existing = isEdit ? items.find((item) => item.id === id) : undefined

  const [values, setValues] = useState<Record<string, string>>(() => ({
    name: '',
    company: '',
    email: '',
    phone: '',
    type: 'Retail',
    status: 'Prospek',
    province: '',
    city: '',
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [initializedId, setInitializedId] = useState<string | null>(null)

  useEffect(() => {
    if (!existing || initializedId === existing.id) return
    setValues(toValues(existing))
    setInitializedId(existing.id)
  }, [existing, initializedId])

  const fields = useMemo(
    () =>
      buildCustomerFields((email) =>
        items.some(
          (item) =>
            item.id !== existing?.id &&
            item.email.toLowerCase() === email.trim().toLowerCase(),
        ),
      ),
    [items, existing?.id],
  )

  const handleChange = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const handleSubmit = () => {
    const nextErrors = validateForm(fields, values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      toast('Periksa kembali field yang ditandai merah.', 'error')
      return
    }

    const payload = {
      name: values.name.trim(),
      company: values.company.trim(),
      email: values.email.trim().toLowerCase(),
      phone: values.phone.trim(),
      type: values.type as CustomerType,
      status: values.status as CustomerStatus,
      province: values.province,
      city: values.city,
    }

    if (isEdit && existing) {
      update(existing.id, payload)
      toast(`Perubahan data ${payload.name} disimpan.`, 'success')
    } else {
      add({ ...payload, createdAt: new Date().toISOString().slice(0, 10) })
      toast(`Pelanggan ${payload.name} ditambahkan.`, 'success')
    }
    navigate('/customers')
  }

  if (isEdit && !existing) {
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

  return (
    <div className="space-y-4" data-testid="page-customer-form">
      <PageHeader
        title={isEdit ? 'Edit Pelanggan' : 'Tambah Pelanggan'}
        description={
          isEdit
            ? 'Perbarui data pelanggan di store simulasi.'
            : 'Data baru akan langsung muncul di tabel dan dashboard.'
        }
      />

      <Card>
        <div data-testid="customer-form">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {fields.map((field) => {
              const error = errors[field.key]
              const value = values[field.key] ?? ''
              if (field.type === 'select') {
                return (
                  <FormField
                    key={field.key}
                    label={field.label}
                    htmlFor={field.key}
                    required={field.rules?.some((rule) => rule.required)}
                    error={error}
                    hint={field.hint}
                  >
                    <Select
                      id={field.key}
                      invalid={Boolean(error)}
                      value={value}
                      onChange={(next) => handleChange(field.key, next)}
                      options={field.options ?? []}
                      placeholder={`Pilih ${field.label.toLowerCase()}…`}
                      dependsOnValue={
                        field.dependsOn ? values[field.dependsOn] ?? '' : undefined
                      }
                    />
                  </FormField>
                )
              }

              return (
                <FormField
                  key={field.key}
                  label={field.label}
                  htmlFor={field.key}
                  required={field.rules?.some((rule) => rule.required)}
                  error={error}
                  hint={field.hint}
                >
                  <input
                    id={field.key}
                    type={field.type ?? 'text'}
                    value={value}
                    onChange={(event) => handleChange(field.key, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleSubmit()
                      }
                    }}
                    placeholder={field.placeholder}
                    className={`sim-input${error ? ' border-rose-400 focus:border-rose-500' : ''}`}
                  />
                </FormField>
              )
            })}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <Link to={isEdit && existing ? `/customers/${existing.id}` : '/customers'} className={secondaryLinkClass}>
              Batal
            </Link>
            <Button type="button" variant="primary" onClick={handleSubmit} data-testid="submit-customer">
              {isEdit ? 'Simpan Perubahan' : 'Simpan Pelanggan'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
