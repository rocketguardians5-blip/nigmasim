/**
 * Klien API untuk modul Capture & Screen Repository.
 */

import { api, fetchBlobUrl } from './api'

export interface CaptureSession {
  id: number
  project_id: number
  operator_id: number
  status: string
  viewport_width: number
  viewport_height: number
  browser_mode: string
  started_at: string | null
  ended_at: string | null
  notes: string | null
  created_at: string
}

export interface ScreenElement {
  id: number
  screen_id: number
  element_type: string
  label: string | null
  selector_or_hint: string | null
  bounding_box: { x: number; y: number; w: number; h: number } | null
  mask: boolean
  notes: string | null
}

export interface Interaction {
  id: number
  screen_id: number
  sequence_no: number
  action: string
  target_element_id: number | null
  expected_result: string | null
  notes: string | null
}

export interface Screen {
  id: number
  project_id: number
  capture_session_id: number | null
  screen_key: string
  title: string
  route_label: string | null
  source_url: string | null
  screenshot_path: string
  full_page: boolean
  capture_version: number
  category: string | null
  parent_id: number | null
  tags: string[]
  review_status: 'pending' | 'approved' | 'rejected'
  reviewed_by: number | null
  reviewed_at: string | null
  notes: string | null
  captured_at: string
  created_at: string
  updated_at: string
}

export interface ScreenVersion {
  id: number
  screen_key: string
  title: string
  capture_version: number
  review_status: string
  captured_at: string
  source_url: string | null
}

export interface ScreenCategory {
  name: string
  count: number
}

export interface NavigationNode {
  id: number
  title: string
  screen_key: string
  route_label: string | null
  capture_version: number
  review_status: string
  children: NavigationNode[]
}

export interface WorkerState {
  status: string
  session_id: string | null
  current_url?: string | null
  current_title?: string | null
  event_count?: number
  last_capture?: { file_name: string; url: string; title: string; captured_at: number } | null
}

export const captureApi = {
  listSessions: (projectId: number) =>
    api.get<{ items: CaptureSession[]; total: number }>(`/projects/${projectId}/capture-sessions`),
  createSession: (projectId: number, notes?: string) =>
    api.post<CaptureSession>(`/projects/${projectId}/capture-sessions`, { notes }),
  start: (sessionId: number) => api.post<CaptureSession>(`/capture-sessions/${sessionId}/start`),
  pause: (sessionId: number) => api.post<CaptureSession>(`/capture-sessions/${sessionId}/pause`),
  resume: (sessionId: number) => api.post<CaptureSession>(`/capture-sessions/${sessionId}/resume`),
  stop: (sessionId: number) => api.post<CaptureSession>(`/capture-sessions/${sessionId}/stop`),
  state: (sessionId: number) => api.get<WorkerState>(`/capture-sessions/${sessionId}/state`),
  focus: (sessionId: number) => api.post<{ status: string; url: string }>(`/capture-sessions/${sessionId}/focus`),
  capture: (sessionId: number, title?: string, fullPage = false) => {
    const query = new URLSearchParams({ full_page: String(fullPage) })
    if (title) query.set('title', title)
    return api.post<Screen>(`/capture-sessions/${sessionId}/capture?${query.toString()}`)
  },
}

export const screensApi = {
  list: (
    projectId: number,
    params: {
      search?: string
      tag?: string
      review_status?: string
      category?: string
      latest_only?: boolean
    } = {},
  ) => {
    const query = new URLSearchParams({ page_size: '100' })
    if (params.search) query.set('search', params.search)
    if (params.tag) query.set('tag', params.tag)
    if (params.review_status) query.set('review_status', params.review_status)
    if (params.category) query.set('category', params.category)
    if (params.latest_only) query.set('latest_only', 'true')
    return api.get<{ items: Screen[]; total: number }>(`/projects/${projectId}/screens?${query.toString()}`)
  },
  categories: (projectId: number) =>
    api.get<ScreenCategory[]>(`/projects/${projectId}/screen-categories`),
  versions: (screenId: number) => api.get<ScreenVersion[]>(`/screens/${screenId}/versions`),
  navigationMap: (projectId: number) =>
    api.get<NavigationNode[]>(`/projects/${projectId}/navigation-map`),
  recapture: (screenId: number) => api.post<Screen>(`/screens/${screenId}/recapture`),
  update: (
    screenId: number,
    body: Partial<
      Pick<Screen, 'title' | 'tags' | 'notes' | 'route_label' | 'category'> & {
        parent_screen_id?: number | null
      }
    >,
  ) => api.patch<Screen>(`/screens/${screenId}`, body),
  review: (screenId: number, review_status: 'pending' | 'approved' | 'rejected', notes?: string) =>
    api.post<Screen>(`/screens/${screenId}/review`, { review_status, notes }),
  remove: (screenId: number) => api.delete<{ message: string }>(`/screens/${screenId}`),
  elements: (screenId: number) => api.get<ScreenElement[]>(`/screens/${screenId}/elements`),
  addElement: (
    screenId: number,
    body: {
      element_type: string
      label?: string
      bounding_box?: { x: number; y: number; w: number; h: number }
      mask?: boolean
    },
  ) => api.post<ScreenElement>(`/screens/${screenId}/elements`, body),
  updateElement: (
    elementId: number,
    body: Partial<{ label: string; mask: boolean; bounding_box: Record<string, number>; notes: string }>,
  ) => api.patch<ScreenElement>(`/elements/${elementId}`, body),
  removeElement: (elementId: number) => api.delete<{ message: string }>(`/elements/${elementId}`),
  interactions: (screenId: number) => api.get<Interaction[]>(`/screens/${screenId}/interactions`),
  screenshotPath: (screenId: number, masked = true) =>
    `/screens/${screenId}/screenshot?masked=${masked}`,
  screenshotUrl: (screenId: number, masked = true) =>
    fetchBlobUrl(`/screens/${screenId}/screenshot?masked=${masked}`),
}
