import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { cn } from './ui'
import { AIReconstructionPreview } from './AIReconstructionPreview'
import type { Reconstruction, ReconstructionComponent } from '../lib/reconstruction'

/*
 * Editor hotspot untuk screenshot "Tampilan asli".
 *
 * Semua koordinat kotak disimpan dalam PERSEN (0-100) terhadap ukuran gambar
 * asli, bukan piksel layar. Container gambar + lapisan kotak memakai satu
 * transform (translate + scale) sehingga kotak selalu menempel pada gambar.
 */

export type HotspotLayer = 'manual' | 'auto'

export type ElementType = 'button' | 'dropdown' | 'input_data'

export interface HotspotBox {
  id: string
  x: number // 0-100 (%)
  y: number // 0-100 (%)
  w: number // 0-100 (%)
  h: number // 0-100 (%)
  label: string
  action: string
  component_type: string
  layer: HotspotLayer
  source?: string
  element_type?: ElementType // Tipe elemen: button (default), dropdown, input_data
  config_json?: string // JSON string untuk konfigurasi dropdown/input_data
}

type Tool = 'select' | 'draw'

const MIN_ZOOM = 0.1 // 10%
const MAX_ZOOM = 10 // 1000%
const HANDLE_SCREEN = 10 // px di layar, konstan di semua zoom
const STROKE_SCREEN = 2
const MIN_BOX_PX = 8 // minimal 8x8 piksel gambar asli
const PAN_MARGIN = 80 // Margin lebih besar agar tepi gambar terlihat dan bisa digulir
const HISTORY_LIMIT = 60

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const round2 = (value: number) => Math.round(value * 100) / 100

export const sanitizeCoord = (val: unknown, max = 100, imgDim?: number): number => {
  let num = typeof val === 'number' ? val : Number(String(val).replace(',', '.'))
  if (!Number.isFinite(num)) return 0
  if (num < 0) num = 0
  // Jika nilai berupa piksel mentah (> 100) dan dimensi gambar diketahui, konversi ke persen
  if (num > 100) {
    if (imgDim && imgDim > 0) {
      num = (num / imgDim) * 100
    } else {
      // Fallback deteksi jika angka runaway tanpa desimal
      while (num > 100) {
        num /= 10
      }
    }
  }
  return round2(clamp(num, 0, max))
}

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `hs-${Date.now()}-${Math.random().toString(16).slice(2)}`

export const normalizeBox = (box: HotspotBox): HotspotBox => {
  const next = { ...box }
  let x = sanitizeCoord(next.x, 100)
  let y = sanitizeCoord(next.y, 100)
  let w = sanitizeCoord(next.w, 100)
  let h = sanitizeCoord(next.h, 100)

  if (w < 0.2) w = 0.5
  if (h < 0.2) h = 0.5
  if (x + w > 100) {
    x = round2(Math.max(0, 100 - w))
    w = round2(clamp(w, 0.2, 100 - x))
  }
  if (y + h > 100) {
    y = round2(Math.max(0, 100 - h))
    h = round2(clamp(h, 0.2, 100 - y))
  }

  next.x = x
  next.y = y
  next.w = w
  next.h = h
  if (!next.element_type) next.element_type = 'button'
  return next
}

/* ---------- Dropdown options helpers ---------- */
type DropdownOptionRow = { id: string; label: string; value: string; autoValue: boolean }

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)
}

function parseDropdownConfig(json: string): DropdownOptionRow[] {
  try {
    const parsed = JSON.parse(json || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map((opt, i) => {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `opt-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`
      if (typeof opt === 'string') {
        return { id, label: opt, value: slugify(opt), autoValue: true }
      }
      if (typeof opt === 'object' && opt !== null) {
        const label = typeof opt.label === 'string' ? opt.label : ''
        const value = typeof opt.value === 'string' ? opt.value : ''
        return { id, label, value: value || slugify(label), autoValue: !value }
      }
      return { id, label: '', value: '', autoValue: true }
    })
  } catch {
    return []
  }
}

function rowsToConfigJson(rows: DropdownOptionRow[]): string {
  const valid = rows
    .filter((r) => r.label.trim())
    .map((r) => ({ label: r.label.trim(), value: (r.autoValue ? slugify(r.label) : r.value.trim()) || slugify(r.label) }))
  return JSON.stringify(valid, null, 2)
}

function duplicateLabels(rows: DropdownOptionRow[]): Set<string> {
  const counts = new Map<string, number>()
  rows.forEach((r) => {
    const l = r.label.trim().toLowerCase()
    if (l) counts.set(l, (counts.get(l) || 0) + 1)
  })
  return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([l]) => l))
}

/* ---------- Dropdown visual editor component ---------- */
interface DropdownVisualEditorProps {
  boxId: string
  configJson: string
  onChange: (newJson: string) => void
  onCommitHistory: () => void
  showAdvanced: boolean
  onToggleAdvanced: () => void
  setToast: (msg: string) => void
}

function DropdownVisualEditor({
  boxId,
  configJson,
  onChange,
  onCommitHistory,
  showAdvanced,
  onToggleAdvanced,
  setToast,
}: DropdownVisualEditorProps) {
  // Local rows including any empty drafts
  const [rows, setRows] = useState<DropdownOptionRow[]>(() => {
    const parsed = parseDropdownConfig(configJson)
    return parsed.length > 0
      ? parsed
      : [
          { id: `opt-${Date.now()}-1`, label: '', value: '', autoValue: true },
          { id: `opt-${Date.now()}-2`, label: '', value: '', autoValue: true },
          { id: `opt-${Date.now()}-3`, label: '', value: '', autoValue: true },
        ]
  })
  const lastSyncedJsonRef = useRef<string>(configJson)
  const [bulkText, setBulkText] = useState('')

  // Re-sync when boxId changes or configJson changes from outside (e.g. undo/redo)
  useEffect(() => {
    if (configJson !== lastSyncedJsonRef.current) {
      lastSyncedJsonRef.current = configJson
      const parsed = parseDropdownConfig(configJson)
      setRows(
        parsed.length > 0
          ? parsed
          : [
              { id: `opt-${Date.now()}-1`, label: '', value: '', autoValue: true },
              { id: `opt-${Date.now()}-2`, label: '', value: '', autoValue: true },
              { id: `opt-${Date.now()}-3`, label: '', value: '', autoValue: true },
            ],
      )
    }
  }, [boxId, configJson])

  const commitRows = (nextRows: DropdownOptionRow[]) => {
    setRows(nextRows)
    const nextJson = rowsToConfigJson(nextRows)
    lastSyncedJsonRef.current = nextJson
    onChange(nextJson)
  }

  const addRow = (afterIndex?: number) => {
    const newRow: DropdownOptionRow = {
      id: `opt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: '',
      value: '',
      autoValue: true,
    }
    const nextRows =
      afterIndex !== undefined
        ? [...rows.slice(0, afterIndex + 1), newRow, ...rows.slice(afterIndex + 1)]
        : [...rows, newRow]
    commitRows(nextRows)
  }

  const removeRow = (index: number) => {
    const nextRows = rows.filter((_, i) => i !== index)
    commitRows(nextRows)
  }

  const moveRow = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= rows.length) return
    const nextRows = [...rows]
    const [removed] = nextRows.splice(fromIndex, 1)
    nextRows.splice(toIndex, 0, removed)
    commitRows(nextRows)
  }

  const handleLabelChange = (index: number, label: string) => {
    const nextRows = [...rows]
    const row = { ...nextRows[index], label }
    if (row.autoValue) {
      row.value = slugify(label)
    }
    nextRows[index] = row
    commitRows(nextRows)
  }

  const handleValueChange = (index: number, value: string) => {
    const nextRows = [...rows]
    nextRows[index] = { ...nextRows[index], value, autoValue: false }
    commitRows(nextRows)
  }

  const handleAutoValueToggle = (index: number) => {
    const nextRows = [...rows]
    const row = nextRows[index]
    nextRows[index] = {
      ...row,
      autoValue: !row.autoValue,
      value: row.autoValue ? row.value : slugify(row.label),
    }
    commitRows(nextRows)
  }

  const applyBulkText = (text: string) => {
    const lines = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    if (lines.length === 0) return
    const newRows: DropdownOptionRow[] = lines.map((label, i) => ({
      id: `opt-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
      label,
      value: slugify(label),
      autoValue: true,
    }))
    const existingNonEmpty = rows.filter((r) => r.label.trim())
    commitRows([...existingNonEmpty, ...newRows])
    setBulkText('')
    onCommitHistory()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter' && index === rows.length - 1) {
      e.preventDefault()
      addRow()
    }
  }

  const dupes = duplicateLabels(rows)

  return (
    <div className="space-y-1.5 pt-1">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 flex-1 min-w-[150px]">
          Pilihan Dropdown
        </label>
        <button
          type="button"
          onClick={() => addRow()}
          className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white transition"
        >
          + Tambah pilihan
        </button>
        <button
          type="button"
          onClick={onToggleAdvanced}
          className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white transition"
        >
          {showAdvanced ? 'Sembunyikan JSON' : 'Mode lanjutan (JSON)'}
        </button>
      </div>

      {/* Visual Rows */}
      <div className="space-y-1">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="flex items-center gap-1.5 p-1.5 rounded border bg-slate-950/50"
            style={{
              borderColor:
                dupes.has(row.label.trim().toLowerCase()) && row.label.trim()
                  ? 'rgba(251, 113, 133, 0.5)'
                  : 'rgba(255,255,255,0.1)',
            }}
          >
            {/* Drag handle */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(index))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => {
                e.preventDefault()
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10)
                if (!isNaN(fromIdx) && fromIdx !== index) {
                  moveRow(fromIdx, index)
                }
              }}
              draggable
              className="cursor-grab p-1 text-slate-500 hover:text-slate-300 flex-shrink-0"
              title="Seret untuk mengubah urutan"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="5" r="1" />
                <circle cx="15" cy="5" r="1" />
                <circle cx="9" cy="12" r="1" />
                <circle cx="15" cy="12" r="1" />
                <circle cx="9" cy="19" r="1" />
                <circle cx="15" cy="19" r="1" />
              </svg>
            </button>

            {/* Up/Down buttons */}
            <div className="flex flex-col gap-0">
              <button
                type="button"
                onClick={() => moveRow(index, index - 1)}
                disabled={index === 0}
                className="p-0.5 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Naik"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => moveRow(index, index + 1)}
                disabled={index === rows.length - 1}
                className="p-0.5 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Turun"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            {/* Label input + optional Value input in advanced mode */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <input
                type="text"
                value={row.label}
                onChange={(e) => handleLabelChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onBlur={onCommitHistory}
                placeholder="Nama pilihan (contoh: Production)"
                className="w-full rounded border border-white/10 bg-slate-950 px-2 py-1 text-xs text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
              />
              {showAdvanced && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-slate-500 font-mono">val:</span>
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => handleValueChange(index, e.target.value)}
                    placeholder={slugify(row.label) || 'value'}
                    className="flex-1 rounded border border-white/10 bg-slate-900 px-1.5 py-0.5 text-[10px] font-mono text-slate-300 focus:border-brand-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleAutoValueToggle(index)}
                    title={row.autoValue ? 'Otomatis dari label' : 'Manual'}
                    className={cn(
                      'px-1 py-0.5 text-[9px] rounded border transition',
                      row.autoValue
                        ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                        : 'border-slate-600 text-slate-400',
                    )}
                  >
                    {row.autoValue ? 'Auto' : 'Custom'}
                  </button>
                </div>
              )}
            </div>

            {/* Delete button */}
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded transition flex-shrink-0"
              title="Hapus pilihan"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="text-center py-4 text-slate-500 text-xs">
            Belum ada pilihan. Klik "+ Tambah pilihan" untuk memulai.
          </div>
        )}
      </div>

      {/* Paste bulk */}
      <div className="pt-1">
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          Tempel banyak sekaligus (satu per baris atau dipisah koma)
        </label>
        <div className="flex flex-col gap-1">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            onPaste={(e) => {
              e.preventDefault()
              const pasted = e.clipboardData.getData('text')
              applyBulkText(pasted)
            }}
            rows={3}
            placeholder="Production&#10;Staging&#10;Development&#10;Testing&#10;atau: Production, Staging, Development, Testing"
            className="w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
          />
          {bulkText.trim() && (
            <button
              type="button"
              onClick={() => applyBulkText(bulkText)}
              className="self-end rounded border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] text-brand-300 hover:bg-brand-500/20"
            >
              Terapkan teks tempel
            </button>
          )}
        </div>
      </div>

      {/* Live Preview */}
      <div className="pt-1">
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          Pratinjau Dropdown
        </label>
        <div className="rounded border border-white/10 bg-slate-950 p-2">
          <select
            className="w-full rounded bg-slate-900 border border-white/10 px-2 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
            disabled
          >
            <option value="" disabled selected>
              -- Pilih --
            </option>
            {rows
              .filter((r) => r.label.trim())
              .map((r) => (
                <option key={r.id} value={r.autoValue ? slugify(r.label) : r.value}>
                  {r.label.trim()}
                </option>
              ))}
            {rows.filter((r) => !r.label.trim()).length > 0 && (
              <option disabled>— opsi kosong (akan disembunyikan) —</option>
            )}
          </select>
        </div>
      </div>

      {/* Advanced JSON Mode */}
      {showAdvanced && (
        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[10px] uppercase tracking-wider text-slate-500">
              JSON Lanjutan (Value manual & urutan presisi)
            </label>
            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(configJson || '[]')
                  let normalized = parsed
                  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
                    normalized = parsed.map((item: string) => ({ label: item, value: item }))
                  }
                  const formatted = JSON.stringify(normalized, null, 2)
                  onChange(formatted)
                  setToast('JSON berhasil diformat & dinormalisasi')
                } catch (err: any) {
                  setToast(`Format JSON gagal: ${err.message}`)
                }
              }}
              className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-300 hover:bg-white/10"
            >
              Format JSON
            </button>
          </div>
          <textarea
            value={configJson || ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommitHistory}
            rows={5}
            placeholder='[\n  { "label": "Production", "value": "prod" },\n  { "label": "Staging", "value": "stg" }\n]'
            className={cn(
              'w-full rounded border bg-slate-950 p-2 font-mono text-[11px] leading-relaxed text-white focus:outline-none',
              (() => {
                try {
                  if (!configJson) return 'border-white/15 focus:border-brand-500'
                  const p = JSON.parse(configJson)
                  if (!Array.isArray(p)) return 'border-rose-500 focus:border-rose-500'
                  return 'border-white/15 focus:border-brand-500'
                } catch {
                  return 'border-rose-500 focus:border-rose-500'
                }
              })(),
            )}
          />
          {(() => {
            try {
              if (!configJson) return null
              const p = JSON.parse(configJson)
              if (!Array.isArray(p)) {
                return (
                  <p className="text-[10px] text-rose-400">
                    Error: Opsi dropdown harus berupa JSON array [ ... ]
                  </p>
                )
              }
              return (
                <p className="text-[10px] text-emerald-400">
                  ✓ {p.length} opsi terdeteksi valid
                </p>
              )
            } catch (e: any) {
              return (
                <p className="text-[10px] text-rose-400 leading-tight">
                  JSON Error: {e.message}
                </p>
              )
            }
          })()}
        </div>
      )}
    </div>
  )
}

