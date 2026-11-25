import { api } from './api'

export interface ReconstructionComponent {
  id: number
  region: string
  component_type: string
  label: string | null
  props: { box?: { x: number; y: number; w: number; h: number }; [key: string]: unknown } | null
  order_index: number
  source: string
  element_type: string
  config_json: string | null
  notes: string | null
}

export interface ReconstructionAssumption {
  id: number
  topic: string
  description: string
  confidence: 'high' | 'medium' | 'low'
  resolved: boolean
  resolved_at: string | null
}

export interface AIResultBox {
  x: number
  y: number
  w: number
  h: number
}

export interface AIResultComponent {
  region?: string
  component_type?: string
  label?: string | null
  props?: {
    box?: AIResultBox
    confidence?: number | string
    [key: string]: unknown
  } | null
  box?: AIResultBox
  source?: 'ai-vision' | 'manual' | 'detected' | string
  confidence?: number | string | null
  [key: string]: unknown
}

export interface AIResultAssumption {
  topic?: string
  description?: string
  confidence?: 'high' | 'medium' | 'low' | string
  [key: string]: unknown
}

export interface AIResultSection {
  index?: number
  label?: string
  name?: string
  types?: string[]
  item_count?: number
  items?: Array<{ type?: string; label?: string | null }>
  [key: string]: unknown
}

export interface AIResultLayout {
  regions?: {
    sidebar?: (AIResultBox & { item_count?: number }) | null
    header?: AIResultBox | null
    main?: AIResultBox | null
  }
  has_sidebar?: boolean
  has_header?: boolean
  sections?: AIResultSection[]
  [key: string]: unknown
}

export interface AIResult {
  components?: AIResultComponent[]
  assumptions?: AIResultAssumption[]
  layout?: AIResultLayout
  [key: string]: unknown
}

export interface ReconstructionSection {
  index: number
  label: string
  types: string[]
  top: number
  bottom: number
  height: number
  x: number
  width: number
  width_ratio: number
  item_count: number
  items: Array<{ type: string; label?: string | null }>
}

export interface ReconstructionTheme {
  page?: {
    backgroundColor?: string
    fontFamily?: string
  }
  primary?: {
    backgroundColor?: string
    color?: string
    borderRadius?: string
    fontWeight?: string
  }
  text?: {
    heading?: {
      color?: string
      fontSize?: string
      fontWeight?: string
    }
    body?: {
      color?: string
      fontSize?: string
      fontWeight?: string
    }
  }
  card?: {
    box?: { x: number; y: number; w: number; h: number }
    backgroundColor?: string
    borderColor?: string
    borderRadius?: string
    boxShadow?: string
  }
}

export interface Reconstruction {
  id: number
  screen_id: number
  project_id: number
  status: 'draft' | 'in_review' | 'approved' | 'rejected'
  layout: {
    viewport?: { width: number; height: number }
    regions?: {
      sidebar?: ({ x: number; y: number; w: number; h: number } & { item_count?: number }) | null
      header?: { x: number; y: number; w: number; h: number } | null
      main?: { x: number; y: number; w: number; h: number } | null
    }
    has_sidebar?: boolean
    has_header?: boolean
    sections?: ReconstructionSection[]
    tombstones?: string[]
    overrides?: Record<string, any>
    ai_status?: 'success' | 'failed' | 'not_configured'
    ai_model?: string
    ai_error?: string
    ai_source?: 'hybrid' | 'fallback' | 'rule-engine' | 'ai-vision'
    ai_analyzed_at?: string
    ai_result?: AIResult | null
    ai_result_truncated?: boolean
    ai_result_size_bytes?: number
    theme?: ReconstructionTheme | null
  } | null
  code_text: string | null
  generated_by: string
  reviewed_by: number | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  components: ReconstructionComponent[]
  assumptions: ReconstructionAssumption[]
}

export interface HotspotStateOut {
  deleted: string[]
  overrides: Record<string, any>
}

export interface HotspotStateIn {
  deleted: string[]
  overrides: Record<string, any>
}

export interface AIAnalyzeRequest {
  force_refresh?: boolean
}

export interface AIAnalyzeResponse {
  components_added: number
  assumptions_added: number
  layout_updated: boolean
  message: string
  status: 'success' | 'failed' | 'not_configured'
  error?: string | null
}

export interface UsabilityCheckResult {
  usable_count: number
  valid_components: number
  section_items: number
  sections_count: number
  warning: string | null
}

export const reconstructionApi = {
  analyze: (screenId: number) =>
    api.post<Reconstruction>(`/reconstructions/screen/${screenId}`),
  get: (screenId: number) => api.get<Reconstruction>(`/reconstructions/screen/${screenId}`),
  updateCode: (screenId: number, code: string) =>
    api.patch<Reconstruction>(`/reconstructions/screen/${screenId}/code`, { code_text: code }),
  updateComponent: (
    id: number,
    body: Partial<Pick<ReconstructionComponent, 'label' | 'notes' | 'region' | 'component_type' | 'element_type' | 'config_json' | 'props'>>,
  ) => api.patch<ReconstructionComponent>(`/reconstructions/component/${id}`, body),
  createComponent: (
    screenId: number,
    body: {
      region?: string
      component_type: string
      label?: string
      props?: { box?: { x: number; y: number; w: number; h: number }; action?: string } | null
      element_type?: string
      config_json?: string | null
      notes?: string
    },
  ) => api.post<ReconstructionComponent>(`/reconstructions/component?screen_id=${screenId}`, body),
  deleteComponent: (id: number) =>
    api.delete<{ success: boolean }>(`/reconstructions/component/${id}`),
  resolve: (id: number) =>
    api.post<ReconstructionAssumption>(`/reconstructions/assumption/${id}/resolve`),
  unresolve: (id: number) =>
    api.post<ReconstructionAssumption>(`/reconstructions/assumption/${id}/unresolve`),
  review: (screenId: number, status: 'draft' | 'in_review' | 'approved' | 'rejected') =>
    api.post<Reconstruction>(`/reconstructions/screen/${screenId}/review`, { status }),
  listProject: (projectId: number) =>
    api.get<Reconstruction[]>(`/reconstructions/project/${projectId}`),
  aiAnalyze: (screenId: number, forceRefresh = false) =>
    api.post<AIAnalyzeResponse>(
      `/reconstructions/screen/${screenId}/ai-analyze`,
      { force_refresh: forceRefresh },
    ),
  getHotspotState: (screenId: number) =>
    api.get<HotspotStateOut>(`/reconstructions/screen/${screenId}/hotspot-state`),
  updateHotspotState: (screenId: number, state: HotspotStateIn) =>
    api.put<HotspotStateOut>(`/reconstructions/screen/${screenId}/hotspot-state`, state),
  checkUsability: (screenId: number) =>
    api.get<UsabilityCheckResult>(`/reconstructions/screen/${screenId}/usability`),
}
