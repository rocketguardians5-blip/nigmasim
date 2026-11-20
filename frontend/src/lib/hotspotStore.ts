/**
 * Hotspot Store - Single Source of Truth for Hotspots across NigmaSim.
 * 
 * Digunakan bersama oleh:
 * 1. UI Reconstruction (Draf struktur)
 * 2. HotspotEditor (Mode Fokus)
 * 3. Simulation Builder (Pembangun simulasi)
 * 
 * Struktur data per screen:
 * - detected: hasil mentah deteksi AI (read-only, tidak diubah oleh edit pengguna)
 * - overrides: editan pengguna terhadap kotak AI, dikunci dengan id stabil (x, y, w, h, label, aksi)
 * - deleted: daftar id kotak AI yang sudah dihapus pengguna (tombstone)
 * - manual: kotak yang dibuat manual
 * 
 * Final computed boxes:
 * final = (detected - deleted) + overrides + manual
 */

import { reconstructionApi } from './reconstruction'

export interface HotspotItem {
  id: string
  dbId?: number // Database ID integer bila sudah tersimpan di backend
  stableId?: string // Hash stabil untuk kotak AI
  x: number // Persen (0-100)
  y: number // Persen (0-100)
  w: number // Persen (0-100)
  h: number // Persen (0-100)
  label: string
  action: string
  component_type: string
  layer: 'manual' | 'auto'
  source?: string // 'ai-vision' | 'manual'
  isOverridden?: boolean
  element_type?: 'button' | 'dropdown' | 'input_data'
  config_json?: string
}

export interface ScreenHotspotState {
  detected: HotspotItem[]
  overrides: Record<string, Partial<HotspotItem>>
  deleted: string[] // List of stableIds/ids tombstoned
  manual: HotspotItem[]
}

const STORAGE_PREFIX = 'nigmasim_hotspots_v2_'

/**
 * Normalisasi dan cek apakah sebuah ID sudah masuk daftar tombstone (deleted).
 * Mendukung format string murni ("1401"), "auto_1401", maupun "manual_1401".
 */
export function isTombstoned(id: string | number, deletedList: string[]): boolean {
  const s = String(id)
  const numMatch = /(\d+)$/.exec(s)
  const num = numMatch ? numMatch[1] : null
  const deletedSet = new Set(deletedList.map(String))
  if (deletedSet.has(s)) return true
  if (num && (deletedSet.has(num) || deletedSet.has(`auto_${num}`) || deletedSet.has(`manual_${num}`))) {
    return true
  }
  return false
}

/**
 * Filter elemen interaktif:
 * - Dihitung interaktif: button, link, input, field, dropdown, select, textarea, card, logo,
 *   DAN item menu/navigasi/header (HOME, PRODUCT, CONTACT, CART, LOGIN, dsb).
 * - Dibuang: teks biasa (heading), wadah besar (>80% layar), gambar dekoratif.
 */
export function isInteractiveHotspot(box: {
  component_type?: string
  type?: string
  label?: string
  x?: number
  y?: number
  w?: number
  h?: number
  box?: { x?: number; y?: number; w?: number; h?: number }
  props?: { box?: { x?: number; y?: number; w?: number; h?: number } }
}): boolean {
  if (!box) return false
  const t = (box.component_type || box.type || '').trim().toLowerCase()
  const lbl = (box.label || '').trim()

  const b = box.box || box.props?.box || box
  const w = Number(b.w ?? 0)
  const h = Number(b.h ?? 0)

  // Cek apakah koordinat dalam persen (<= 100) atau piksel (> 100)
  const isPct = w <= 100 && h <= 100
  if (isPct) {
    // Mode persen: buang jika >80% lebar dan tinggi, atau >64% luas total layar
    if ((w >= 80 && h >= 80) || (w * h >= 6400)) {
      return false
    }
  } else {
    // Mode piksel (asumsi viewport 1440x900): buang wadah besar >80%
    if ((w >= 1152 && h >= 720) || (w * h >= 1440 * 900 * 0.64)) {
      return false
    }
  }

  // Komponen interaktif standar
  if (['button', 'link', 'input', 'field', 'dropdown', 'select', 'textarea'].includes(t)) {
    return true
  }

  // Menu navigasi & header links
  if (['header-item', 'nav-item'].includes(t)) {
    const area = isPct ? (w * h) : (w * h) / (14.4 * 9.0)
    if (!lbl && area > 20) return false
    return true
  }

  if (t === 'card' || t === 'logo') {
    return true
  }

  return false
}

/**
 * Buat hash id stabil untuk elemen AI berdasarkan tipe, label, dan perkiraan posisi.
 */