type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const RESIZE_DIRS: ResizeDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const RESIZE_CURSOR: Record<ResizeDir, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

type DragState =
  | {
      kind: 'pan'
      pointerId: number
      startX: number
      startY: number
      origin: { x: number; y: number }
      moved: boolean
      button: number
      boxId: string | null
    }
  | {
      kind: 'draw'
      pointerId: number
      start: { x: number; y: number }
      current: { x: number; y: number }
    }
  | {
      kind: 'move'
      pointerId: number
      startX: number
      startY: number
      rect: DOMRect
      base: HotspotBox[]
      ids: string[]
      moved: boolean
    }
  | {
      kind: 'resize'
      pointerId: number
      dir: ResizeDir
      startX: number
      startY: number
      rect: DOMRect
      base: HotspotBox[]
      origin: HotspotBox
      moved: boolean
    }

interface HistoryEntry {
  boxes: HotspotBox[]
  selected: string[]
}

export interface HotspotEditorProps {
  screenId?: number
  screenshot: string
  boxes: HotspotBox[]
  saving: boolean
  draft?: Reconstruction | null
  onChange: (boxes: HotspotBox[]) => void
  onDeleteBoxes?: (ids: string[]) => void | Promise<void>
  onClose: () => void
  onSaveManual?: () => Promise<void> | void
}

function SidebarNumField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (val: number) => void
}) {
  const [text, setText] = useState(String(round2(sanitizeCoord(value, 100))))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setText(String(round2(sanitizeCoord(value, 100))))
  }, [value])

  const commit = (valStr: string) => {
    const sanitized = sanitizeCoord(valStr, 100)
    onCommit(sanitized)
    setText(String(round2(sanitized)))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!/^[\d.,]*$/.test(val)) return
    setText(val)
    const sanitized = sanitizeCoord(val, 100)
    onCommit(sanitized)
  }

  return (
    <label className="block text-[10px] uppercase text-slate-500">
      <span className="font-semibold text-slate-400">{label}</span>
      <div className="relative mt-1 flex items-center">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={handleChange}
          onFocus={(e) => {
            focusedRef.current = true
            e.target.select()
          }}
          onBlur={() => {
            focusedRef.current = false
            commit(text)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              const step = e.shiftKey ? 1 : 0.1
              const next = clamp(round2(value + step), 0, 100)
              onCommit(next)
              setText(String(round2(next)))
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              const step = e.shiftKey ? 1 : 0.1
              const next = clamp(round2(value - step), 0, 100)
              onCommit(next)
              setText(String(round2(next)))
            }
          }}
          className="h-7 w-full rounded border border-white/15 bg-slate-950 px-1.5 font-mono text-right text-[11px] text-white focus:border-brand-500 focus:outline-none"
        />
        <span className="pointer-events-none absolute right-1 text-[9px] text-slate-500">%</span>
      </div>
    </label>
  )
}

