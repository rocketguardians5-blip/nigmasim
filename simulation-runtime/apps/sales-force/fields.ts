import type { FieldConfig, SelectOption } from '@sim/core'
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, LOCATIONS } from './seed'

export const provinceOptions: SelectOption[] = Object.keys(LOCATIONS).map((province) => ({
  value: province,
  label: province,
}))

export const cityOptions: SelectOption[] = Object.entries(LOCATIONS).flatMap(
  ([province, cities]) =>
    cities.map((city) => ({
      value: city,
      label: city,
      parent: province,
    })),
)

const typeOptions: SelectOption[] = CUSTOMER_TYPES.map((type) => ({ value: type, label: type }))
const statusOptions: SelectOption[] = CUSTOMER_STATUSES.map((status) => ({
  value: status,
  label: status,
}))

/**
 * Konfigurasi field form pelanggan.
 * `dependsOn` pada field kota membuat opsi difilter oleh provinsi.
 */
export function buildCustomerFields(isEmailTaken: (email: string) => boolean): FieldConfig[] {
  return [
    {
      key: 'name',
      label: 'Nama lengkap',
      placeholder: 'Mis. Andi Pratama',
      rules: [{ required: true }, { minLength: 3, message: 'Minimal 3 karakter.' }],
    },
    {
      key: 'company',
      label: 'Perusahaan',
      placeholder: 'Mis. PT Sinar Nusantara',
      rules: [{ required: true }, { minLength: 2, message: 'Minimal 2 karakter.' }],
    },
    {
      key: 'email',
      label: 'Email',
      type: 'email',
      placeholder: 'nama@example.test',
      rules: [
        { required: true },
        { email: true, message: 'Format email tidak valid.' },
        {
          custom: (value) =>
            isEmailTaken(value) ? 'Email sudah dipakai pelanggan lain.' : null,
        },
      ],
    },
    {
      key: 'phone',
      label: 'Telepon',
      type: 'tel',
      placeholder: '+62 812-0000-0000',
      rules: [
        { required: true },
        {
          pattern: /^[0-9+()\s-]{7,20}$/,
          message: 'Gunakan angka, spasi, +, -, atau kurung (7–20 karakter).',
        },
      ],
    },
    {
      key: 'type',
      label: 'Tipe pelanggan',
      type: 'select',
      options: typeOptions,
      rules: [{ required: true, message: 'Pilih tipe pelanggan.' }],
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: statusOptions,
      rules: [{ required: true, message: 'Pilih status.' }],
    },
    {
      key: 'province',
      label: 'Provinsi',
      type: 'select',
      options: provinceOptions,
      rules: [{ required: true, message: 'Pilih provinsi.' }],
    },
    {
      key: 'city',
      label: 'Kota',
      type: 'select',
      options: cityOptions,
      dependsOn: 'province',
      hint: 'Pilihan kota mengikuti provinsi.',
      rules: [{ required: true, message: 'Pilih kota.' }],
    },
  ]
}
