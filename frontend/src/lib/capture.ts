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
  device?: string
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
  // Enhanced detection fields
  percent_box?: { x: number; y: number; w: number; h: number } | null
  source?: string
  tag?: string | null
  href?: string | null
  target?: string | null
  role?: string | null
  input_type?: string | null
  parent_element_id?: string | null
  state?: string | null
  confidence?: number
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

export interface WorkerProcessInfo {
  pid: number
  windows_session_id: number | null
  /** true kalau worker berjalan di sesi interaktif (SessionId != 0 + ada desktop) */
  interactive: boolean
  browser_children: Array<{ pid: number; name: string; windows_session_id: number | null }>
}

export interface WorkerHealth extends WorkerProcessInfo {
  status: string
  role: string
  headless: boolean
}

export interface WorkerState {
  status: string
  session_id: string | null
  current_url?: string | null
  current_title?: string | null
  event_count?: number
  last_capture?: { file_name: string; url: string; title: string; captured_at: number } | null
  process?: WorkerProcessInfo
  capture_states?: string[]
  har_count?: number
  component_states_count?: number
  form_schemas_count?: number
}

/** ====== RECONSTRUCTION TYPES ====== */

export interface HarEntry {
  request: {
    url: string
    method: string
    headers: Record<string, string>
    postData: string | null
  }
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
    body: any
  }
  timings: { duration: number }
  startedDateTime: string
  error?: string
}

export interface StorageSnapshot {
  timestamp: number
  url: string
  localStorage: Record<string, string>
  sessionStorage: Record<string, string>
}

export interface ComponentState {
  type: 'dropdown' | 'modal' | 'tabs' | 'accordion'
  selector: string
  label: string
  isOpen: boolean
  options?: string[]
  tabs?: string[]
  activeIndex?: number
  boundingBox?: { x: number; y: number; w: number; h: number }
}

export interface FormFieldSchema {
  name: string
  type: string
  tag: string
  label: string
  required: boolean
  placeholder: string
  options: Array<{ value: string; label: string; selected: boolean }>
  checked?: boolean
}

export interface FormSchema {
  formIndex: number
  selector: string
  action: string
  method: string
  fields: FormFieldSchema[]
  boundingBox: { x: number; y: number; w: number; h: number }
}

export interface CaptureStateMeta {
  state_name: string
  url: string
  title: string
  viewport: { width: number; height: number }
  full_page: boolean
  captured_at: number
  sha256: string
  file_path: string
  file_name: string
  elements: ScreenElement[]
  structure: any
  interactions: any[]
  detection_report: any
}

export interface SessionData {
  session_id: string
  url: string
  allowed_hosts: string[]
  captures: Record<string, CaptureStateMeta>
  har_entries: HarEntry[]
  storage_snapshots: StorageSnapshot[]
  component_states: Record<string, ComponentState>
  form_schemas: FormSchema[]
  html_exports: Record<string, string>
  events: any[]
}

export const captureApi = {
  listSessions: (projectId: number) =>
    api.get<{ items: CaptureSession[]; total: number }>(`/projects/${projectId}/capture-sessions`),
  createSession: (
    projectId: number,
    notes?: string,
    device: 'desktop' | 'tablet' | 'phone' = 'desktop',
  ) =>
    api.post<CaptureSession>(`/projects/${projectId}/capture-sessions`, { notes, device }),
  launchConfig: (sessionId: number) =>
    api.get<{
      url: string
      allowed_hosts: string[]
      viewport_width: number | null
      viewport_height: number | null
      device: string
    }>(`/capture-sessions/${sessionId}/launch-config`),
  importCapture: (sessionId: number, payload: Record<string, unknown>) =>
    api.post<Screen>(`/capture-sessions/${sessionId}/capture/import`, payload),
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

/**
 * Panggil Capture Worker yang berjalan DI PERANGKAT OPERATOR itu sendiri
 * (http://127.0.0.1:8010), bukan lewat backend server.
 *
 * Dengan begitu, saat operator membuka panel admin dari HP atau laptop lain,
 * jendela browser akan terbuka di perangkat yang bersangkutan — bukan di mesin
 * yang menjalankan backend. Worker hanya listen di loopback (127.0.0.1), jadi
 * hanya browser pada perangkat yang sama yang bisa memanggilnya.
 */
const STORAGE_KEY_WORKER_URL = 'nigmasim_capture_worker_url'

export function getWorkerUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_WORKER_URL)
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '')
  }
  return (
    import.meta.env.VITE_CAPTURE_WORKER_URL ??
    import.meta.env.VITE_WORKER_URL ??
    'http://127.0.0.1:8010'
  )
}

export function setWorkerUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (!url || !url.trim()) {
      localStorage.removeItem(STORAGE_KEY_WORKER_URL)
    } else {
      localStorage.setItem(STORAGE_KEY_WORKER_URL, url.trim().replace(/\/+$/, ''))
    }
  }
}

async function workerRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const base = getWorkerUrl()
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) {
    let msg = `Worker tidak merespons (${res.status})`
    try {
      const data = await res.json()
      if (data && typeof data === 'object' && 'detail' in data) {
        msg = String((data as { detail: unknown }).detail)
      }
    } catch {
      const text = await res.text().catch(() => '')
      if (text) msg = text
    }
    const err = new Error(msg)
    ;(err as any).status = res.status
    throw err
  }
  return res.json() as Promise<T>
}

export const workerApi = {
  startSession: (body: {
    url: string
    viewport_width?: number | null
    viewport_height?: number | null
    allowed_hosts: string[]
    device: string
  }) =>
    workerRequest('/session/start', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  capture: (body: { label?: string; full_page?: boolean; include_image?: boolean }) =>
    workerRequest('/session/capture', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  captureState: (body: { state_name: string; label?: string; full_page?: boolean }) =>
    workerRequest('/session/capture-state', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  health: () => workerRequest<WorkerHealth>('/health'),
  processInfo: () => workerRequest<WorkerProcessInfo>('/process'),
  state: () => workerRequest<WorkerState>('/session/state'),
  focus: () => workerRequest('/session/focus', { method: 'POST', body: '{}' }),
  pause: () => workerRequest('/session/pause', { method: 'POST', body: '{}' }),
  resume: () => workerRequest('/session/resume', { method: 'POST', body: '{}' }),
  stop: () => workerRequest('/session/stop', { method: 'POST', body: '{}' }),
  // Reconstruction endpoints
  har: () => workerRequest<HarEntry[]>('/session/har'),
  storage: () => workerRequest<StorageSnapshot>('/session/storage'),
  componentStates: () => workerRequest<Record<string, ComponentState>>('/session/component-states'),
  formSchemas: () => workerRequest<FormSchema[]>('/session/form-schemas'),
  savePage: (exportName?: string) => workerRequest('/session/save-page', {
    method: 'POST',
    body: JSON.stringify({ export_name: exportName }),
  }),
  sessionData: () => workerRequest<SessionData>('/session/data'),
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
