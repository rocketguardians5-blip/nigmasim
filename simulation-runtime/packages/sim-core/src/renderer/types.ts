/**
 * Tipe data untuk app simulasi yang dihasilkan generator.
 *
 * Semua isi berasal dari rekonstruksi yang disetujui. Renderer generik
 * membaca data ini; tidak ada teks rekonstruksi yang masuk ke kode TSX.
 */

export type SimFieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'date'

export interface SimOption {
  value: string
  label: string
  /** Untuk dropdown bertingkat: nilai parent. */
  parent?: string
}

export interface SimVisualTheme {
  page?: {
    backgroundColor?: string
    fontFamily?: string
  }
  card?: {
    box?: { x: number; y: number; w: number; h: number }
    backgroundColor?: string
    borderColor?: string
    borderWidth?: string
    borderRadius?: string
    boxShadow?: string
    padding?: string
  }
  primary?: {
    backgroundColor?: string
    color?: string
    borderRadius?: string
    fontWeight?: string | number
  }
  text?: {
    heading?: {
      color?: string
      fontSize?: string
      fontWeight?: string | number
    }
    body?: {
      color?: string
      fontSize?: string
      fontWeight?: string | number
    }
  }
}

export interface SimField {
  key: string
  label: string
  type?: SimFieldType
  required?: boolean
  placeholder?: string
  hint?: string
  options?: SimOption[]
  /** Key field induk untuk dropdown bertingkat. */
  dependsOn?: string
  /**
   * Tombol mata (lihat/sembunyikan) di dalam field.
   * - `true`  : tombol selalu tampil.
   * - `false` : tombol dimatikan walaupun field-nya bertipe password.
   * - tidak diisi: otomatis untuk field bertipe `password`.
   */
  toggleVisibility?: boolean
  /** Gaya visual opsional yang diekstrak dari DOM. */
  style?: Record<string, string | number>
  /** SVG string dari DOM untuk ikon field/input. */
  iconSvg?: string
}

export interface SimColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'status' | 'date' | 'action'
  /** Template kolom gabungan, mis. "{code} / {project}". */
  template?: string
}

export interface SimDataset {
  key: string
  label: string
  fields: SimField[]
  columns: SimColumn[]
  searchKeys?: string[]
}

export interface SimStat {
  label: string
  value: string
  hint?: string
}

export type SimButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export interface SimAction {
  label: string
  variant?: SimButtonVariant
  toast?: string
  navigateTo?: string
}

export interface SimTableFilter {
  key: string
  label: string
  options: SimOption[]
}

export interface SimPrefill {
  label: string
  values: Record<string, string | boolean>
}

/** Slot tautan di kanan baris checkbox (mis. "Lupa Password?"). */
export interface SimLinkRight {
  label: string
  /** Teks aksi yang disimulasikan saat tautan diklik. */
  action?: string
}

export type SimSection =
  | { type: 'stats'; title?: string; items: SimStat[]; style?: Record<string, string | number> }
  | { type: 'text'; title?: string; body: string; style?: Record<string, string | number> }
  | { type: 'actions'; title?: string; items: SimAction[]; style?: Record<string, string | number> }
  | {
      type: 'form'
      title?: string
      description?: string
      fields: SimField[]
      submitLabel: string
      successToast?: string
      navigateTo?: string
      prefill?: SimPrefill
      dataset?: string
      /** Tautan opsional di kanan baris checkbox. */
      linkRight?: SimLinkRight
      style?: Record<string, string | number>
    }
  | {
      type: 'table'
      title?: string
      description?: string
      dataset: string
      filters?: SimTableFilter[]
      createLabel?: string
      style?: Record<string, string | number>
    }
  | {
      type: 'list'
      title?: string
      description?: string
      items: { label: string; meta?: string }[]
      style?: Record<string, string | number>
    }
  | { type: 'code'; title?: string; body: string; style?: Record<string, string | number> }

export interface SimPage {
  key: string
  title: string
  route: string
  subtitle?: string
  kind?: 'auth' | 'dashboard' | 'table' | 'custom'
  sections: SimSection[]
  /** Tema visual halaman (background, font, card, tombol, teks) */
  theme?: SimVisualTheme
}

export interface SimNavItem {
  page: string
  label: string
}

export interface SimAppDefinition {
  name: string
  description?: string
  brand?: string
  nav: SimNavItem[]
  pages: SimPage[]
  datasets: SimDataset[]
}

export type SimValue = string | number | boolean
export type SimRecord = { id: string } & Record<string, SimValue>
export type SimSeedData = Record<string, SimRecord[]>
