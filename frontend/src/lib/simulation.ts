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
