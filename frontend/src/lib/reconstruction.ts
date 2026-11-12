import { api } from './api'

export interface ReconstructionComponent {
  id: number
  region: string
  component_type: string
  label: string | null
  props: { box?: { x: number; y: number; w: number; h: number }; [key: string]: unknown } | null
  order_index: number
  source: string
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

export interface Reconstruction {
  id: number
  screen_id: number
  project_id: number
  status: 'draft' | 'in_review' | 'approved' | 'rejected'
  layout: {
    viewport?: { width: number; height: number }
    regions?: {
      sidebar?: { x: number; y: number; w: number; h: number } | null
      header?: { x: number; y: number; w: number; h: number } | null
      main?: { x: number; y: number; w: number; h: number } | null
    }
    has_sidebar?: boolean
    has_header?: boolean
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

export const reconstructionApi = {
  analyze: (screenId: number) =>
    api.post<Reconstruction>(`/reconstructions/screen/${screenId}`),
  get: (screenId: number) => api.get<Reconstruction>(`/reconstructions/screen/${screenId}`),
  updateCode: (screenId: number, code: string) =>
    api.patch<Reconstruction>(`/reconstructions/screen/${screenId}/code`, { code_text: code }),
  updateComponent: (
    id: number,
    body: Partial<Pick<ReconstructionComponent, 'label' | 'notes' | 'region' | 'component_type'>>,
  ) => api.patch<ReconstructionComponent>(`/reconstructions/component/${id}`, body),
  resolve: (id: number) =>
    api.post<ReconstructionAssumption>(`/reconstructions/assumption/${id}/resolve`),
  unresolve: (id: number) =>
    api.post<ReconstructionAssumption>(`/reconstructions/assumption/${id}/unresolve`),
  review: (screenId: number, status: 'draft' | 'in_review' | 'approved' | 'rejected') =>
    api.post<Reconstruction>(`/reconstructions/screen/${screenId}/review`, { status }),
  listProject: (projectId: number) =>
    api.get<Reconstruction[]>(`/reconstructions/project/${projectId}`),
}