export function generateStableId(box: {
  component_type?: string
  label?: string
  x: number
  y: number
  w: number
  h: number
}): string {
  const normType = (box.component_type || 'button').toLowerCase().trim()
  const normLabel = (box.label || '').toLowerCase().trim().slice(0, 30)
  const rx = Math.round(box.x)
  const ry = Math.round(box.y)
  const rw = Math.round(box.w)
  const rh = Math.round(box.h)

  const str = `${normType}_${normLabel}_${rx}_${ry}_${rw}_${rh}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return `ai_${Math.abs(hash).toString(36)}`
}

/**
 * Load state untuk screen tertentu dari localStorage (dengan backend sebagai sumber kebenaran).
 */
export function loadScreenHotspots(
  screenId: number | string,
  backendLayout?: { tombstones?: string[]; overrides?: Record<string, any> },
): ScreenHotspotState {
  const empty: ScreenHotspotState = {
    detected: [],
    overrides: {},
    deleted: [],
    manual: [],
  }
  if (!screenId) return empty

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${screenId}`)
    let state: ScreenHotspotState = empty
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ScreenHotspotState>
      state = {
        detected: Array.isArray(parsed.detected) ? parsed.detected : [],
        overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
        deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
        manual: Array.isArray(parsed.manual) ? parsed.manual : [],
      }
    }

    // Backend adalah sumber kebenaran utama jika layout disediakan
    if (backendLayout) {
      if (Array.isArray(backendLayout.tombstones)) {
        state.deleted = backendLayout.tombstones
      }
      if (backendLayout.overrides && typeof backendLayout.overrides === 'object') {
        state.overrides = backendLayout.overrides
      }
      localStorage.setItem(`${STORAGE_PREFIX}${screenId}`, JSON.stringify(state))
    }

    return state
  } catch (err) {
    console.error('Failed to load screen hotspots:', err)
  }

  return empty
}

/**
 * Simpan state ke localStorage dan sinkronkan ke backend (Single Source of Truth).
 */
export function saveScreenHotspots(
  screenId: number | string,
  state: ScreenHotspotState,
  syncBackend = true,
): void {
  if (!screenId) return
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${screenId}`, JSON.stringify(state))
  } catch (err) {
    console.error('Failed to save screen hotspots:', err)
  }

  if (syncBackend && typeof window !== 'undefined') {
    // Beri tahu komponen UI lain (misal SimulationBuilder) secara reaktif tanpa reload
    window.dispatchEvent(
      new CustomEvent('nigmasim:hotspots-updated', { detail: { screenId: Number(screenId) } }),
    )

    // Sinkronkan ke backend secara asinkron
    void reconstructionApi
      .updateHotspotState(Number(screenId), {
        deleted: state.deleted,
        overrides: state.overrides,
      })
      .catch((err) => {
        console.warn('Backend hotspot state sync notice:', err)
      })
  }
}

/**
 * Hitung daftar kotak final dari state:
 * final = (detected - deleted) + overrides + manual
 */
export function computeFinalBoxes(state: ScreenHotspotState): HotspotItem[] {
  const activeDetected: HotspotItem[] = []
  for (const item of state.detected) {
    const key = item.stableId || item.id
    if (isTombstoned(key, state.deleted) || isTombstoned(item.id, state.deleted)) {
      continue // Dihapus pengguna (tombstone)
    }

    const override = state.overrides[key] || state.overrides[item.id]
    if (override) {
      activeDetected.push({
        ...item,
        ...override,
        isOverridden: true,
      })
    } else {
      activeDetected.push({
        ...item,
        isOverridden: false,
      })
    }
  }

  return [...activeDetected, ...state.manual]
}

/**
 * Helper untuk menghitung IoU antara dua kotak (persen)
 */
export function calculateIoU(
  b1: { x: number; y: number; w: number; h: number },
  b2: { x: number; y: number; w: number; h: number },
): number {
  const x1 = Math.max(b1.x, b2.x)
  const y1 = Math.max(b1.y, b2.y)
  const x2 = Math.min(b1.x + b1.w, b2.x + b2.w)
  const y2 = Math.min(b1.y + b1.h, b2.y + b2.h)
  const interW = Math.max(0, x2 - x1)
  const interH = Math.max(0, y2 - y1)
  const inter = interW * interH
  const area1 = b1.w * b1.h
  const area2 = b2.w * b2.h
  const union = area1 + area2 - inter
  return union > 0 ? inter / union : 0
}

/**
 * Deduplikasi kotak yang tumpang-tindih (IoU > 0.7).
 */
export function deduplicateAiBoxes(boxes: HotspotItem[]): HotspotItem[] {
  const result: HotspotItem[] = []
  for (const box of boxes) {
    let duplicate = false
    for (let i = 0; i < result.length; i++) {
      const existing = result[i]
      if (calculateIoU(box, existing) > 0.7) {
        duplicate = true
        // Pertahankan yang memiliki label lebih deskriptif
        if ((box.label || '').length > (existing.label || '').length) {
          result[i] = box
        }
        break
      }
    }
    if (!duplicate) {
      result.push(box)
    }
  }
  return result
}

/**
 * Satu selector bersama untuk mendapatkan hotspot final.
 * Dipakai oleh Draf struktur, Mode Fokus, dan Simulation Builder.
 */
export function getFinalHotspots(
  screenId: number | string,
  filterInteractive = true,
): HotspotItem[] {
  const state = loadScreenHotspots(screenId)
  const allBoxes = computeFinalBoxes(state)
  const filtered = filterInteractive ? allBoxes.filter(isInteractiveHotspot) : allBoxes
  return deduplicateAiBoxes(filtered)
}