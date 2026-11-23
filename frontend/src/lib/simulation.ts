import { api } from './api'

export interface SimColumn {
  key: string
  label: string
  type: string
}

export interface SimRow {
  _id: string
  [key: string]: unknown
}

export interface SimLayout {
  subtitle?: string
  title?: string
  visual_mode?: boolean
  screenshot_path?: string
  viewport?: { width: number; height: number } | null
  hotspots?: Array<{
    id: number
    label: string
    type: string
    box: { x: number; y: number; w: number; h: number }
    target_screen_key: string | null
    element_type?: 'button' | 'dropdown' | 'input_data'
    config_json?: string
    action?: string
  }>
  cards?: { label: string; dataset?: string | null; field?: string | null }[]
  table?: { dataset: string | null; columns: string[]; page_size?: number } | null
  form?: {
    dataset: string | null
    fields: { key: string; label: string; type: string; required?: boolean }[]
    submit_label?: string
  } | null
  buttons?: { label: string; action: string; variant?: string }[]
}

export interface SimScreen {
  key: string
  title: string
  route: string
  layout: SimLayout
  actions: unknown[]
  source_screen_id: number | null
}

export interface SimulationDefinition {
  id: number
  project_id: number
  name: string
  description: string | null
  status: string
  screens: SimScreen[]
  datasets: Record<string, { schema: SimColumn[]; rows: SimRow[] }>
}

export interface SimDatasetInfo {
  name: string
  description: string | null
  schema: SimColumn[]
  row_count: number
}

export interface HotspotTargetMap {
  [screenKey: string]: {
    [hotspotId: number]: string
  }
}

/* ---------------- Generator runtime (Stage 2) ---------------- */

export interface GeneratedScreenInfo {
  key: string
  title: string
  route: string
  kind: string
}

export interface RuntimeScreenError {
  screen_key: string | null
  screen_title: string | null
  reason: string
}

export interface RuntimeSkippedScreen {
  screen_key: string
  screen_title: string
  screen_id: number
  capture_version: number
  reason: string
}

export interface RuntimeAssumptionItem {
  topic: string
  description: string
  confidence: string
  resolved: boolean
}

export interface RuntimeAssumptionGroup {
  screen_title: string
  route: string
  items: RuntimeAssumptionItem[]
}

export interface GenerateSimulationResult {
  slug: string
  name: string
  assumptions: RuntimeAssumptionGroup[]
  screens: GeneratedScreenInfo[]
  errors: RuntimeScreenError[]
  skipped: RuntimeSkippedScreen[]
  runtime_path: string
  runtime_dir: string
  backup_dir: string | null
  generated_at: string
}

export interface ProjectRuntimeInfo {
  exists: boolean
  slug?: string
  name?: string
  description?: string
  project_id?: number
  application_id?: number
  application_name?: string
  generated_at?: string
  runtime_path?: string
  screens?: GeneratedScreenInfo[]
  errors?: RuntimeScreenError[]
  skipped?: RuntimeSkippedScreen[]
  assumptions?: RuntimeAssumptionGroup[]
}

