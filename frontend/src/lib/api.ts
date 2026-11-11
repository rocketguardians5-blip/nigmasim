/**
 * Klien API NigmaSim.
 *
 * Semua request menyertakan access token. Bila token kedaluwarsa (401),
 * sistem mencoba refresh sekali, lalu mengulang request.
 */

const BASE: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

const ACCESS_KEY = 'nigmasim.access'
const REFRESH_KEY = 'nigmasim.refresh'

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  save(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/* ---------- Tipe data ---------- */

export interface Role {
  id: number
  name: string
  description: string | null
  permissions: string[]
}

export interface User {
  id: number
  name: string
  email: string
  status: 'active' | 'disabled'
  role: Role
  last_login_at: string | null
  created_at: string
}

export interface Application {
  id: number
  name: string
  description: string | null
  owner: string | null
  category: string | null
  source_url: string
  login_url: string | null
  environment_label: string
  authorization_status: 'pending' | 'approved' | 'revoked'
  authorization_ref: string | null
  authorization_note: string | null
  logo_path: string | null
  version_label: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: number
  application_id: number
  name: string
  description: string | null
  version: string
  status: 'draft' | 'capturing' | 'building' | 'published' | 'archived'
  created_at: string
  updated_at: string
}

export interface Page<T> {
  items: T[]
  page: number
  page_size: number
  total: number
}

export interface MeResponse {
  user: User
  permissions: string[]
}

/* ---------- Inti request ---------- */

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown }
}

async function toError(response: Response): Promise<ApiError> {
  let body: ErrorBody | null = null
  try {
    body = (await response.json()) as ErrorBody
  } catch {
    body = null
  }
  return new ApiError(
    response.status,
    body?.error?.code ?? 'UNKNOWN',
    body?.error?.message ?? `Permintaan gagal (${response.status})`,
    body?.error?.details,
  )
}

let refreshInFlight: Promise<boolean> | null = null

async function refreshSession(): Promise<boolean> {
  const refresh = tokenStore.refresh
  if (!refresh) return false

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        })
        if (!response.ok) {
          tokenStore.clear()
          return false
        }
        const data = (await response.json()) as { access_token: string; refresh_token: string }
        tokenStore.save(data.access_token, data.refresh_token)
        return true
      } catch {
        return false
      }
    })()
  }

  const result = await refreshInFlight
  refreshInFlight = null
  return result
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  allowRetry = true,
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')

  const access = tokenStore.access
  if (access) headers.set('Authorization', `Bearer ${access}`)

  const response = await fetch(`${BASE}${path}`, { ...init, headers })

  if (response.status === 401 && allowRetry && tokenStore.refresh) {
    const refreshed = await refreshSession()
    if (refreshed) return request<T>(path, init, false)
  }

  if (!response.ok) throw await toError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/* ---------- Endpoint spesifik ---------- */

export const authApi = {
  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => api.get<MeResponse>('/auth/me'),
  logout: (refreshToken: string | null) =>
    api.post<{ message: string }>('/auth/logout', { refresh_token: refreshToken }),
}

export const applicationsApi = {
  list: (params: { search?: string; status?: string; page?: number } = {}) => {
    const query = new URLSearchParams()
    if (params.search) query.set('search', params.search)
    if (params.status) query.set('authorization_status', params.status)
    query.set('page', String(params.page ?? 1))
    query.set('page_size', '50')
    return api.get<Page<Application>>(`/applications?${query.toString()}`)
  },
  get: (id: number) => api.get<Application>(`/applications/${id}`),
  create: (body: Partial<Application>) => api.post<Application>('/applications', body),
  update: (id: number, body: Partial<Application>) =>
    api.patch<Application>(`/applications/${id}`, body),
  authorize: (id: number, body: { authorization_status: string; authorization_ref?: string; authorization_note?: string }) =>
    api.patch<Application>(`/applications/${id}/authorization`, body),
  remove: (id: number) => api.delete<{ message: string }>(`/applications/${id}`),
}

export const projectsApi = {
  listByApplication: (applicationId: number) =>
    api.get<Page<Project>>(`/applications/${applicationId}/projects`),
  create: (applicationId: number, body: { name: string; description?: string }) =>
    api.post<Project>(`/applications/${applicationId}/projects`, body),
  update: (id: number, body: Partial<Project>) => api.patch<Project>(`/projects/${id}`, body),
  remove: (id: number) => api.delete<{ message: string }>(`/projects/${id}`),
}

export const usersApi = {
  list: (search?: string) => {
    const query = new URLSearchParams({ page_size: '100' })
    if (search) query.set('search', search)
    return api.get<Page<User>>(`/users?${query.toString()}`)
  },
  create: (body: { name: string; email: string; password: string; role_id: number }) =>
    api.post<User>('/users', body),
  setStatus: (id: number, status: 'active' | 'disabled') =>
    api.patch<User>(`/users/${id}/status`, { status }),
  roles: () => api.get<Role[]>('/roles'),
}

export const healthApi = {
  check: () => api.get<{ status: string }>('/health'),
}
