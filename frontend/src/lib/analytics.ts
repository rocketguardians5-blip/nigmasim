/**
 * Klien API untuk modul Statistik Pengunjung (Phase 7).
 * Endpoint /analytics/visit publik (tidak butuh token),
 * sedangkan /analytics/stats butuh autentikasi.
 */

import { api } from './api'

export interface VisitorStatCreate {
  path: string
  ip_address?: string | null
  user_agent?: string | null
  referrer?: string | null
}

export interface VisitorStatOut {
  id: number
  path: string
  ip_address: string | null
  user_agent: string | null
  referrer: string | null
  visited_at: string
}

export interface PathStat {
  path: string
  count: number
}

export interface VisitorStatsSummary {
  total_visits: number
  visits_by_path: PathStat[]
  recent_visits: VisitorStatOut[]
}

export const analyticsApi = {
  /**
   * Catat satu kunjungan halaman. Publik — tidak butuh token.
   * Dipakai oleh usePageVisit untuk pelacakan otomatis.
   */
  recordVisit: (body: VisitorStatCreate) =>
    api.post<{ status: string; id: number }>('/analytics/visit', body),

  /**
   * Ambil ringkasan statistik pengunjung. Butuh autentikasi + izin analytics:read.
   */
  getStats: (limit?: number) => {
    const query = new URLSearchParams()
    if (limit) query.set('limit', String(limit))
    return api.get<VisitorStatsSummary>(
      `/analytics/stats${query.toString() ? '?' + query.toString() : ''}`
    )
  },
}