export function HotspotEditor({
  screenId,
  screenshot,
  boxes: initialBoxes,
  saving,
  draft,
  onChange,
  onDeleteBoxes,
  onClose,
  onSaveManual,
}: HotspotEditorProps) {
  const [boxes, setBoxes] = useState<HotspotBox[]>(() => initialBoxes.map(normalizeBox))
  const boxesRef = useRef(boxes)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedRef = useRef<string[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [viewMode, setViewMode] = useState<'canvas' | 'split' | 'preview'>('canvas')
  const [testMode, setTestMode] = useState(false)
  const [showManual, setShowManual] = useState(true)
  const [showAuto, setShowAuto] = useState(true)
  const [hideTiny, setHideTiny] = useState(false)
  const [showLabels, setShowLabels] = useState(true) // Toggle untuk tampilkan label penuh
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null) // Box yang sedang di-hover
  const [scale, setScaleState] = useState(1)
  const [pan, setPanState] = useState({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [tempBox, setTempBox] = useState<HotspotBox | null>(null)
  const tempBoxRef = useRef<HotspotBox | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; boxId: string } | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [confirmDeleteAllAi, setConfirmDeleteAllAi] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [dragKind, setDragKind] = useState<DragState['kind'] | null>(null)

  // Sinkronisasi state internal saat screenId atau initialBoxes berubah
  const prevScreenIdRef = useRef(screenId)
  useEffect(() => {
    if (screenId !== prevScreenIdRef.current) {
      prevScreenIdRef.current = screenId
      const normalized = initialBoxes.map(normalizeBox)
      setBoxes(normalized)
      boxesRef.current = normalized
      setSelectedIds([])
      selectedRef.current = []
      historyRef.current = [{ boxes: normalized, selected: [] }]
      historyIndexRef.current = 0
      setHistoryTick((t) => t + 1)
    }
  }, [screenId, initialBoxes])

  useEffect(() => {
    const normalized = initialBoxes.map(normalizeBox)
    setBoxes(normalized)
    boxesRef.current = normalized
  }, [initialBoxes])

  // Draf live yang sinkron dengan perubahan kotak di kanvas secara real-time
  const liveDraft = useMemo((): Reconstruction | null => {
    if (!draft && boxes.length === 0) return null

    const activeCompIds = new Set<number>()
    const boxMap = new Map<number, HotspotBox>()
    const manualBoxes: HotspotBox[] = []

    for (const b of boxes) {
      if (b.id.startsWith('comp-')) {
        const compId = Number(b.id.replace('comp-', ''))
        if (Number.isFinite(compId)) {
          activeCompIds.add(compId)
          boxMap.set(compId, b)
          continue
        }
      }
      manualBoxes.push(b)
    }

    const baseComponents = (draft?.components ?? []).filter((c) => activeCompIds.has(c.id))

    const updatedComponents: ReconstructionComponent[] = baseComponents.map((c) => {
      const b = boxMap.get(c.id)
      if (!b) return c
      const props = c.props || {}
      const dom = (props.dom as Record<string, any>) || {}
      return {
        ...c,
        label: b.label || c.label,
        component_type: b.component_type || c.component_type,
        element_type: b.element_type || c.element_type,
        config_json: b.config_json !== undefined ? b.config_json : c.config_json,
        source: b.source || c.source,
        props: {
          ...props,
          box: { x: b.x, y: b.y, w: b.w, h: b.h },
          action: b.action,
          dom: {
            ...dom,
            text: b.label || dom.text,
          },
        },
      }
    })

    manualBoxes.forEach((b, idx) => {
      updatedComponents.push({
        id: 900000 + idx,
        region:
          b.component_type === 'nav-item'
            ? 'sidebar'
            : b.component_type === 'header-item'
              ? 'header'
              : 'main',
        component_type: b.component_type || 'button',
        label: b.label,
        props: {
          box: { x: b.x, y: b.y, w: b.w, h: b.h },
          action: b.action,
          dom: { text: b.label },
        },
        order_index: 900 + idx,
        source: 'manual',
        element_type: b.element_type || 'button',
        config_json: b.config_json || null,
        notes: null,
      })
    })

    const hasNav = boxes.some((b) => b.component_type === 'nav-item' || b.id.includes('nav'))
    const hasHeaderItem = boxes.some((b) => b.component_type === 'header-item' || b.id.includes('header'))

    if (!draft) {
      return {
        id: 0,
        screen_id: screenId || 0,
        project_id: 0,
        status: 'draft',
        layout: {
          theme: null,
          regions: {
            sidebar: hasNav ? { x: 0, y: 0, w: 240, h: 900 } : null,
            header: hasHeaderItem ? { x: 0, y: 0, w: 1440, h: 60 } : null,
            main: { x: 0, y: 0, w: 1440, h: 900 },
          },
          has_sidebar: hasNav,
          has_header: hasHeaderItem,
          ai_status: 'not_configured',
          ai_source: 'rule-engine',
        },
        code_text: null,
        generated_by: 'manual',
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        components: updatedComponents,
        assumptions: [],
      }
    }

    return {
      ...draft,
      components: updatedComponents,
      layout: {
        ...draft.layout,
        has_sidebar: draft.layout?.has_sidebar || hasNav,
        has_header: draft.layout?.has_header || hasHeaderItem,
      },
    }
  }, [draft, boxes, screenId])
  const [listTab, setListTab] = useState<HotspotLayer>('manual')
  const [showAdvancedJson, setShowAdvancedJson] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const stageClickRef = useRef<{ x: number; y: number } | null>(null)
  const spaceRef = useRef(false)
  const initializedRef = useRef(false)
  const fitRef = useRef<() => void>(() => {})

  const storageKey = useMemo(
    () => (screenId ? `nigmasim_hotspots_${screenId}` : 'nigmasim_hotspots_temp'),
    [screenId],
  )

  const historyRef = useRef<HistoryEntry[]>([{ boxes: initialBoxes.map(normalizeBox), selected: [] }])
  const historyIndexRef = useRef(0)
  const [historyTick, setHistoryTick] = useState(0)

  const setScale = useCallback((value: number) => {
    scaleRef.current = value
    setScaleState(value)
  }, [])

  const setPan = useCallback((value: { x: number; y: number }) => {
    panRef.current = value
    setPanState(value)
  }, [])

  const setSelected = useCallback((ids: string[]) => {
    selectedRef.current = ids
    setSelectedIds(ids)
  }, [])

  const setLocal = useCallback((next: HotspotBox[]) => {
    boxesRef.current = next
    setBoxes(next)
  }, [])

  // Muat ulang dari localStorage saat viewer pertama kali dibuka
  const loadedStorageRef = useRef<string | null>(null)
  useEffect(() => {
    if (loadedStorageRef.current === storageKey) return
    loadedStorageRef.current = storageKey
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const loaded: HotspotBox[] = parsed.map((item: Record<string, unknown>) =>
          normalizeBox({
            id: item.id ? String(item.id) : newId(),
            x: Number(item.x) || 0,
            y: Number(item.y) || 0,
            w: Number(item.w) || 0,
            h: Number(item.h) || 0,
            label: typeof item.label === 'string' ? item.label : '',
            action: typeof item.action === 'string' ? item.action : '',
            component_type: typeof item.component_type === 'string' ? item.component_type : 'button',
            layer: item.layer === 'auto' || item.type === 'auto' ? 'auto' : 'manual',
            source: typeof item.source === 'string' ? item.source : undefined,
            element_type: typeof item.element_type === 'string' ? (item.element_type as ElementType) : 'button',
            config_json: typeof item.config_json === 'string' ? item.config_json : undefined,
          }),
        )
        setLocal(loaded)
        onChange(loaded)
      }
    } catch {
      // Abaikan bila format parsing gagal
    }
  }, [storageKey, onChange, setLocal])

  const saveToStorage = useCallback(
    (next: HotspotBox[]) => {
      try {
        const payload = next.map((b) => ({
          id: b.id,
          type: b.layer,
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          label: b.label,
          action: b.action,
          component_type: b.component_type,
          element_type: b.element_type,
          config_json: b.config_json,
        }))
        localStorage.setItem(storageKey, JSON.stringify(payload))
      } catch {
        // Abaikan jika quota localStorage habis
      }
    },
    [storageKey],
  )

  // Debounced auto-save (500 ms) ke localStorage sebagai cadangan
  const saveTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveToStorage(boxesRef.current)
    }, 500)
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [boxes, saveToStorage])

  const pushHistory = useCallback((next: HotspotBox[], selected: string[]) => {
    const trimmed = historyRef.current.slice(0, historyIndexRef.current + 1)
    trimmed.push({ boxes: next.map((b) => ({ ...b })), selected })
    historyRef.current = trimmed.length > HISTORY_LIMIT ? trimmed.slice(trimmed.length - HISTORY_LIMIT) : trimmed
    historyIndexRef.current = historyRef.current.length - 1
    setHistoryTick((t) => t + 1)
  }, [])

  /** Simpan perubahan + kirim ke parent (dipakai untuk aksi yang sudah final). */
  const commit = useCallback(
    (next: HotspotBox[], selected?: string[], withHistory = true) => {
      setLocal(next)
      if (selected) setSelected(selected)
      if (withHistory) pushHistory(next, selected ?? selectedRef.current)
      saveToStorage(next)
      onChange(next)
    },
    [onChange, pushHistory, saveToStorage, setLocal, setSelected],
  )

  const canUndo = historyIndexRef.current > 0
  const canRedo = historyIndexRef.current < historyRef.current.length - 1
  void historyTick

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    const entry = historyRef.current[historyIndexRef.current]
    const copy = entry.boxes.map((b) => ({ ...b }))
    setLocal(copy)
    setSelected(entry.selected)
    onChange(copy)
    setHistoryTick((t) => t + 1)
  }, [onChange, setLocal, setSelected])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    const entry = historyRef.current[historyIndexRef.current]
    const copy = entry.boxes.map((b) => ({ ...b }))
    setLocal(copy)
    setSelected(entry.selected)
    onChange(copy)
    setHistoryTick((t) => t + 1)
  }, [onChange, setLocal, setSelected])

  /* ---------- ukuran stage ---------- */
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setStage({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  /* ---------- zoom & pan ---------- */
  const clampPan = useCallback(
    (value: { x: number; y: number }, nextScale: number) => {
      const el = stageRef.current
      if (!el || !natural) return value
      const sw = natural.w * nextScale
      const sh = natural.h * nextScale
      return {
        x: clamp(value.x, PAN_MARGIN - sw, el.clientWidth - PAN_MARGIN),
        y: clamp(value.y, PAN_MARGIN - sh, el.clientHeight - PAN_MARGIN),
      }
    },
    [natural],
  )

  const fit = useCallback(() => {
    const el = stageRef.current
    if (!el || !natural) return
    const w = el.clientWidth
    const h = el.clientHeight
    if (!w || !h) return
    // Margin yang cukup (64px horizontal, 48px vertikal) agar gambar dan kotak di tepi kanan pas berada di area kanvas di luar panel properti
    const paddingX = 64
    const paddingY = 48
    const next = clamp(Math.min((w - paddingX) / natural.w, (h - paddingY) / natural.h), MIN_ZOOM, MAX_ZOOM)
    setScale(next)
    setPan({ x: Math.round((w - natural.w * next) / 2), y: Math.round((h - natural.h * next) / 2) })
  }, [natural, setPan, setScale])
  fitRef.current = fit

  const reset100 = useCallback(() => {
    const el = stageRef.current
    if (!el || !natural) return
    setScale(1)
    setPan({ x: Math.round((el.clientWidth - natural.w) / 2), y: Math.round((el.clientHeight - natural.h) / 2) })
  }, [natural, setPan, setScale])

  const zoomAt = useCallback(
    (target: number, anchor?: { x: number; y: number }) => {
      const el = stageRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const next = clamp(target, MIN_ZOOM, MAX_ZOOM)
      const current = scaleRef.current
      if (Math.abs(next - current) < 0.0001) return
      const ax = (anchor?.x ?? rect.left + rect.width / 2) - rect.left
      const ay = (anchor?.y ?? rect.top + rect.height / 2) - rect.top
      const ratio = next / current
      const p = panRef.current
      setScale(next)
      setPan(clampPan({ x: ax - (ax - p.x) * ratio, y: ay - (ay - p.y) * ratio }, next))
    },
    [clampPan, setPan, setScale],
  )

  const zoomStep = useCallback(
    (direction: 1 | -1) => {
      const current = scaleRef.current
      const step = current >= 2 ? 0.25 : 0.1
      zoomAt(current + direction * step)
    },
    [zoomAt],
  )

  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (initializedRef.current) return
    const img = event.currentTarget
    const size = { w: img.naturalWidth, h: img.naturalHeight }
    if (!size.w || !size.h) return
    setNatural(size)
    const el = stageRef.current
    if (el && el.clientWidth) {
      const paddingX = 64
      const paddingY = 48
      const next = clamp(
        Math.min((el.clientWidth - paddingX) / size.w, (el.clientHeight - paddingY) / size.h),
        MIN_ZOOM,
        MAX_ZOOM,
      )
      setScale(next)
      setPan({ x: Math.round((el.clientWidth - size.w * next) / 2), y: Math.round((el.clientHeight - size.h * next) / 2) })
      initializedRef.current = true
    }
  }

  // Ukur gambar lebih awal supaya stage bisa dirender walau <img> belum tampil.
  useEffect(() => {
    const img = new Image()
    img.src = screenshot
    const measure = () => {
      if (!img.naturalWidth || !img.naturalHeight) return
      setNatural((prev) => prev ?? { w: img.naturalWidth, h: img.naturalHeight })
    }
    if (img.complete) measure()
    img.addEventListener('load', measure)
    return () => img.removeEventListener('load', measure)
  }, [screenshot])

  useEffect(() => {
    if (!natural || initializedRef.current || !stage.w) return
    initializedRef.current = true
    fitRef.current()
  }, [natural, stage.w])

  /* ---------- wheel: scroll = zoom at cursor ---------- */
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      // Scroll = zoom at cursor (like before)
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.002)
      zoomAt(scaleRef.current * factor, { x: event.clientX, y: event.clientY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, clampPan, setPan])

  /* ---------- Right-click / Space+drag = pan ---------- */
  // Handled in handleStagePointerDown and keyboard handlers

  /* ---------- toast ---------- */
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  /* ---------- helper koordinat ---------- */
  const pctFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 }
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    }
  }, [])

  const minSizePct = useMemo(() => {
    if (!natural || !natural.w || !natural.h) return { w: 0.5, h: 0.5 }
    return {
      w: (MIN_BOX_PX / natural.w) * 100,
      h: (MIN_BOX_PX / natural.h) * 100,
    }
  }, [natural])

  const hitTest = useCallback(
    (clientX: number, clientY: number): string | null => {
      const { x, y } = pctFromClient(clientX, clientY)
      const lists: ManualBoxLike[][] = []
      if (showManual) lists.push(boxesRef.current.filter((b) => b.layer === 'manual'))
      if (showAuto) lists.push(boxesRef.current.filter((b) => b.layer === 'auto'))
      for (const list of lists) {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const b = list[i]
          if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id
        }
      }
      return null
    },
    [pctFromClient, showAuto, showManual],
  )

  /* ---------- drag ---------- */
  const startPan = (event: React.PointerEvent, button: number) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // ignore
    }
    dragRef.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...panRef.current },
      moved: false,
      button,
      boxId: button === 2 ? hitTest(event.clientX, event.clientY) : null,
    }
    setDragKind('pan')
  }

  const handleStagePointerDown = (event: React.PointerEvent) => {
    if (event.button === 2 || event.button === 1) {
      event.preventDefault()
      startPan(event, event.button)
      return
    }
    if (event.button !== 0) return
    if (spaceRef.current) {
      event.preventDefault()
      startPan(event, 0)
      return
    }
    if (testMode) return

    if (tool === 'draw') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // ignore
      }
      const p = pctFromClient(event.clientX, event.clientY)
      dragRef.current = { kind: 'draw', pointerId: event.pointerId, start: p, current: p }
      const initial: HotspotBox = { id: '__temp__', x: p.x, y: p.y, w: 0, h: 0, label: '', action: '', component_type: 'button', layer: 'manual' }
      tempBoxRef.current = initial
      setTempBox(initial)
      setDragKind('draw')
      setSelected([])
      return
    }

    // Klik di latar gelap di luar gambar -> keluar mode fokus
    if (tool === 'select' && event.target === stageRef.current) {
      stageClickRef.current = { x: event.clientX, y: event.clientY }
    }

    setSelected([])
    setMenu(null)
  }

  const startMove = (event: React.PointerEvent, box: HotspotBox) => {
    if (event.button !== 0 || testMode) return
    event.stopPropagation()

    // Blur input aktif agar shortcut tombol Delete/keyboard langsung berfungsi
    if (document.activeElement instanceof HTMLElement && document.activeElement !== event.currentTarget) {
      document.activeElement.blur()
    }
    if (tool !== 'select') setTool('select')

    let ids = selectedRef.current
    if (event.ctrlKey || event.metaKey) {
      ids = ids.includes(box.id) ? ids.filter((id) => id !== box.id) : [...ids, box.id]
      setSelected(ids)
      return
    }
    if (event.shiftKey) {
      ids = ids.includes(box.id) ? ids : [...ids, box.id]
      setSelected(ids)
      return
    }
    if (!ids.includes(box.id)) {
      ids = [box.id]
      setSelected(ids)
      setListTab(box.layer)
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // ignore
    }

    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect) return

    // Auto box otomatis diubah jadi manual saat pertama kali digeser/diedit
    const baseBoxes = boxesRef.current.map((b) => {
      if (ids.includes(b.id)) {
        return { ...b, layer: 'manual' as HotspotLayer }
      }
      return { ...b }
    })

    dragRef.current = {
      kind: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect,
      base: baseBoxes,
      ids,
      moved: false,
    }
    setDragKind('move')
  }

  const startResize = (event: React.PointerEvent, box: HotspotBox, dir: ResizeDir) => {
    if (event.button !== 0 || testMode) return
    event.stopPropagation()

    if (document.activeElement instanceof HTMLElement && document.activeElement !== event.currentTarget) {
      document.activeElement.blur()
    }
    if (tool !== 'select') setTool('select')

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // ignore
    }

    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect) return
    setSelected([box.id])
    setListTab(box.layer)

    // Auto box otomatis diubah jadi manual saat di-resize
    const targetBox = { ...box, layer: 'manual' as HotspotLayer }
    const baseBoxes = boxesRef.current.map((b) => (b.id === box.id ? targetBox : { ...b }))

    dragRef.current = {
      kind: 'resize',
      pointerId: event.pointerId,
      dir,
      startX: event.clientX,
      startY: event.clientY,
      rect,
      base: baseBoxes,
      origin: targetBox,
      moved: false,
    }
    setDragKind('resize')
  }

  const handlePointerMoveInternal = useCallback(
    (clientX: number, clientY: number, pointerId: number, shiftKey: boolean) => {
      const drag = dragRef.current
      if (!drag) return
      if (pointerId !== drag.pointerId) return

      if (drag.kind === 'pan') {
        const dx = clientX - drag.startX
        const dy = clientY - drag.startY
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true
        setPan(clampPan({ x: drag.origin.x + dx, y: drag.origin.y + dy }, scaleRef.current))
        return
      }

      if (drag.kind === 'draw') {
        const p = pctFromClient(clientX, clientY)
        drag.current = p
        let w = p.x - drag.start.x
        let h = p.y - drag.start.y
        if (shiftKey) {
          const d = Math.max(Math.abs(w), Math.abs(h))
          w = w < 0 ? -d : d
          h = h < 0 ? -d : d
        }
        const x = w < 0 ? p.x : drag.start.x
        const y = h < 0 ? p.y : drag.start.y
        const nextTemp: HotspotBox = normalizeBox({
          id: '__temp__',
          x,
          y,
          w: Math.abs(w),
          h: Math.abs(h),
          label: '',
          action: '',
          component_type: 'button',
          layer: 'manual',
        })
        tempBoxRef.current = nextTemp
        setTempBox(nextTemp)
        return
      }

      const stageEl = imageRef.current
      const rect = stageEl?.getBoundingClientRect()
      const imgW = (natural?.w ?? 1) * scaleRef.current
      const imgH = (natural?.h ?? 1) * scaleRef.current
      const rectW = rect?.width && rect.width > 0 ? rect.width : imgW
      const rectH = rect?.height && rect.height > 0 ? rect.height : imgH
      if (!rectW || !rectH) return

      const dxPct = ((clientX - drag.startX) / rectW) * 100
      const dyPct = ((clientY - drag.startY) / rectH) * 100

      if (drag.kind === 'move') {
        if (Math.abs(dxPct) > 0.05 || Math.abs(dyPct) > 0.05) drag.moved = true
        const ids = new Set(drag.ids)
        setLocal(
          drag.base.map((box) => {
            if (!ids.has(box.id)) return { ...box }
            return normalizeBox({
              ...box,
              layer: 'manual',
              x: clamp(box.x + dxPct, 0, Math.max(0, 100 - box.w)),
              y: clamp(box.y + dyPct, 0, Math.max(0, 100 - box.h)),
            })
          }),
        )
        return
      }

      // resize
      const o = drag.origin
      const minW = minSizePct.w
      const minH = minSizePct.h
      let x = o.x
      let y = o.y
      let w = o.w
      let h = o.h
      if (drag.dir.includes('e')) w = o.w + dxPct
      if (drag.dir.includes('w')) {
        x = o.x + dxPct
        w = o.w - dxPct
      }
      if (drag.dir.includes('s')) h = o.h + dyPct
      if (drag.dir.includes('n')) {
        y = o.y + dyPct
        h = o.h - dyPct
      }

      if (shiftKey && drag.dir.length === 2) {
        const nw = natural?.w || 1000
        const nh = natural?.h || 1000
        const oPixelW = Math.max(1, (o.w / 100) * nw)
        const oPixelH = Math.max(1, (o.h / 100) * nh)
        const origAspect = oPixelW / oPixelH

        const pixelW = (Math.abs(w) / 100) * nw
        const pixelH = (Math.abs(h) / 100) * nh
        const dominant = Math.max(pixelW, pixelH * origAspect)
        const targetW = dominant
        const targetH = dominant / origAspect
        w = (targetW / nw) * 100
        h = (targetH / nh) * 100
        const anchorRight = drag.dir.includes('w')
        const anchorBottom = drag.dir.includes('n')
        x = anchorRight ? o.x + o.w - w : o.x
        y = anchorBottom ? o.y + o.h - h : o.y
      }

      if (w < 0) {
        x += w
        w = Math.abs(w)
      }
      if (h < 0) {
        y += h
        h = Math.abs(h)
      }
      x = clamp(x, 0, 100 - minW)
      y = clamp(y, 0, 100 - minH)
      w = clamp(w, minW, 100 - x)
      h = clamp(h, minH, 100 - y)

      if (Math.abs(dxPct) > 0.02 || Math.abs(dyPct) > 0.02) drag.moved = true
      setLocal(
        drag.base.map((box) =>
          box.id === o.id
            ? normalizeBox({ ...box, layer: 'manual', x, y, w, h })
            : { ...box },
        ),
      )
    },
    [clampPan, minSizePct.h, minSizePct.w, natural?.h, natural?.w, pctFromClient, setLocal, setPan],
  )

  const handleRootPointerMove = (event: React.PointerEvent) => {
    handlePointerMoveInternal(event.clientX, event.clientY, event.pointerId, event.shiftKey)
  }

  const finishInteraction = useCallback(
    (event?: React.PointerEvent | PointerEvent) => {
      const drag = dragRef.current
      if (event && drag && event.pointerId === drag.pointerId) {
        try {
          const target = (event as React.PointerEvent).currentTarget || (event as PointerEvent).target
          if (target && 'releasePointerCapture' in target) {
            (target as HTMLElement).releasePointerCapture(event.pointerId)
          }
        } catch {
          // ignore
        }
      }
      dragRef.current = null
      setDragKind(null)
      if (!drag) return

      if (drag.kind === 'pan') {
        if (!drag.moved && drag.button === 2 && drag.boxId && event) {
          setMenu({ x: event.clientX, y: event.clientY, boxId: drag.boxId })
        }
        return
      }

      if (drag.kind === 'draw') {
        const temp = tempBoxRef.current
        tempBoxRef.current = null
        setTempBox(null)
        if (!temp) return
        const pixelW = (temp.w / 100) * (natural?.w ?? 0)
        const pixelH = (temp.h / 100) * (natural?.h ?? 0)
        if (pixelW < MIN_BOX_PX || pixelH < MIN_BOX_PX) {
          setToast(`Kotak minimal ${MIN_BOX_PX}×${MIN_BOX_PX} piksel — kotak dibatalkan.`)
          return
        }
        const box: HotspotBox = normalizeBox({
          id: newId(),
          x: temp.x,
          y: temp.y,
          w: temp.w,
          h: temp.h,
          label: '',
          action: '',
          component_type: 'button',
          layer: 'manual',
        })
        commit([...boxesRef.current, box], [box.id])
        setListTab('manual')
        setTool('select')
        setToast('Kotak manual dibuat! Isi label dan aksi di panel samping.')
        return
      }

      // Periksa apakah ini klik di latar belakang di luar gambar (untuk keluar mode fokus)
      if (stageClickRef.current && event) {
        const sc = stageClickRef.current
        stageClickRef.current = null
        const dx = Math.abs(event.clientX - sc.x)
        const dy = Math.abs(event.clientY - sc.y)
        if (dx < 4 && dy < 4 && event.target === stageRef.current) {
          onClose()
          return
        }
      }

      if (!drag.moved) return
      commit(boxesRef.current)
    },
    [commit, natural?.h, natural?.w, onClose],
  )

  // Pasang window pointer listener supaya drag tidak pernah putus/macet saat cursor cepat atau DOM re-render
  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return
      handlePointerMoveInternal(e.clientX, e.clientY, e.pointerId, e.shiftKey)
    }

    const onWindowPointerUp = (e: PointerEvent) => {
      if (!dragRef.current) return
      if (dragRef.current.pointerId === e.pointerId) {
        finishInteraction(e)
      }
    }

    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerUp)
    }
  }, [finishInteraction, handlePointerMoveInternal])

  /* ---------- aksi kotak ---------- */
  const findBox = (id: string) => boxesRef.current.find((b) => b.id === id) ?? null

  const updateBox = useCallback(
    (id: string, patch: Partial<HotspotBox>, withHistory = false) => {
      const before = boxesRef.current
      const next = before.map((b) => (b.id === id ? normalizeBox({ ...b, ...patch }) : b))
      setLocal(next)
      if (withHistory) pushHistory(next, selectedRef.current)
      onChange(next)
    },
    [onChange, pushHistory, setLocal],
  )

  const deleteBoxes = useCallback(
    (ids: string[]) => {
      if (!ids.length) return
      if (onDeleteBoxes) {
        void onDeleteBoxes(ids)
      }
      const next = boxesRef.current.filter((b) => !ids.includes(b.id))
      const nextSelected = selectedRef.current.filter((id) => !ids.includes(id))
      commit(next, nextSelected)
      setToast(`${ids.length} kotak dihapus.`)
    },
    [commit, onDeleteBoxes],
  )

  const duplicateBox = useCallback(
    (id: string) => {
      const source = findBox(id)
      if (!source) return
      const copy: HotspotBox = {
        ...source,
        id: newId(),
        layer: 'manual',
        label: source.label ? `${source.label} (salinan)` : 'Hotspot salinan',
        x: round2(clamp(source.x + 1, 0, 100 - source.w)),
        y: round2(clamp(source.y + 1, 0, 100 - source.h)),
      }
      commit([...boxesRef.current, copy], [copy.id])
      setListTab('manual')
      setToast('Kotak disalin ke layer manual.')
    },
    [commit],
  )

  const moveSelection = useCallback(
    (dxPct: number, dyPct: number) => {
      const ids = selectedRef.current
      if (!ids.length) return
      const next = boxesRef.current.map((box) =>
        ids.includes(box.id)
          ? {
              ...box,
              x: round2(clamp(box.x + dxPct, 0, 100 - box.w)),
              y: round2(clamp(box.y + dyPct, 0, 100 - box.h)),
            }
          : { ...box },
      )
      commit(next)
    },
    [commit],
  )

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.code === 'Space') {
        if (!isTyping(event.target)) {
          event.preventDefault()
          spaceRef.current = true
          setSpaceDown(true)
        }
        return
      }
      if (isTyping(event.target)) return

      if (event.key === 'Escape') {
        if (menu) {
          setMenu(null)
          return
        }
        if (confirmDeleteAll) {
          setConfirmDeleteAll(false)
          return
        }
        if (confirmDeleteAllAi) {
          setConfirmDeleteAllAi(false)
          return
        }
        if (dragRef.current?.kind === 'draw' || tempBoxRef.current) {
          dragRef.current = null
          tempBoxRef.current = null
          setTempBox(null)
          setDragKind(null)
          setTool('select')
          setToast('Gambar kotak dibatalkan.')
          return
        }
        if (tool === 'draw') {
          setTool('select')
          setToast('Kembali ke mode pilih.')
          return
        }
        if (selectedRef.current.length > 0) {
          setSelected([])
          return
        }
        onClose()
        return
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase()
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault()
          undo()
          return
        }
        if ((key === 'z' && event.shiftKey) || key === 'y') {
          event.preventDefault()
          redo()
          return
        }
        if (key === 'd') {
          event.preventDefault()
          if (selectedRef.current[0]) duplicateBox(selectedRef.current[0])
          return
        }
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteBoxes(selectedRef.current)
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'v') {
        setTool('select')
        return
      }
      if (key === 'b') {
        setTool('draw')
        return
      }
      if (key === '0') {
        event.preventDefault()
        reset100()
        return
      }
      if (key === 'f') {
        event.preventDefault()
        fit()
        return
      }
      if (key === '+' || key === '=') {
        event.preventDefault()
        zoomStep(1)
        return
      }
      if (key === '-' || key === '_') {
        event.preventDefault()
        zoomStep(-1)
        return
      }

      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        const px = event.shiftKey ? 10 : 1
        const naturalW = natural?.w ?? 1
        const naturalH = natural?.h ?? 1
        const dx = (px / naturalW) * 100
        const dy = (px / naturalH) * 100
        if (event.key === 'ArrowLeft') moveSelection(-dx, 0)
        if (event.key === 'ArrowRight') moveSelection(dx, 0)
        if (event.key === 'ArrowUp') moveSelection(0, -dy)
        if (event.key === 'ArrowDown') moveSelection(0, dy)
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.code === 'Space') {
        spaceRef.current = false
        setSpaceDown(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [confirmDeleteAll, deleteBoxes, duplicateBox, fit, menu, moveSelection, natural, onClose, redo, reset100, undo, zoomStep])

  const deleteUnlabeledBoxes = useCallback(() => {
    const unlabeled = boxesRef.current.filter((b) => !b.label.trim()).map((b) => b.id)
    if (!unlabeled.length) {
      setToast('Tidak ada kotak tanpa label.')
      return
    }
    deleteBoxes(unlabeled)
    setToast(`${unlabeled.length} kotak tanpa label dihapus.`)
  }, [deleteBoxes])

  const deleteAllAiBoxes = useCallback(() => {
    const aiBoxes = boxesRef.current.filter((b) => b.layer === 'auto').map((b) => b.id)
    if (!aiBoxes.length) {
      setToast('Tidak ada kotak AI.')
      setConfirmDeleteAllAi(false)
      return
    }
    deleteBoxes(aiBoxes)
    setConfirmDeleteAllAi(false)
    setToast(`${aiBoxes.length} kotak AI dihapus.`)
  }, [deleteBoxes])

  /* ---------- render helpers ---------- */
  const visibleBoxes = useMemo(
    () =>
      boxes.filter((b) => {
        if (b.layer === 'manual' && !showManual) return false
        if (b.layer === 'auto' && !showAuto) return false
        if (hideTiny && b.w < 1) return false
        return true
      }),
    [boxes, hideTiny, showAuto, showManual],
  )

  const single = selectedIds.length === 1 ? findBox(selectedIds[0]) : null
  const strokeW = (selected: boolean) => (selected ? STROKE_SCREEN * 1.5 : STROKE_SCREEN) / scale
  const fontSize = 11 / scale
  const labelPad = 3 / scale
  const labelOffset = 18 / scale

  const badgeFor = (box: HotspotBox) => {
    const list = box.layer === 'manual' ? boxes.filter((b) => b.layer === 'manual') : boxes.filter((b) => b.layer === 'auto')
    const index = list.findIndex((b) => b.id === box.id)
    return `${box.layer === 'manual' ? 'M' : 'A'}${index + 1}`
  }

  const menuBox = menu ? findBox(menu.boxId) : null

  const exportJson = () => {
    const payload = {
      screen_id: null,
      image: natural ? { width: natural.w, height: natural.h } : null,
      hotspots: boxes.map((b) => ({
        id: b.id,
        type: b.layer,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        label: b.label,
        action: b.action,
        component_type: b.component_type,
        element_type: b.element_type,
        config_json: b.config_json,
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hotspots.json'
    a.click()
    URL.revokeObjectURL(url)
    setToast('Hotspot diexport ke JSON.')
  }

  const importJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        const raw: Partial<HotspotBox>[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.hotspots)
            ? data.hotspots
            : [...(data?.manual ?? []), ...(data?.auto ?? [])]
        if (!raw.length) throw new Error('empty')
        const imported = raw.map((d) => {
          const rawItem = d as Record<string, unknown>
          const layer: HotspotLayer = d.layer === 'auto' || rawItem.type === 'auto' ? 'auto' : 'manual'
          return normalizeBox({
            id: d.id ? String(d.id) : newId(),
            x: Number(d.x) || 0,
            y: Number(d.y) || 0,
            w: Number(d.w) || 0,
            h: Number(d.h) || 0,
            label: d.label ?? '',
            action: d.action ?? '',
            component_type: d.component_type ?? 'button',
            layer,
            element_type: (d.element_type as ElementType | undefined) ?? 'button',
            config_json: d.config_json,
          })
        })
        commit(imported, [])
        setToast(`${imported.length} hotspot diimpor.`)
      } catch {
        setToast('Format JSON tidak valid.')
      }
    }
    reader.readAsText(file)
  }

  const runAction = (box: HotspotBox) => {
    const action = box.action.trim()
    if (!action) {
      setToast(`"${box.label || 'Kotak'}" belum punya aksi.`)
      return
    }
    if (/^https?:\/\//i.test(action)) {
      window.open(action, '_blank', 'noopener,noreferrer')
      return
    }
    window.open(action, '_blank', 'noopener,noreferrer')
  }

  const stageCursor = testMode
    ? 'default'
    : dragKind === 'pan' || spaceDown
      ? 'grabbing'
      : tool === 'draw'
        ? 'crosshair'
        : 'default'

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950 text-slate-100 select-none touch-none"
      onPointerMove={handleRootPointerMove}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      onLostPointerCapture={() => finishInteraction()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ---------- Toolbar ---------- */}
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-slate-900/95 px-3 py-2">
        <div className="flex overflow-hidden rounded border border-white/15">
          <button
            type="button"
            onClick={() => setTool('select')}
            title="Mode Pilih (V)"
            className={cn('h-8 px-3 text-xs', tool === 'select' ? 'bg-[#4268ff] text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10')}
          >
            Pilih
          </button>
          <button
            type="button"
            onClick={() => setTool('draw')}
            title="Mode Gambar (B)"
            className={cn('h-8 px-3 text-xs', tool === 'draw' ? 'bg-[#4268ff] text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10')}
          >
            Gambar
          </button>
        </div>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <button
          type="button"
          onClick={() => zoomStep(-1)}
          disabled={scale <= MIN_ZOOM + 0.0001}
          title="Zoom out (-)"
          aria-label="Perkecil zoom"
          className="h-8 w-8 rounded border border-white/15 bg-white/5 text-sm hover:bg-white/15 disabled:opacity-30"
        >
          −
        </button>
        <button
          type="button"
          onClick={reset100}
          title="Klik untuk reset 100% (0)"
          className="h-8 min-w-[64px] rounded border border-white/15 bg-white/5 px-2 font-mono text-xs hover:bg-white/15"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => zoomStep(1)}
          disabled={scale >= MAX_ZOOM - 0.0001}
          title="Zoom in (+)"
          aria-label="Perbesar zoom"
          className="h-8 w-8 rounded border border-white/15 bg-white/5 text-sm hover:bg-white/15 disabled:opacity-30"
        >
          +
        </button>
        <button
          type="button"
          onClick={fit}
          title="Fit ke layar (F)"
          aria-label="Fit ke layar"
          className="h-8 rounded border border-white/15 bg-white/5 px-2.5 text-xs hover:bg-white/15"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={reset100}
          title="Zoom 100% (0)"
          aria-label="Zoom 100%"
          className="h-8 rounded border border-white/15 bg-white/5 px-2.5 text-xs hover:bg-white/15"
        >
          100%
        </button>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          className="h-8 rounded border border-white/15 bg-white/5 px-2.5 text-xs hover:bg-white/15 disabled:opacity-30"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          className="h-8 rounded border border-white/15 bg-white/5 px-2.5 text-xs hover:bg-white/15 disabled:opacity-30"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={() => deleteBoxes(selectedIds)}
          disabled={!selectedIds.length || testMode}
          title="Hapus kotak terpilih (Delete)"
          aria-label="Hapus kotak terpilih"
          className="h-8 rounded border border-rose-400/40 bg-rose-500/15 px-2.5 text-xs text-rose-200 hover:bg-rose-500/30 disabled:opacity-30"
        >
          Hapus ({selectedIds.length})
        </button>
        <button
          type="button"
          onClick={() => setConfirmDeleteAllAi(true)}
          disabled={boxes.filter((b) => b.layer === 'auto').length === 0}
          title="Hapus semua kotak AI (sisakan manual saja)"
          className="h-8 rounded border border-rose-400/30 bg-white/5 px-2.5 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-30"
        >
          Hapus semua AI
        </button>
        <button
          type="button"
          onClick={() => setConfirmDeleteAll(true)}
          disabled={boxes.filter((b) => b.layer === 'manual').length === 0}
          title="Hapus semua kotak manual"
          className="h-8 rounded border border-rose-400/30 bg-white/5 px-2.5 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-30"
        >
          Hapus manual
        </button>
        <button
          type="button"
          onClick={deleteUnlabeledBoxes}
          disabled={boxes.filter((b) => !b.label.trim()).length === 0}
          title="Hapus semua kotak yang tidak memiliki label"
          className="h-8 rounded border border-amber-400/30 bg-white/5 px-2.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-30"
        >
          Hapus tanpa label
        </button>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <button
          type="button"
          aria-pressed={showManual}
          onClick={() => setShowManual((v) => !v)}
          className={cn(
            'h-8 rounded px-2.5 text-xs font-medium transition-colors',
            showManual
              ? 'bg-[#4268ff] text-white shadow-xs'
              : 'border border-white/15 bg-white/5 text-slate-400 hover:bg-white/10',
          )}
          title="Tampilkan/sembunyikan kotak manual"
          aria-label="Tampilkan atau sembunyikan kotak manual"
        >
          Manual ({boxes.filter((b) => b.layer === 'manual').length})
        </button>
        <button
          type="button"
          aria-pressed={showAuto}
          onClick={() => setShowAuto((v) => !v)}
          className={cn(
            'h-8 rounded px-2.5 text-xs font-medium transition-colors',
            showAuto
              ? 'bg-[#4268ff] text-white shadow-xs'
              : 'border border-white/15 bg-white/5 text-slate-400 hover:bg-white/10',
          )}
          title="Tampilkan/sembunyikan kotak AI"
          aria-label="Tampilkan atau sembunyikan kotak AI"
        >
          AI ({boxes.filter((b) => b.layer === 'auto').length})
        </button>
        <button
          type="button"
          aria-pressed={hideTiny}
          onClick={() => setHideTiny((v) => !v)}
          className={cn(
            'h-8 rounded px-2.5 text-xs font-medium transition-colors',
            hideTiny
              ? 'bg-[#4268ff] text-white shadow-xs'
              : 'border border-white/15 bg-white/5 text-slate-400 hover:bg-white/10',
          )}
          title="Sembunyikan kotak dengan lebar < 1% layar"
          aria-label="Sembunyikan kotak dengan lebar < 1% layar"
        >
          {hideTiny ? '<1% tersembunyi' : 'Semua ukuran'}
        </button>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <button
          type="button"
          aria-pressed={showLabels}
          onClick={() => setShowLabels((v) => !v)}
          className={cn(
            'h-8 rounded px-2.5 text-xs font-medium transition-colors',
            showLabels
              ? 'bg-[#4268ff] text-white shadow-xs'
              : 'border border-white/15 bg-white/5 text-slate-400 hover:bg-white/10',
          )}
          title="Tampilkan/sembunyikan label penuh (hover/selalu di pojok)"
          aria-label="Tampilkan atau sembunyikan label penuh"
        >
          Label {showLabels ? 'ON' : 'OFF'}
        </button>

        <div className="mx-1 h-6 w-px bg-white/10" />

        {/* Switcher Tampilan: Kanvas, Split, Preview */}
        <div className="flex overflow-hidden rounded border border-white/15 bg-white/5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('canvas')}
            className={cn(
              'h-8 px-2.5 font-medium transition-colors',
              viewMode === 'canvas'
                ? 'bg-[#4268ff] text-white'
                : 'text-slate-300 hover:bg-white/10 hover:text-white',
            )}
            title="Tampilkan kanvas screenshot saja"
          >
            Kanvas
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={cn(
              'h-8 px-2.5 font-medium transition-colors border-l border-white/10',
              viewMode === 'split'
                ? 'bg-[#4268ff] text-white'
                : 'text-slate-300 hover:bg-white/10 hover:text-white',
            )}
            title="Tampilkan kanvas dan preview draf berdampingan"
          >
            Split (Kanvas + Preview)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={cn(
              'h-8 px-2.5 font-medium transition-colors border-l border-white/10',
              viewMode === 'preview'
                ? 'bg-[#4268ff] text-white'
                : 'text-slate-300 hover:bg-white/10 hover:text-white',
            )}
            title="Tampilkan preview draf struktur penuh"
          >
            Preview Draf
          </button>
        </div>

        {/* Mode Uji Aksi */}
        <button
          type="button"
          aria-pressed={testMode}
          onClick={() => {
            setTestMode((v) => !v)
            setMenu(null)
          }}
          className={cn(
            'h-8 rounded border px-2 text-xs font-medium',
            testMode
              ? 'border-amber-400/60 bg-amber-500/25 text-amber-100'
              : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10',
          )}
          title="Mode uji interaktif: klik kotak pada kanvas untuk menjalankan aksi simulasi"
          aria-label="Mode uji aksi"
        >
          {testMode ? 'Keluar Uji' : 'Uji Aksi'}
        </button>

        <div className="ml-auto flex items-center gap-2.5">
          {onSaveManual && (
            <button
              type="button"
              onClick={() => void onSaveManual()}
              className="h-8 rounded border border-white/20 bg-white/10 px-2.5 text-xs text-white hover:bg-white/20"
              title="Simpan kotak manual ke database server"
              aria-label="Simpan kotak manual ke database server"
            >
              Simpan Server
            </button>
          )}
          <span className="text-[11px] text-slate-400">{saving ? 'Menyimpan…' : 'Tersimpan otomatis'}</span>
          <button
            type="button"
            onClick={onClose}
            title="Kembali ke UI Reconstruction (Esc)"
            aria-label="Kembali ke UI Reconstruction"
            className="h-8 rounded border border-white/20 bg-rose-500/25 px-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-500 hover:text-white"
          >
            ← Kembali
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ---------- Stage ---------- */}
        <div
          ref={stageRef}
          className={cn(
            'relative overflow-hidden bg-[#070b14]',
            viewMode === 'split' && 'w-1/2 min-w-[380px] flex-1',
            viewMode === 'canvas' && 'flex-1',
            viewMode === 'preview' && 'hidden',
          )}
          style={{ cursor: stageCursor }}
          onPointerDown={handleStagePointerDown}
        >
          {natural && (
            <div
              ref={imageRef}
              className="absolute left-0 top-0 select-none"
              style={{
                width: natural.w,
                height: natural.h,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0',
              }}
            >
              <img
                src={screenshot}
                alt="Screenshot asli"
                draggable={false}
                onLoad={onImageLoad}
                className="pointer-events-none absolute inset-0 h-full w-full select-none"
                style={{ imageRendering: scale > 4 ? 'pixelated' : 'auto' }}
              />

              {visibleBoxes.map((box) => {
                const isSelected = selectedIds.includes(box.id)
                const isManual = box.layer === 'manual'
                const color = isSelected
                  ? '#22d3ee'
                  : testMode
                    ? 'rgba(148,163,184,0.75)'
                    : isManual
                      ? '#3b82f6'
                      : '#22c55e'
                const background = isSelected
                  ? 'rgba(34,211,238,0.12)'
                  : testMode
                    ? 'rgba(148,163,184,0.06)'
                    : isManual
                      ? 'rgba(59,130,246,0.12)'
                      : 'rgba(34,197,94,0.08)'
                return (
                  <div
                    key={box.id}
                    data-hotspot-id={box.id}
                    title={box.label || box.component_type}
                    onPointerDown={(e) => startMove(e, box)}
                    onPointerEnter={() => setHoveredBoxId(box.id)}
                    onPointerLeave={() => setHoveredBoxId(null)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setSelected([box.id])
                      setListTab(box.layer)
                      setMenu({ x: e.clientX, y: e.clientY, boxId: box.id })
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setSelected([box.id])
                      setListTab(box.layer)
                    }}
                    onClick={(e) => {
                      if (!testMode) return
                      e.stopPropagation()
                      runAction(box)
                    }}
                    style={{
                      position: 'absolute',
                      left: `${box.x}%`,
                      top: `${box.y}%`,
                      width: `${box.w}%`,
                      height: `${box.h}%`,
                      boxSizing: 'border-box',
                      border: `${strokeW(isSelected)}px solid ${color}`,
                      backgroundColor: background,
                      borderRadius: 2 / scale,
                      pointerEvents: 'auto',
                      cursor: testMode ? (box.element_type === 'dropdown' ? 'default' : 'pointer') : 'move',
                      zIndex: isSelected ? 30 : isManual ? 20 : 10,
                    }}
                  >
                    {/* Render Dropdown element in preview mode */}
                    {testMode && box.element_type === 'dropdown' && (
                      <div
                        className="h-full w-full p-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <select
                          className="h-full w-full rounded bg-slate-900/90 text-xs text-white border border-slate-600 focus:outline-none"
                          style={{ fontSize: Math.max(9, 12 / scale) }}
                          onChange={(e) => {
                            setToast(`Opsi terpilih: ${e.target.value}`)
                          }}
                        >
                          {(() => {
                            try {
                              const opts = JSON.parse(box.config_json || '[]')
                              if (Array.isArray(opts)) {
                                return opts.map((opt: any, idx: number) => {
                                  const label = typeof opt === 'string' ? opt : opt.label ?? opt.value ?? `Option ${idx}`
                                  const val = typeof opt === 'string' ? opt : opt.value ?? opt.label ?? `opt_${idx}`
                                  return (
                                    <option key={idx} value={val}>
                                      {label}
                                    </option>
                                  )
                                })
                              }
                            } catch {}
                            return <option value="">(Opsi kosong / invalid)</option>
                          })()}
                        </select>
                      </div>
                    )}
                    {!testMode && (
                      <>
                        {/* Small badge in top-left corner - always visible */}
                        <span
                          style={{
                            position: 'absolute',
                            left: 2 / scale,
                            top: 2 / scale,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: Math.max(16, 20 / scale),
                            minHeight: Math.max(16, 20 / scale),
                            background: isSelected ? '#0891b2' : isManual ? '#2563eb' : '#16a34a',
                            color: '#fff',
                            padding: `${labelPad}px ${labelPad * 1.5}px`,
                            borderRadius: 3 / scale,
                            fontSize: Math.max(7, 10 / scale),
                            fontWeight: 700,
                            fontFamily: 'ui-monospace, monospace',
                            lineHeight: 1.1,
                            pointerEvents: 'none',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                          }}
                        >
                          {badgeFor(box)}
                        </span>
                        {/* Full label - show on hover, selection, or when showLabels is enabled */}
                        {(showLabels || isSelected || hoveredBoxId === box.id) && box.label && (
                          <span
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: -labelOffset,
                              display: 'flex',
                              gap: 4 / scale,
                              alignItems: 'center',
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                              zIndex: 5,
                            }}
                          >
                            <span
                              style={{
                                background: isSelected ? '#0891b2' : isManual ? '#2563eb' : '#16a34a',
                                color: '#fff',
                                padding: `${labelPad}px ${labelPad * 2}px`,
                                borderRadius: 3 / scale,
                                fontSize,
                                fontWeight: 600,
                                fontFamily: 'ui-monospace, monospace',
                                lineHeight: 1.2,
                                pointerEvents: 'none',
                              }}
                            >
                              {badgeFor(box)}
                            </span>
                            <span
                              style={{
                                background: 'rgba(15,23,42,0.95)',
                                border: `${1 / scale}px solid rgba(148,163,184,0.5)`,
                                color: '#e2e8f0',
                                padding: `${labelPad}px ${labelPad * 2}px`,
                                borderRadius: 3 / scale,
                                fontSize,
                                lineHeight: 1.2,
                                pointerEvents: 'none',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                              }}
                            >
                              {box.label}
                            </span>
                          </span>
                        )}
                      </>
                    )}

                    {/* Tombol kecil hapus di pojok kanan atas kotak yang sedang terpilih */}
                    {!testMode && isSelected && (
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          deleteBoxes([box.id])
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteBoxes([box.id])
                        }}
                        title="Hapus kotak (Delete)"
                        aria-label="Hapus kotak"
                        style={{
                          position: 'absolute',
                          top: -Math.max(14, 16 / scale),
                          right: -Math.max(14, 16 / scale),
                          padding: `0 ${Math.max(4, 5 / scale)}px`,
                          height: Math.max(18, 20 / scale),
                          display: 'grid',
                          placeItems: 'center',
                          background: '#e11d48',
                          color: '#ffffff',
                          borderRadius: Math.max(3, 4 / scale),
                          fontSize: Math.max(9, 11 / scale),
                          fontWeight: 600,
                          lineHeight: 1,
                          cursor: 'pointer',
                          zIndex: 60,
                          border: `${1.5 / scale}px solid #ffffff`,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                          pointerEvents: 'auto',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Hapus
                      </button>
                    )}

                    {!testMode &&
                      isSelected &&
                      RESIZE_DIRS.map((dir) => {
                        const size = Math.max(8, HANDLE_SCREEN / scale)
                        const style: CSSProperties = {
                          position: 'absolute',
                          width: size,
                          height: size,
                          background: '#22d3ee',
                          border: `${1.5 / scale}px solid #0f172a`,
                          borderRadius: 2 / scale,
                          boxSizing: 'border-box',
                          cursor: RESIZE_CURSOR[dir],
                          zIndex: 50,
                          pointerEvents: 'auto',
                        }
                        if (dir.includes('n')) style.top = -size / 2
                        if (dir.includes('s')) style.bottom = -size / 2
                        if (dir.includes('w')) style.left = -size / 2
                        if (dir.includes('e')) style.right = -size / 2
                        if (dir === 'n' || dir === 's') {
                          style.left = '50%'
                          style.marginLeft = -size / 2
                        }
                        if (dir === 'e' || dir === 'w') {
                          style.top = '50%'
                          style.marginTop = -size / 2
                        }
                        return (
                          <span
                            key={dir}
                            role="presentation"
                            onPointerDown={(e) => startResize(e, box, dir)}
                            style={style}
                          />
                        )
                      })}
                  </div>
                )
              })}

              {tempBox && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${tempBox.x}%`,
                    top: `${tempBox.y}%`,
                    width: `${tempBox.w}%`,
                    height: `${tempBox.h}%`,
                    border: `${2 / scale}px dashed #38bdf8`,
                    background: 'rgba(56,189,248,0.15)',
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          )}

          {!natural && (
            <div className="grid h-full place-items-center text-sm text-slate-500">Memuat screenshot…</div>
          )}

          {/* Hint */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-3 py-1.5 text-[11px] text-slate-300">
            Scroll = zoom ke kursor · Klik kanan / Space + drag = geser · V pilih · B gambar · Del hapus · Ctrl+Z undo · Esc keluar
          </div>

          {toast && (
            <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 rounded bg-slate-800 px-3 py-1.5 text-[11px] text-white shadow-lg">
              {toast}
            </div>
          )}

          {/* Context menu */}
          {menu && menuBox && (
            <>
              <div className="fixed inset-0 z-[120]" onPointerDown={() => setMenu(null)} />
              <div
                className="fixed z-[130] min-w-[180px] overflow-hidden rounded border border-white/15 bg-slate-900 py-1 text-xs shadow-2xl"
                style={{ left: menu.x, top: menu.y }}
              >
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-white/10"
                  onClick={() => {
                    setSelected([menuBox.id])
                    setListTab(menuBox.layer)
                    setMenu(null)
                  }}
                >
                  Edit label / aksi
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-white/10"
                  onClick={() => {
                    duplicateBox(menuBox.id)
                    setMenu(null)
                  }}
                >
                  {menuBox.layer === 'auto' ? 'Salin ke manual' : 'Duplikat kotak'}
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-rose-300 hover:bg-white/10"
                  onClick={() => {
                    deleteBoxes([menuBox.id])
                    setMenu(null)
                  }}
                >
                  Hapus
                </button>
              </div>
            </>
          )}
        </div>

        {/* ---------- Panel Preview Draf (Split / Preview) ---------- */}
        {(viewMode === 'split' || viewMode === 'preview') && (
          <div
            className={cn(
              'flex flex-col border-l border-white/10 bg-slate-900/95 overflow-hidden',
              viewMode === 'split' ? 'w-1/2 min-w-[380px] flex-1' : 'flex-1',
            )}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-slate-200">
                  Pratinjau Hasil Draf (Real-time)
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                {boxes.length} kotak aktif di kanvas
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/50">
              <AIReconstructionPreview draft={liveDraft} />
            </div>
          </div>
        )}

        {/* ---------- Sidebar ---------- */}
        <aside className="flex w-[330px] shrink-0 flex-col border-l border-white/10 bg-slate-900/90">
          <div className="border-b border-white/10 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {single ? 'Properti kotak' : 'Kotak hotspot'}
            </p>
            {single ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2 text-[11px]">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 font-medium text-white',
                      single.layer === 'manual' ? 'bg-cyan-600' : 'bg-emerald-600',
                    )}
                  >
                    {single.layer === 'manual' ? 'MANUAL' : 'AI'}
                  </span>
                  <span className="text-slate-400">{single.component_type}</span>
                  <span className="ml-auto font-mono text-slate-500">{badgeFor(single)}</span>
                </div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500">
                  Label / nama tombol
                  <input
                    value={single.label}
                    onChange={(e) => updateBox(single.id, { label: e.target.value })}
                    onBlur={() => pushHistory(boxesRef.current, selectedRef.current)}
                    placeholder="mis. Tombol Simpan"
                    className="mt-1 w-full rounded border border-white/15 bg-slate-950 px-2 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500">
                  Aksi (URL / ID elemen tujuan)
                  <input
                    value={single.action}
                    onChange={(e) => updateBox(single.id, { action: e.target.value })}
                    onBlur={() => pushHistory(boxesRef.current, selectedRef.current)}
                    placeholder="https://... atau #section"
                    className="mt-1 w-full rounded border border-white/15 bg-slate-950 px-2 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
                  />
                </label>

                {/* Element Type Selector */}
                <div className="pt-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-500">
                    Tipe Elemen
                  </label>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    {(['button', 'dropdown', 'input_data'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          const initialJson =
                            t === 'dropdown'
                              ? '[]'
                              : t === 'input_data'
                              ? '{\n  "dataSource": "",\n  "data": []\n}'
                              : ''
                          updateBox(
                            single.id,
                            {
                              element_type: t,
                              config_json: single.config_json || initialJson,
                            },
                            true,
                          )
                        }}
                        className={cn(
                          'rounded border py-1 text-[11px] font-medium transition-colors',
                          (single.element_type || 'button') === t
                            ? 'border-brand-500 bg-brand-500/20 text-brand-300'
                            : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200',
                        )}
                      >
                        {t === 'button' ? 'Button' : t === 'dropdown' ? 'Dropdown' : 'Input Data'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visual Dropdown Options Editor */}
                {single.element_type === 'dropdown' && (
                  <DropdownVisualEditor
                    key={single.id}
                    boxId={single.id}
                    configJson={single.config_json || ''}
                    onChange={(newJson) => updateBox(single.id, { config_json: newJson }, true)}
                    onCommitHistory={() => pushHistory(boxesRef.current, selectedRef.current)}
                    showAdvanced={showAdvancedJson}
                    onToggleAdvanced={() => setShowAdvancedJson(!showAdvancedJson)}
                    setToast={setToast}
                  />
                )}

                {/* JSON Editor for Input Data */}
                {single.element_type === 'input_data' && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] uppercase tracking-wider text-slate-500">
                        Data Terkait (JSON)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const parsed = JSON.parse(single.config_json || '{}')
                            const formatted = JSON.stringify(parsed, null, 2)
                            updateBox(single.id, { config_json: formatted }, true)
                            setToast('JSON berhasil diformat')
                          } catch (err: any) {
                            setToast(`Format JSON gagal: ${err.message}`)
                          }
                        }}
                        className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-300 hover:bg-white/10"
                      >
                        Format JSON
                      </button>
                    </div>
                    <textarea
                      value={single.config_json || ''}
                      onChange={(e) => updateBox(single.id, { config_json: e.target.value })}
                      onBlur={() => pushHistory(boxesRef.current, selectedRef.current)}
                      rows={5}
                      placeholder='{\n  "dataSource": "nama_hotspot",\n  "data": [ ... ]\n}'
                      className={cn(
                        'w-full rounded border bg-slate-950 p-2 font-mono text-[11px] leading-relaxed text-white focus:outline-none',
                        (() => {
                          try {
                            if (!single.config_json) return 'border-white/15 focus:border-brand-500'
                            JSON.parse(single.config_json)
                            return 'border-white/15 focus:border-brand-500'
                          } catch {
                            return 'border-rose-500 focus:border-rose-500'
                          }
                        })(),
                      )}
                    />
                    {(() => {
                      try {
                        if (!single.config_json) return null
                        JSON.parse(single.config_json)
                        return (
                          <p className="text-[10px] text-emerald-400">
                            ✓ Format JSON valid
                          </p>
                        )
                      } catch (e: any) {
                        return (
                          <p className="text-[10px] text-rose-400 leading-tight">
                            JSON Error: {e.message}
                          </p>
                        )
                      }
                    })()}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-1.5">
                  <SidebarNumField
                    label="X"
                    value={single.x}
                    onCommit={(v) => {
                      const clampedX = clamp(v, 0, Math.max(0, 100 - single.w))
                      updateBox(single.id, { x: clampedX, layer: 'manual' }, true)
                    }}
                  />
                  <SidebarNumField
                    label="Y"
                    value={single.y}
                    onCommit={(v) => {
                      const clampedY = clamp(v, 0, Math.max(0, 100 - single.h))
                      updateBox(single.id, { y: clampedY, layer: 'manual' }, true)
                    }}
                  />
                  <SidebarNumField
                    label="W"
                    value={single.w}
                    onCommit={(v) => {
                      const clampedW = clamp(v, 0.5, 100 - single.x)
                      updateBox(single.id, { w: clampedW, layer: 'manual' }, true)
                    }}
                  />
                  <SidebarNumField
                    label="H"
                    value={single.h}
                    onCommit={(v) => {
                      const clampedH = clamp(v, 0.5, 100 - single.y)
                      updateBox(single.id, { h: clampedH, layer: 'manual' }, true)
                    }}
                  />
                </div>
                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => duplicateBox(single.id)}
                    className="flex-1 rounded border border-white/15 bg-white/5 py-1 text-[11px] hover:bg-white/10"
                  >
                    Duplikat
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBoxes([single.id])}
                    className="flex-1 rounded border border-rose-400/40 bg-rose-500/15 py-1 text-[11px] text-rose-200 hover:bg-rose-500/30"
                  >
                    Hapus
                  </button>
                </div>
                <p className="text-[10px] leading-relaxed text-slate-500">
                  Koordinat dalam persen gambar asli. Panah = 1 px, Shift+panah = 10 px. Shift saat resize
                  menjaga rasio.
                </p>
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">
                Klik kotak untuk memilih. Ctrl/Shift+klik untuk memilih beberapa kotak. Klik dua kali untuk
                membuka properti.
              </p>
            )}
          </div>

          <div className="flex border-b border-white/10">
            {(['manual', 'auto'] as HotspotLayer[]).map((layer) => (
              <button
                key={layer}
                type="button"
                onClick={() => setListTab(layer)}
                className={cn(
                  'flex-1 border-b-2 px-2 py-2 text-[11px] font-medium',
                  listTab === layer
                    ? layer === 'manual'
                      ? 'border-[#4268ff] bg-[#4268ff]/10 text-[#4268ff]'
                      : 'border-emerald-500 bg-emerald-500/10 text-emerald-200'
                    : 'border-transparent text-slate-500 hover:text-slate-300',
                )}
              >
                {layer === 'manual' ? 'Manual' : 'AI'} ({boxes.filter((b) => b.layer === layer).length})
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul className="divide-y divide-white/5">
              {boxes
                .filter((b) => b.layer === listTab)
                .map((box) => {
                  const active = selectedIds.includes(box.id)
                  return (
                    <li key={box.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          setSelected(
                            e.ctrlKey || e.metaKey || e.shiftKey
                              ? selectedIds.includes(box.id)
                                ? selectedIds.filter((id) => id !== box.id)
                                : [...selectedIds, box.id]
                              : [box.id],
                          )
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelected([box.id])
                          }
                        }}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 px-3 py-2',
                          active ? 'bg-cyan-500/15' : 'hover:bg-white/5',
                        )}
                      >
                        <span
                          className={cn(
                            'grid h-6 w-6 shrink-0 place-items-center rounded border text-[10px] font-medium',
                            listTab === 'manual'
                              ? 'border-blue-400/40 bg-blue-500/10 text-blue-300'
                              : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
                          )}
                        >
                          {badgeFor(box)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] text-slate-200">
                            {box.label || '(tanpa label)'}
                          </span>
                          <span className="block truncate text-[10px] text-slate-500">
                            {box.action || box.component_type}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteBoxes([box.id])
                          }}
                          title="Hapus"
                          aria-label="Hapus"
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-rose-300 hover:bg-rose-500/25"
                        >
                          Hapus
                        </button>
                      </div>
                    </li>
                  )
                })}
              {boxes.filter((b) => b.layer === listTab).length === 0 && (
                <li className="px-4 py-6 text-center text-[11px] text-slate-500">
                  {listTab === 'manual'
                    ? 'Belum ada kotak manual. Pilih mode Gambar (B), lalu drag di atas gambar.'
                    : 'Belum ada kotak otomatis. Jalankan analisis AI terlebih dahulu.'}
                </li>
              )}
            </ul>
          </div>

          <div className="border-t border-white/10 px-3 py-2 text-[10px] text-slate-500">
            {boxes.length} kotak · {selectedIds.length} terpilih
          </div>
        </aside>
      </div>

      {/* ---------- Footer ---------- */}
      <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-slate-900/95 px-4 py-2 text-[11px] text-slate-400">
        <button type="button" onClick={exportJson} className="underline hover:text-white">
          Export JSON
        </button>
        <button
          type="button"
          onClick={() => document.getElementById('hotspot-import-file')?.click()}
          className="underline hover:text-white"
        >
          Import JSON
        </button>
        <input id="hotspot-import-file" type="file" accept=".json" className="hidden" onChange={importJson} />
        <span className="ml-auto">
          {testMode ? 'Mode uji aksi: klik kotak untuk menjalankan aksi.' : 'Perubahan tersimpan otomatis (debounce 500 ms).'}
        </span>
      </footer>

      {/* ---------- Konfirmasi hapus semua AI ---------- */}
      {confirmDeleteAllAi && (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white">Hapus semua kotak AI?</h3>
            <p className="mt-1.5 text-xs text-slate-400">
              {boxes.filter((b) => b.layer === 'auto').length} kotak AI akan dihapus dan dimasukkan ke daftar hapus.
              Kotak manual tetap aman. Tindakan ini bisa di-undo dengan Ctrl+Z.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAllAi(false)}
                className="h-8 rounded border border-white/20 bg-white/10 px-3 text-xs text-white hover:bg-white/20"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={deleteAllAiBoxes}
                className="h-8 rounded bg-rose-500 px-3 text-xs font-medium text-white hover:bg-rose-600"
              >
                Hapus semua AI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Konfirmasi hapus semua manual ---------- */}
      {confirmDeleteAll && (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white">Hapus semua kotak manual?</h3>
            <p className="mt-1.5 text-xs text-slate-400">
              {boxes.filter((b) => b.layer === 'manual').length} kotak manual akan dihapus. Kotak otomatis tidak
              tersentuh. Tindakan ini bisa di-undo dengan Ctrl+Z.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAll(false)}
                className="h-8 rounded border border-white/20 bg-white/10 px-3 text-xs text-white hover:bg-white/20"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = boxesRef.current.filter((b) => b.layer !== 'manual')
                  commit(next, [])
                  setConfirmDeleteAll(false)
                  setToast('Semua kotak manual dihapus.')
                }}
                className="h-8 rounded bg-rose-500 px-3 text-xs font-medium text-white hover:bg-rose-600"
              >
                Hapus semua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Tipe minimal untuk hit-test (kompatibel dengan HotspotBox). */
interface ManualBoxLike {
  id: string
  x: number
  y: number
  w: number
  h: number
}
