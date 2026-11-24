import type {
  AIResult,
  AIResultBox,
  AIResultComponent,
  AIResultSection,
  Reconstruction,
  ReconstructionComponent,
  ReconstructionSection,
} from '../lib/reconstruction'
import { Alert, Badge, Button, Card, EmptyState } from './ui'
import { IconCheck, IconInfo, IconMagic, IconWarning } from './icons'

interface AIResultPanelProps {
  draft: Reconstruction | null
  analyzing: boolean
  onRunAI: () => void
  canRunAI?: boolean
  className?: string
}

interface GeneratorDecision {
  used: boolean
  reason: string
  kind?: 'generator' | 'merge' | 'unknown'
}

interface ComponentRow {
  key: string
  origin: 'Respons AI' | 'Draf saat ini' | 'Item section layout'
  componentType: string
  label: string
  draftLabel?: string
  source: string
  draftSource?: string
  confidence: string
  box?: AIResultBox
  region?: string
  section?: string
  decision: GeneratorDecision
}

interface LayoutItemDecision {
  key: string
  componentType: string
  label: string
  section: string
  decision: GeneratorDecision
}

interface GeneratorClassification {
  components: Map<number, GeneratorDecision>
  layoutItems: LayoutItemDecision[]
}

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger'
type ConfidenceTone = 'neutral' | 'success' | 'warning' | 'danger'

// Konstanta ini sengaja mengikuti _collect_elements() pada
// backend/app/services/simulation_generator.py. Rule generator tidak diubah.
const GENERATOR_FIELD_TYPES = new Set(['input', 'field', 'select', 'dropdown', 'textarea'])
const GENERATOR_ACTION_TYPES = new Set(['button', 'link'])
const GENERATOR_NAV_TYPES = new Set(['nav-item'])
const GENERATOR_PREFIXES = [
  'field ',
  'tombol ',
  'pilihan ',
  'dropdown ',
  'menu ',
  'link ',
  'tab ',
  'checkbox ',
  'item endpoint ',
  'ikon ',
  'kartu ',
  'area ',
  'judul halaman ',
  'judul utama ',
  'judul ',
  'logo ',
  'navigasi ',
  'tabel ',
  'status ',
]
const GENERIC_LABELS = new Set([
  'container',
  'bagian',
  'card',
  'div',
  'span',
  'body',
  'main',
  'content',
])
const SENSITIVE_JSON_KEYS = new Set([
  'xgoogapikey',
  'xapikey',
  'apikey',
  'geminikey',
  'geminiapikey',
  'authorization',
  'proxyauthorization',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearer',
  'cookie',
  'setcookie',
  'credential',
  'credentials',
  'secret',
  'clientsecret',
  'privatekey',
  'password',
  'passwd',
  'sessionid',
  'sessiontoken',
  'request',
  'requestpayload',
  'payload',
  'requestheaders',
  'header',
  'httpheader',
  'httpheaders',
  'httpsheader',
  'httpsheaders',
  'requestheader',
  'responseheader',
  'responseheaders',
  'contents',
  'parts',
  'systeminstruction',
  'inlinedata',
  'screenshot',
  'screenshotdata',
  'image',
  'thumbnail',
  'thumbnaildata',
  'base64',
  'imagebytes',
  'binarydata',
])

function normalizeGeneratorText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function cleanGeneratorLabel(label: string | null | undefined): string {
  let value = (label ?? '').trim().replace(/\s+/g, ' ')
  let changed = true
  while (changed) {
    changed = false
    const lowered = value.toLowerCase()
    for (const prefix of GENERATOR_PREFIXES) {
      if (lowered.startsWith(prefix)) {
        value = value.slice(prefix.length).trim()
        changed = true
        break
      }
    }
  }
  return value.replace(/^[\s\-:•]+|[\s\-:•]+$/g, '')
}

function generatorGroup(componentType: string | null | undefined): string | null {
  const lowered = (componentType ?? '').toLowerCase()
  if (GENERATOR_FIELD_TYPES.has(lowered)) return 'field'
  if (GENERATOR_ACTION_TYPES.has(lowered)) return 'action'
  if (GENERATOR_NAV_TYPES.has(lowered)) return 'nav'
  if (['heading', 'logo', 'card', 'table'].includes(lowered)) return lowered
  return null
}

