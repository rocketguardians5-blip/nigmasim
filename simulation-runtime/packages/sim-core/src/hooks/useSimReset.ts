import { useEffect } from 'react'

interface UseSimResetOptions {
  /** Dipanggil saat lobby mengirim perintah reset. */
  onReset: () => void | Promise<void>
  /** Identitas app, dikirim balik ke lobby. */
  slug?: string
}

interface SimMessage {
  type?: string
}

/**
 * Protokol reset antara lobby dan app di iframe.
 *
 * Keamanan: hanya menerima pesan yang origin-nya sama dengan origin runtime
 * DAN benar-benar berasal dari window parent (bukan frame lain).
 */
export function useSimReset({ onReset, slug }: UseSimResetOptions) {
  useEffect(() => {
    const parent = window.parent
    const sameOrigin = window.location.origin

    if (parent && parent !== window) {
      parent.postMessage({ type: 'sim:ready', slug }, sameOrigin)
    }

    const handler = (event: MessageEvent) => {
      if (event.origin !== sameOrigin) return
      if (event.source !== parent) return

      const data = event.data as SimMessage | null
      if (!data || data.type !== 'sim:reset') return

      void Promise.resolve(onReset()).then(() => {
        parent.postMessage({ type: 'sim:reset-done', slug }, sameOrigin)
      })
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onReset, slug])
}
