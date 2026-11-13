/**
 * Klien API untuk modul Demo Publik dan Skenario Demo (Phase 7).
 */

import { request } from './api'

export interface DemoLink {
  id: number
  token: string
  name: string
  description: string | null
  project_id: number | null
  screen_ids: number[]
  is_active: boolean
  expires_at: string | null
  view_count: number
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface DemoLinkCreate {
  name: string
  description?: string | null
  project_id?: number | null
  screen_ids?: number[]
  password?: string | null
  is_active?: boolean
  expires_at?: string | null
}

export interface DemoLinkUpdate {
  name?: string
  description?: string | null
  project_id?: number | null
  screen_ids?: number[] | null
  password?: string | null
  is_active?: boolean
  expires_at?: string | null
}

export interface DemoLinkPublic {
  token: string
  name: string
  description: string | null
  screen_ids: number[]
  is_active: boolean
  expires_at: string | null
  password_required: boolean
}

export interface DemoAccessResult {
  access_granted: boolean
  token: string
  name: string
  description: string | null
  screen_ids: number[]
  password_required: boolean
  message: string | null
}

export interface DemoScenarioStep {
  screen_id: number
  title: string
  instructor_notes?: string | null
}

export interface DemoScenario {
  id: number
  name: string
  description: string | null
  steps: DemoScenarioStep[]
  is_template: boolean
  project_id: number | null
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface DemoScenarioCreate {
  name: string
  description?: string | null
  steps?: DemoScenarioStep[]
  is_template?: boolean
  project_id?: number | null
}

export interface DemoScenarioUpdate {
  name?: string
  description?: string | null
  steps?: DemoScenarioStep[] | null
  is_template?: boolean
  project_id?: number | null
}

export const demoApi = {
  // ---------- Demo Links (auth required) ----------
  listLinks: (projectId?: number) => {
    const query = new URLSearchParams()
    if (projectId) query.set('project_id', String(projectId))
    return request<DemoLink[]>(`/demo-links${query.toString() ? '?' + query.toString() : ''}`)
  },
  createLink: (body: DemoLinkCreate) =>
    request<DemoLink>('/demo-links', { method: 'POST', body: JSON.stringify(body) }),
  getLink: (id: number) => request<DemoLink>(`/demo-links/${id}`),
  updateLink: (id: number, body: DemoLinkUpdate) =>
    request<DemoLink>(`/demo-links/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLink: (id: number) =>
    request<{ message: string }>(`/demo-links/${id}`, { method: 'DELETE' }),

  // ---------- Demo Scenarios (auth required) ----------
  listScenarios: (projectId?: number, isTemplate?: boolean) => {
    const query = new URLSearchParams()
    if (projectId) query.set('project_id', String(projectId))
    if (isTemplate !== undefined) query.set('is_template', String(isTemplate))
    return request<DemoScenario[]>(`/demo-scenarios${query.toString() ? '?' + query.toString() : ''}`)
  },
  createScenario: (body: DemoScenarioCreate) =>
    request<DemoScenario>('/demo-scenarios', { method: 'POST', body: JSON.stringify(body) }),
  getScenario: (id: number) => request<DemoScenario>(`/demo-scenarios/${id}`),
  updateScenario: (id: number, body: DemoScenarioUpdate) =>
    request<DemoScenario>(`/demo-scenarios/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteScenario: (id: number) =>
    request<{ message: string }>(`/demo-scenarios/${id}`, { method: 'DELETE' }),

  // ---------- Public Demo (no auth) ----------
  getPublicDemo: (token: string) =>
    request<DemoLinkPublic>(`/public/demo/${token}`),
  verifyDemoPassword: (token: string, password: string) =>
    request<DemoAccessResult>(`/public/demo/${token}/verify`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  getDemoScreens: (token: string, demoToken?: string) => {
    const headers: Record<string, string> = {}
    if (demoToken) headers['X-Demo-Token'] = `demo:${token}`
    return request<any[]>(
      `/public/demo/${token}/screens`,
      { method: 'GET', headers },
    )
  },
}