function getDraftBox(component: ReconstructionComponent): AIResultBox | undefined {
  const box = component.props?.box
  if (!box) return undefined
  if (![box.x, box.y, box.w, box.h].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return undefined
  }
  return { x: box.x, y: box.y, w: box.w, h: box.h }
}

function getAIComponentBox(component: AIResultComponent): AIResultBox | undefined {
  const box = component.props?.box ?? component.box
  if (!box) return undefined
  if (![box.x, box.y, box.w, box.h].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return undefined
  }
  return { x: box.x, y: box.y, w: box.w, h: box.h }
}

function boxIou(box1: AIResultBox, box2: AIResultBox): number {
  const x1 = Math.max(box1.x, box2.x)
  const y1 = Math.max(box1.y, box2.y)
  const x2 = Math.min(box1.x + box1.w, box2.x + box2.w)
  const y2 = Math.min(box1.y + box1.h, box2.y + box2.h)
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const area1 = Math.max(0, box1.w) * Math.max(0, box1.h)
  const area2 = Math.max(0, box2.w) * Math.max(0, box2.h)
  const union = area1 + area2 - intersection
  return union > 0 ? intersection / union : 0
}

function getOverride(
  component: ReconstructionComponent,
  overrides: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const rawId = String(component.id)
  for (const key of [rawId, `auto_${rawId}`, `manual_${rawId}`]) {
    const value = overrides[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  }
  return undefined
}

function getEffectiveDraftLabel(
  component: ReconstructionComponent,
  draft: Reconstruction | null,
): string {
  const override = getOverride(component, draft?.layout?.overrides ?? {})
  const overrideLabel = override?.label
  if (typeof overrideLabel === 'string' && overrideLabel.trim()) {
    return overrideLabel.trim()
  }
  return component.label ?? ''
}

function isTombstoned(component: ReconstructionComponent, tombstones: Set<string>): boolean {
  const rawId = String(component.id)
  return tombstones.has(rawId) || tombstones.has(`auto_${rawId}`) || tombstones.has(`manual_${rawId}`)
}

function classifyGeneratorInputs(draft: Reconstruction): GeneratorClassification {
  const layout = draft?.layout ?? {}
  const tombstones = new Set((layout.tombstones ?? []).map((value) => String(value)))
  const overrides = layout.overrides ?? {}
  const decisions = new Map<number, GeneratorDecision>()
  const layoutItems: LayoutItemDecision[] = []
  const tombstonedLabels = new Set<string>()
  const seen = new Set<string>()

  for (const component of draft.components ?? []) {
    const source = (component.source ?? '').toLowerCase()
    if (source === 'detected') {
      decisions.set(component.id, {
        used: false,
        reason: 'Sumber detected tidak diterima generator.',
      })
      continue
    }
    if (isTombstoned(component, tombstones)) {
      if (component.label) {
        tombstonedLabels.add(normalizeGeneratorText(component.label))
      }
      decisions.set(component.id, {
        used: false,
        reason: 'Dihapus operator (tombstone).',
      })
      continue
    }

    const override = getOverride(component, overrides)
    const overrideLabel = override?.label
    const label = typeof overrideLabel === 'string' && overrideLabel.trim()
      ? overrideLabel
      : component.label ?? ''
    const cleaned = cleanGeneratorLabel(label)
    const normalized = normalizeGeneratorText(cleaned)

    if (!cleaned) {
      decisions.set(component.id, {
        used: false,
        reason: 'Label kosong ditolak generator.',
      })
      continue
    }
    if (GENERIC_LABELS.has(normalized)) {
      decisions.set(component.id, {
        used: false,
        reason: 'Label generik ditolak generator.',
      })
      continue
    }
    if (/^bagian \d+$/.test(normalized)) {
      decisions.set(component.id, {
        used: false,
        reason: 'Label section generik ditolak generator.',
      })
      continue
    }

    const group = generatorGroup(component.component_type)
    if (!group) {
      decisions.set(component.id, {
        used: false,
        reason: 'Tipe komponen tidak didukung generator.',
      })
      continue
    }

    const marker = `${group}:${normalized}`
    if (seen.has(marker)) {
      decisions.set(component.id, {
        used: false,
        reason: 'Duplikat label/tipe; generator memakai instance pertama.',
      })
      continue
    }

    seen.add(marker)
    decisions.set(component.id, {
      used: true,
      reason: 'Lolos filter generator sebagai kandidat input.',
    })
  }

  // Item section layout juga menjadi input generator, tetapi tidak dihitung
  // oleh usability AI Vision/manual. Proses dan deduplikasi mengikuti urutan
  // _collect_elements(): komponen draf lebih dahulu, lalu item section.
  for (const [sectionIndex, section] of (layout.sections ?? []).entries()) {
    const sectionName = section.label || `Section ${sectionIndex + 1}`
    for (const [itemIndex, item] of (section.items ?? []).entries()) {
      const key = `layout-${sectionIndex}-${itemIndex}`
      const componentType = item.type || 'text'
      const label = item.label ?? ''
      const originalNormalized = normalizeGeneratorText(label)

      if (!label) {
        layoutItems.push({
          key,
          componentType,
          label: '—',
          section: sectionName,
          decision: { used: false, reason: 'Label kosong ditolak generator.' },
        })
        continue
      }
      if (tombstonedLabels.has(originalNormalized)) {
        layoutItems.push({
          key,
          componentType,
          label,
          section: sectionName,
          decision: { used: false, reason: 'Label komponen sudah di-tombstone.' },
        })
        continue
      }

      const cleaned = cleanGeneratorLabel(label)
      const normalized = normalizeGeneratorText(cleaned)
      if (!cleaned) {
        layoutItems.push({
          key,
          componentType,
          label,
          section: sectionName,
          decision: { used: false, reason: 'Label kosong ditolak generator.' },
        })
        continue
      }
      if (GENERIC_LABELS.has(normalized)) {
        layoutItems.push({
          key,
          componentType,
          label,
          section: sectionName,
          decision: { used: false, reason: 'Label generik ditolak generator.' },
        })
        continue
      }
      if (/^bagian \d+$/.test(normalized)) {
        layoutItems.push({
          key,
          componentType,
          label,
          section: sectionName,
          decision: { used: false, reason: 'Label section generik ditolak generator.' },
        })
        continue
      }

      const group = generatorGroup(componentType)
      if (!group) {
        layoutItems.push({
          key,
          componentType,
          label,
          section: sectionName,
          decision: { used: false, reason: 'Tipe komponen tidak didukung generator.' },
        })
        continue
      }

      const marker = `${group}:${normalized}`
      if (seen.has(marker)) {
        layoutItems.push({
          key,
          componentType,
          label,
          section: sectionName,
          decision: {
            used: false,
            reason: 'Duplikat label/tipe; generator memakai instance pertama.',
          },
        })
        continue
      }

      seen.add(marker)
      layoutItems.push({
        key,
        componentType,
        label,
        section: sectionName,
        decision: { used: true, reason: 'Lolos filter generator sebagai kandidat input.' },
      })
    }
  }

  return { components: decisions, layoutItems }
}

function classifyUnpersistedAIComponent(
  raw: AIResultComponent,
  draft: Reconstruction | null,
): GeneratorDecision {
  const layout = draft?.layout ?? {}
  const tombstones = new Set((layout.tombstones ?? []).map((value) => String(value)))
  const label = raw.label ?? ''
  const componentType = raw.component_type
  const box = getAIComponentBox(raw)

  if (!componentType || !componentType.trim()) {
    return {
      used: false,
      kind: 'merge',
      reason: 'Tipe komponen kosong atau tidak valid sehingga tidak masuk draf.',
    }
  }

  const x = box ? Math.round(box.x) : 0
  const y = box ? Math.round(box.y) : 0
  const stableId = `ai_${componentType}_${label}_${x}_${y}`
  if (tombstones.has(label) || tombstones.has(stableId)) {
    return {
      used: false,
      kind: 'merge',
      reason: 'Dihapus operator (tombstone) sebelum masuk draf.',
    }
  }

  if (box) {
    const manualCollision = (draft?.components ?? []).some((component) => {
      if (component.source !== 'manual' && component.region !== 'manual') return false
      const draftBox = getDraftBox(component)
      return draftBox ? boxIou(box, draftBox) > 0.7 : false
    })
    if (manualCollision) {
      return {
        used: false,
        kind: 'merge',
        reason: 'Benturan dengan komponen manual saat masuk draf.',
      }
    }

    const duplicatePosition = (draft?.components ?? []).some((component) => {
      if (component.source === 'manual' || component.region === 'manual') return false
      const draftBox = getDraftBox(component)
      return draftBox ? boxIou(box, draftBox) > 0.7 : false
    })
    if (duplicatePosition) {
      return {
        used: false,
        kind: 'merge',
        reason: 'Duplikat posisi saat merge ke draf.',
      }
    }
  }

  if (!box) {
    return {
      used: false,
      kind: 'merge',
      reason: 'Tidak memiliki box sehingga tidak masuk draf.',
    }
  }

  return {
    used: false,
    kind: 'unknown',
    reason: 'Tidak dapat dikorelasikan dengan draf; status merge tidak dapat dipastikan.',
  }
}

function findDraftMatch(
  raw: AIResultComponent,
  candidates: ReconstructionComponent[],
  usedIds: Set<number>,
): ReconstructionComponent | undefined {
  const rawType = (raw.component_type ?? '').toLowerCase()
  const rawLabel = (raw.label ?? '').trim()
  const rawNormalized = normalizeGeneratorText(rawLabel)
  const rawBox = getAIComponentBox(raw)
  let best: { component: ReconstructionComponent; score: number } | undefined

  for (const candidate of candidates) {
    if (usedIds.has(candidate.id)) continue
    if ((candidate.component_type ?? '').toLowerCase() !== rawType) continue

    const candidateLabel = (candidate.label ?? '').trim()
    const candidateNormalized = normalizeGeneratorText(candidateLabel)
    const labelMatches = Boolean(
      rawLabel
      && candidateLabel
      && rawNormalized === candidateNormalized,
    )
    const candidateBox = getDraftBox(candidate)
    const overlap = rawBox && candidateBox ? boxIou(rawBox, candidateBox) : 0

    // Identitas kuat membutuhkan label yang sama atau overlap posisi tinggi.
    // Label saja tetap boleh dicocokkan bila operator memindahkan komponen.
    if (!labelMatches && overlap <= 0.7) continue

    let score = overlap * 100
    if (overlap > 0.7) score += 200
    if (labelMatches) score += 50
    if ((raw.region ?? '') === (candidate.region ?? '')) score += 5

    if (!best || score > best.score) {
      best = { component: candidate, score }
    }
  }

  return best?.component
}

function buildComponentRows(
  draft: Reconstruction | null,
  result: AIResult,
): ComponentRow[] {
  const classification = draft
    ? classifyGeneratorInputs(draft)
    : { components: new Map<number, GeneratorDecision>(), layoutItems: [] }
  const decisions = classification.components
  const rawComponents = result.components ?? []
  const draftAIComponents = (draft?.components ?? []).filter(
    (component) => component.source === 'ai-vision',
  )
  const usedDraftIds = new Set<number>()
  const rows: ComponentRow[] = []

  rawComponents.forEach((raw, index) => {
    const matched = findDraftMatch(raw, draftAIComponents, usedDraftIds)
    if (matched) usedDraftIds.add(matched.id)
    const decision = matched
      ? decisions.get(matched.id) ?? { used: false, reason: 'Ditolak filter generator.' }
      : classifyUnpersistedAIComponent(raw, draft)
    const rawLabel = raw.label ?? matched?.label ?? ''
    const effectiveDraftLabel = matched ? getEffectiveDraftLabel(matched, draft) : ''
    rows.push({
      key: `ai-${index}`,
      origin: 'Respons AI',
      componentType: raw.component_type ?? matched?.component_type ?? '—',
      label: redactSensitiveText(rawLabel) || '—',
      draftLabel:
        effectiveDraftLabel && effectiveDraftLabel !== rawLabel
          ? redactSensitiveText(effectiveDraftLabel)
          : undefined,
      source: raw.source ?? 'ai-vision',
      draftSource: matched?.source,
      confidence: formatConfidence(raw),
      box: getAIComponentBox(raw) ?? (matched ? getDraftBox(matched) : undefined),
      region: raw.region ?? matched?.region,
      decision,
    })
  })

  for (const component of draft?.components ?? []) {
    if (usedDraftIds.has(component.id)) continue
    rows.push({
      key: `draft-${component.id}`,
      origin: 'Draf saat ini',
      componentType: component.component_type || '—',
      label: redactSensitiveText(getEffectiveDraftLabel(component, draft)) || '—',
      source: component.source || 'ai-vision',
      confidence: '—',
      box: getDraftBox(component),
      region: component.region,
      decision: decisions.get(component.id) ?? {
        used: false,
        reason: 'Ditolak filter generator.',
      },
    })
  }

  for (const item of classification.layoutItems) {
    rows.push({
      key: item.key,
      origin: 'Item section layout',
      componentType: item.componentType,
      label: redactSensitiveText(item.label),
      source: 'layout',
      confidence: '—',
      region: 'main',
      section: item.section,
      decision: item.decision,
    })
  }

  return rows
}

function formatConfidence(component: AIResultComponent): string {
  const value = component.confidence ?? component.props?.confidence
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') {
    if (value >= 0 && value <= 1) return `${Math.round(value * 100)}%`
    return String(value)
  }
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 1) {
    return `${Math.round(numeric * 100)}%`
  }
  return String(value)
}

