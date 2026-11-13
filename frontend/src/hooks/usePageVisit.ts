/**
 * Hook untuk pelacakan otomatis kunjungan halaman (Phase 7).
 *
 * Dipanggil di root layout agar setiap perpindahan route dicatat ke backend
 * melalui endpoint publik /analytics/visit (tidak butuh token).
 */

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { analyticsApi } from '../lib/analytics'

export function usePageVisit() {
  const location = useLocation()

  useEffect(() => {
    const navTiming = performance.getEntriesByType('navigation')
    const referrer = navTiming.length > 0 ? (navTiming[0] as any).type : null

    void analyticsApi.recordVisit({
      path: location.pathname + location.search,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      referrer:
        referrer === 'navigate'
          ? typeof document !== 'undefined'
            ? document.referrer || null
            : null
          : null,
    })
  }, [location])
}