export const simulationApi = {
  generate: (projectId: number, body: { overwrite?: boolean } = {}) =>
    api.post<GenerateSimulationResult>(`/simulation/project/${projectId}/generate`, body),
  runtime: (projectId: number) =>
    api.get<ProjectRuntimeInfo>(`/simulation/project/${projectId}/runtime`),
  build: (
    projectId: number,
    body: {
      name?: string
      visual_mode?: boolean
      hotspot_targets?: HotspotTargetMap
    },
  ) =>
    api.post<SimulationDefinition>(`/simulation/project/${projectId}`, body),
  updateScreenLayout: (
    simulationId: number,
    body: {
      screens: Array<{
        screen_key: string
        layout: Record<string, unknown>
      }>
    },
  ) =>
    api.patch<SimulationDefinition>(`/simulation/${simulationId}/screens/layout`, body),
  resyncAll: (simulationId: number) =>
    api.post<SimulationDefinition>(`/simulation/${simulationId}/resync-all`),
  getByProject: (projectId: number) =>
    api.get<SimulationDefinition>(`/simulation/project/${projectId}`),
  get: (simulationId: number) => api.get<SimulationDefinition>(`/simulation/${simulationId}`),
  remove: (projectId: number) => api.delete<{ message: string }>(`/simulation/project/${projectId}`),
  datasets: (simulationId: number) => api.get<SimDatasetInfo[]>(`/simulation/${simulationId}/datasets`),
  addRow: (simulationId: number, dataset: string, row: Record<string, unknown>) =>
    api.post<SimRow>(`/simulation/${simulationId}/datasets/${dataset}/rows`, row),
  addRows: (simulationId: number, dataset: string, rows: Record<string, unknown>[]) =>
    api.post<{ message: string; total: number }>(
      `/simulation/${simulationId}/datasets/${dataset}/rows/bulk`,
      { rows },
    ),
  updateRow: (simulationId: number, dataset: string, rowId: string, row: Record<string, unknown>) =>
    api.patch<SimRow>(`/simulation/${simulationId}/datasets/${dataset}/rows/${rowId}`, row),
  deleteRow: (simulationId: number, dataset: string, rowId: string) =>
    api.delete<{ message: string }>(`/simulation/${simulationId}/datasets/${dataset}/rows/${rowId}`),
  reset: (simulationId: number) =>
    api.post<{ message: string }>(`/simulation/${simulationId}/reset`),
}

/* ---------------- Workflow (alur approval) ---------------- */

export interface WorkflowState {
  key: string
  label: string
  role?: string
}

export interface WorkflowTransition {
  from: string
  to: string
  action: string
  label: string
  role?: string
}

export interface WorkflowDefinition {
  id: number
  simulation_id: number
  name: string
  states: WorkflowState[]
  transitions: WorkflowTransition[]
  initial_state: string
  state_field: string | null
}

export interface WorkflowRecord {
  row_id: string
  dataset: string
  current_state: string
  history: {
    state: string
    action: string
    by: string
    by_role: string
    at: string
    note?: string | null
  }[]
}

export const workflowApi = {
  get: (simulationId: number) => api.get<WorkflowDefinition>(`/simulation/${simulationId}/workflow`),
  update: (simulationId: number, body: Partial<WorkflowDefinition>) =>
    api.put<WorkflowDefinition>(`/simulation/${simulationId}/workflow`, body),
  reset: (simulationId: number) =>
    api.post<WorkflowDefinition>(`/simulation/${simulationId}/workflow/default`),
  records: (simulationId: number, dataset?: string) =>
    api.get<WorkflowRecord[]>(
      `/simulation/${simulationId}/workflow/records${dataset ? `?dataset=${dataset}` : ''}`,
    ),
  transition: (
    simulationId: number,
    body: { dataset: string; row_id: string; action: string; role: string; note?: string },
  ) =>
    api.post<{ row_id: string; current_state: string; history: WorkflowRecord['history'] }>(
      `/simulation/${simulationId}/workflow/transition`,
      body,
    ),
  resetRecords: (simulationId: number) =>
    api.post<{ message: string }>(`/simulation/${simulationId}/workflow/records/reset`),
}

/* ---------------- Tutorial (guided walkthrough) ---------------- */

export interface TutorialStep {
  no: number
  screen: string | null
  target: string | null
  instruction: string
  expected?: string | null
}

export interface Tutorial {
  id: number
  simulation_id: number
  title: string
  description: string | null
  status: string
  steps: TutorialStep[]
}

export const tutorialApi = {
  list: (simulationId: number) => api.get<Tutorial[]>(`/simulation/${simulationId}/tutorials`),
  create: (simulationId: number, body: { title: string; description?: string; steps: TutorialStep[] }) =>
    api.post<Tutorial>(`/simulation/${simulationId}/tutorials`, body),
  update: (simulationId: number, tutorialId: number, body: Partial<Tutorial>) =>
    api.put<Tutorial>(`/simulation/${simulationId}/tutorials/${tutorialId}`, body),
  remove: (simulationId: number, tutorialId: number) =>
    api.delete<{ message: string }>(`/simulation/${simulationId}/tutorials/${tutorialId}`),
}