function formatBox(box: AIResultBox | undefined): string {
  if (!box) return '—'
  const format = (value: number) => String(Math.round(value * 10) / 10)
  return `x ${format(box.x)}, y ${format(box.y)}, w ${format(box.w)}, h ${format(box.h)}`
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatDateTime(value: string | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

function statusMeta(status: string | undefined): { label: string; tone: StatusTone } {
  if (status === 'success') return { label: 'Berhasil', tone: 'success' }
  if (status === 'failed') return { label: 'Gagal', tone: 'danger' }
  if (status === 'not_configured') return { label: 'Belum dikonfigurasi', tone: 'warning' }
  if (!status) return { label: 'Belum dijalankan', tone: 'neutral' }
  return { label: `Status tidak dikenal: ${status}`, tone: 'neutral' }
}

function confidenceTone(confidence: string | undefined): ConfidenceTone {
  const normalized = (confidence ?? '').toLowerCase()
  if (normalized === 'high') return 'success'
  if (normalized === 'medium') return 'warning'
  if (normalized === 'low') return 'danger'
  return 'neutral'
}

function decisionBadgeMeta(decision: GeneratorDecision): { label: string; tone: StatusTone } {
  if (decision.used) return { label: 'Dipakai', tone: 'success' }
  if (decision.kind === 'unknown') return { label: 'Tidak diketahui', tone: 'neutral' }
  if (decision.kind === 'merge') return { label: 'Dibuang merge', tone: 'danger' }
  return { label: 'Dibuang', tone: 'danger' }
}

function redactSensitiveText(value: string): string {
  let redacted = value
  redacted = redacted.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[DISEMASKAN]')
  redacted = redacted.replace(
    /(x-goog-api-key\s*[=:]\s*)[^&\s,;]+/gi,
    '$1[DISEMASKAN]',
  )
  redacted = redacted.replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[DISEMASKAN]')
  redacted = redacted.replace(/(Bearer\s+)[0-9A-Za-z._~+/=-]{8,}/gi, '$1[DISEMASKAN]')
  redacted = redacted.replace(/\bsk-[0-9A-Za-z_-]{16,}\b/g, '[DISEMASKAN]')
  redacted = redacted.replace(
    /data:[^;\s]+;base64,[0-9A-Za-z+/=]+/gi,
    '[DATA BINARY DITARMAKAN]',
  )
  return redacted
}

function sanitizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item))
  if (typeof value === 'string') return redactSensitiveText(value)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (
        normalizedKey === 'headers'
        && (
          (item && typeof item === 'object' && !Array.isArray(item))
          || (
            Array.isArray(item)
            && item.some((entry) => (
              typeof entry === 'string'
              && /^[0-9A-Za-z_-]+\s*:/.test(entry)
            ))
          )
        )
      ) return [key, '[DISEMASKAN]']
      if (SENSITIVE_JSON_KEYS.has(normalizedKey)) return [key, '[DISEMASKAN]']
      return [key, sanitizeJsonValue(item)]
    }),
  )
}

