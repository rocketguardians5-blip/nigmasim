import { api } from './api'

export interface DocStep {
  no: number
  instruction: string
  expected?: string | null
  warning?: string | null
  screen_id?: number | null
  screen_title?: string | null
  screenshot?: string | null
  image?: string | null
}

export interface DocContent {
  purpose: string
  scope: string
  role: string
  prerequisites: string[]
  warnings: string[]
  steps: DocStep[]
  workflow?: {
    name: string
    states: { key: string; label: string; role?: string }[]
    transitions: { from: string; to: string; action: string; label: string; role?: string }[]
  } | null
  branding: { company: string; application: string; logo?: string }
  revision: { version: string; date: string; author: string }
}

export interface GeneratedDocument {
  id: number
  project_id: number
  simulation_id: number | null
  title: string
  doc_type: string
  description: string | null
  content: DocContent
  markdown: string
  html: string
  status: 'draft' | 'published'
  version: string
  created_at: string
  updated_at: string
}

export interface DocumentSummary {
  id: number
  title: string
  doc_type: string
  status: string
  version: string
  step_count: number
  updated_at: string
}

export const documentsApi = {
  list: (projectId: number) =>
    api.get<DocumentSummary[]>(`/documents/project/${projectId}`),
  generate: (body: {
    project_id: number
    title: string
    doc_type: string
    simulation_id?: number | null
    tutorial_id?: number | null
  }) => api.post<GeneratedDocument>('/documents/generate', body),
  get: (id: number) => api.get<GeneratedDocument>(`/documents/${id}`),
  update: (id: number, body: { content: DocContent; title?: string }) =>
    api.patch<GeneratedDocument>(`/documents/${id}`, body),
  publish: (id: number, body: { status: string; version?: string }) =>
    api.post<GeneratedDocument>(`/documents/${id}/publish`, body),
  downloadUrl: (id: number, format: 'pdf' | 'html' | 'md') =>
    `/documents/${id}/download?format=${format}`,
}
