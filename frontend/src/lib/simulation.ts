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

export const simulationApi = {
  build: (projectId: number, name: string) =>
    api.post<SimulationDefinition>(`/simulation/project/${projectId}?name=${encodeURIComponent(name)}`),
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