function regionBox(regions: AIResultBox | null | undefined): string {
  if (!regions) return 'Tidak teridentifikasi'
  if (![regions.x, regions.y, regions.w, regions.h].every(
    (value) => typeof value === 'number' && Number.isFinite(value),
  )) {
    return 'Data region tidak lengkap'
  }
  return formatBox(regions)
}

function sectionTitle(section: ReconstructionSection | AIResultSection, index: number): string {
  const name = 'name' in section ? section.name : undefined
  return section.label ?? name ?? `Section ${index + 1}`
}

function sectionTypes(section: ReconstructionSection | AIResultSection): string[] {
  return Array.isArray(section.types) ? section.types : []
}

function sectionItemCount(section: ReconstructionSection | AIResultSection): number | undefined {
  return typeof section.item_count === 'number' ? section.item_count : undefined
}

export function AIResultPanel({
  draft,
  analyzing,
  onRunAI,
  canRunAI = true,
  className,
}: AIResultPanelProps) {
  const layout = draft?.layout
  const storedResult = layout?.ai_result ?? null
  const status = layout?.ai_status
  const hasResult = Boolean(storedResult && status !== 'failed')
  const result: AIResult = hasResult && storedResult ? storedResult : {}
  const statusInfo = statusMeta(status)
  const rows = hasResult ? buildComponentRows(draft, result) : []
  const rawRegions = result.layout?.regions
  const currentRegions = layout?.regions
  const draftSections = layout?.sections ?? []
  const rawSections = result.layout?.sections ?? []
  const assumptions = result.assumptions ?? []
  const rawJson = hasResult
    ? JSON.stringify(sanitizeJsonValue(result), null, 2)
    : '{}'

  return (
    <Card
      title="Hasil AI Vision"
      description="Bandingkan respons AI, komponen draf, dan keputusan generator tanpa mengubah aturan generator."
      className={className}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetadataItem label="Model">
          <span className="font-medium text-slate-800">{layout?.ai_model || '—'}</span>
        </MetadataItem>
        <MetadataItem label="Waktu analisis">
          <span className="font-medium text-slate-800">{formatDateTime(layout?.ai_analyzed_at)}</span>
        </MetadataItem>
        <MetadataItem label="Status">
          <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
        </MetadataItem>
        <MetadataItem label="Sumber AI">
          <span className="font-medium text-slate-800">{layout?.ai_source || '—'}</span>
        </MetadataItem>
        <MetadataItem label="Pembuat draf">
          <span className="font-medium text-slate-800">{draft?.generated_by || '—'}</span>
        </MetadataItem>
        <MetadataItem label="Ukuran JSON tersimpan">
          <span className="font-medium text-slate-800">{formatBytes(layout?.ai_result_size_bytes)}</span>
        </MetadataItem>
      </div>

      {status === 'failed' && (
        <Alert
          tone="danger"
          title="AI Vision gagal"
          className="mt-4"
        >
          {redactSensitiveText(layout?.ai_error || 'Tidak ada detail error dari analisis AI.')}
        </Alert>
      )}
      {status === 'not_configured' && (
        <Alert
          tone="warning"
          title="AI Vision belum dikonfigurasi"
          className="mt-4"
        >
          {redactSensitiveText(layout?.ai_error || 'Administrator belum mengonfigurasi Gemini API.')}
        </Alert>
      )}
      {layout?.ai_result_truncated && (
        <Alert
          tone="warning"
          title="JSON hasil AI dipangkas"
          className="mt-4"
        >
          Ukuran hasil AI melebihi batas 200&nbsp;KB. Komponen/asumsi paling akhir dipangkas agar data yang tersimpan tetap valid dan aman.
        </Alert>
      )}

      {!hasResult ? (
        <div className="mt-4">
          <EmptyState
            title="Belum ada hasil AI Vision untuk layar ini"
            description={
              status === 'failed'
                ? 'Analisis terakhir gagal. Jalankan AI Vision untuk mencoba kembali.'
                : status === 'not_configured'
                  ? 'Administrator harus mengonfigurasi Gemini API sebelum analisis dapat dijalankan.'
                  : 'Jalankan AI Vision untuk membuat respons, komponen, layout, dan asumsi yang dapat ditinjau.'
            }
            action={
              <Button
                onClick={onRunAI}
                loading={analyzing}
                disabled={analyzing || !canRunAI || status === 'not_configured'}
              >
                <IconMagic size={14} />
                {status === 'failed' ? 'Coba lagi' : 'AI Vision'}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          <section aria-labelledby="ai-regions-title">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 id="ai-regions-title" className="text-sm font-semibold text-slate-900">
                Region hasil AI (persen)
              </h3>
              <div className="flex gap-2">
                {result.layout?.has_sidebar !== undefined && (
                  <Badge tone={result.layout.has_sidebar ? 'success' : 'neutral'}>
                    Sidebar {result.layout.has_sidebar ? 'ada' : 'tidak ada'}
                  </Badge>
                )}
                {result.layout?.has_header !== undefined && (
                  <Badge tone={result.layout.has_header ? 'success' : 'neutral'}>
                    Header {result.layout.has_header ? 'ada' : 'tidak ada'}
                  </Badge>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <RegionItem label="Sidebar" box={regionBox(rawRegions?.sidebar)} />
              <RegionItem label="Header" box={regionBox(rawRegions?.header)} />
              <RegionItem label="Main" box={regionBox(rawRegions?.main)} />
            </div>

            <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Region draf saat ini (piksel)
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <RegionItem label="Sidebar" box={regionBox(currentRegions?.sidebar)} />
              <RegionItem label="Header" box={regionBox(currentRegions?.header)} />
              <RegionItem label="Main" box={regionBox(currentRegions?.main)} />
            </div>
          </section>

          <section aria-labelledby="ai-sections-title">
            <h3 id="ai-sections-title" className="mb-2 text-sm font-semibold text-slate-900">
              Section hasil AI
            </h3>
            <SectionCards
              sections={rawSections}
              emptyText="Respons AI tidak memuat section."
            />

            <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Section draf saat ini
            </h4>
            <SectionCards
              sections={draftSections}
              emptyText="Belum ada section draf yang dapat ditampilkan."
            />
          </section>

          <section aria-labelledby="ai-components-title">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 id="ai-components-title" className="text-sm font-semibold text-slate-900">
                Komponen AI, draf, dan item layout
              </h3>
              <span className="text-xs text-slate-500">
                {rows.length} baris · mengikuti urutan filter generator saat ini
              </span>
            </div>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
              Badge <span className="font-medium text-slate-700">Dipakai</span> berarti komponen
              lolos admission generator dan menjadi kandidat input; ini belum menjamin komponen
              selalu tampil di simulasi akhir. <span className="font-medium text-slate-700">Dibuang
              merge</span> berarti respons AI tidak masuk draf, sedangkan
              <span className="font-medium text-slate-700">Tidak diketahui</span> dipakai ketika
              respons tidak dapat dikorelasikan secara aman dengan draf. Item section layout juga
              dihitung, sedangkan badge usability pada ringkasan hanya menghitung sumber AI
              Vision/manual. Pencocokan respons AI ke komponen draf bersifat terbaik dan dapat
              ambigu setelah draf diedit.
            </p>
            <div className="max-h-[32rem] overflow-auto rounded border border-slate-200">
              <table className="min-w-[980px] w-full text-left text-xs">
                <caption className="sr-only">
                  Korelasi respons AI Vision, komponen draf, dan keputusan generator
                </caption>
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="table-head">
                    <th scope="col" className="px-3 py-2.5">Asal</th>
                    <th scope="col" className="px-3 py-2.5">Tipe</th>
                    <th scope="col" className="px-3 py-2.5">Label</th>
                    <th scope="col" className="px-3 py-2.5">Sumber</th>
                    <th scope="col" className="px-3 py-2.5">Confidence</th>
                    <th scope="col" className="px-3 py-2.5">Box</th>
                    <th scope="col" className="px-3 py-2.5">Generator / merge</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="table-row align-top">
                      <td className="px-3 py-2.5 text-slate-500">{row.origin}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-slate-800">{row.componentType}</span>
                        {row.region && <span className="mt-0.5 block text-[11px] text-slate-400">{row.region}</span>}
                        {row.section && <span className="mt-0.5 block text-[11px] text-slate-400">{row.section}</span>}
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5 text-slate-700">
                        <span className="break-words">{row.label}</span>
                        {row.draftLabel && (
                          <span className="mt-0.5 block text-[11px] text-slate-400">
                            Draf: {row.draftLabel}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone="neutral">{row.source}</Badge>
                        {row.draftSource && row.draftSource !== row.source && (
                          <span className="mt-1 block text-[11px] text-slate-400">
                            Draf: {row.draftSource}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular text-slate-600">{row.confidence}</td>
                      <td className="px-3 py-2.5 tabular text-slate-500">{formatBox(row.box)}</td>
                      <td className="max-w-[250px] px-3 py-2.5">
                        <Badge tone={decisionBadgeMeta(row.decision).tone}>
                          <span className="flex items-center gap-1">
                            {row.decision.used ? (
                              <IconCheck size={11} />
                            ) : row.decision.kind === 'unknown' ? (
                              <IconInfo size={11} />
                            ) : (
                              <IconWarning size={11} />
                            )}
                            {decisionBadgeMeta(row.decision).label}
                          </span>
                        </Badge>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                          {row.decision.reason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="ai-assumptions-title">
            <h3 id="ai-assumptions-title" className="mb-2 text-sm font-semibold text-slate-900">
              Asumsi AI
            </h3>
            {assumptions.length > 0 ? (
              <ul className="space-y-2">
                {assumptions.map((assumption, index) => {
                  const confidence = assumption.confidence
                  return (
                    <li
                      key={`${assumption.topic ?? 'asumsi'}-${index}`}
                      className="rounded border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-slate-800">
                          {redactSensitiveText(assumption.topic || 'Umum')}
                        </span>
                        {confidence && <Badge tone={confidenceTone(confidence)}>{confidence}</Badge>}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        {redactSensitiveText(assumption.description || '—')}
                      </p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                Respons AI tidak memuat asumsi.
              </p>
            )}
          </section>

          <details className="rounded border border-slate-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
              JSON mentah
            </summary>
            <div className="border-t border-slate-200 p-4">
              <p className="mb-2 text-[11px] text-slate-500">
                Objek hasil Gemini terstruktur yang disimpan setelah allowlist/DLP. Field
                credential, request, screenshot, atau binary disamarkan atau dibuang.
              </p>
              <pre className="max-h-[32rem] overflow-auto rounded bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-100">
                {rawJson}
              </pre>
            </div>
          </details>
        </div>
      )}
    </Card>
  )
}

function MetadataItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-xs">{children}</div>
    </div>
  )
}

function SectionCards({
  sections,
  emptyText,
}: {
  sections: Array<ReconstructionSection | AIResultSection>
  emptyText: string
}) {
  if (sections.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500">
        {emptyText}
      </p>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {sections.map((section, index) => {
        const types = sectionTypes(section)
        const itemCount = sectionItemCount(section)
        return (
          <div
            key={`${sectionTitle(section, index)}-${index}`}
            className="rounded border border-slate-200 bg-slate-50 p-3"
          >
            <p className="text-[13px] font-medium text-slate-800">
              {sectionTitle(section, index)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {types.length > 0 ? types.join(', ') : 'Tipe tidak ditentukan'}
              {itemCount !== undefined ? ` · ${itemCount} item` : ''}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function RegionItem({ label, box }: { label: string; box: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
        <IconInfo size={13} className="text-slate-400" />
        {label}
      </div>
      <p className="mt-1 font-mono text-[11px] text-slate-500">{box}</p>
    </div>
  )
}
