import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@sim/core'
import type { RegistryEntry } from './types'

interface AppFrameProps {
  entry: RegistryEntry
  onBack: () => void
}

/**
 * Menampilkan satu simulasi di dalam iframe.
 *
 * Keamanan postMessage:
 * - origin pesan harus sama dengan origin runtime;
 * - sumber pesan harus benar-benar iframe ini (bukan frame lain).
 */
export function AppFrame({ entry, onBack }: AppFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    setReady(false)

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== iframeRef.current?.contentWindow) return

      const data = event.data as { type?: string } | null
      if (!data) return
      if (data.type === 'sim:ready' || data.type === 'sim:reset-done') {
        setReady(true)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [entry.slug])

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  const requestReset = () => {
    const target = iframeRef.current?.contentWindow
    if (!target) return
    target.postMessage({ type: 'sim:reset' }, window.location.origin)
    setConfirmOpen(false)
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
      return
    }
    void containerRef.current?.requestFullscreen().catch(() => undefined)
  }

  return (
    <div ref={containerRef} className="flex h-screen flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button size="sm" onClick={onBack} data-testid="back-to-lobby">
            ← Kembali ke lobby
          </Button>
          <div className="min-w-0 border-l border-slate-200 pl-2.5">
            <p className="truncate text-[13px] font-semibold text-slate-900">{entry.name}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-400'}`}
                aria-hidden="true"
              />
              {ready ? 'Simulasi siap · data lokal' : 'Memuat simulasi…'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={!ready}
            data-testid="reset-data"
          >
            Reset data
          </Button>
          <Button size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? 'Keluar fullscreen' : 'Fullscreen'}
          </Button>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src={`${entry.path}#/`}
        title={entry.name}
        data-testid="sim-frame"
        sandbox="allow-scripts allow-same-origin allow-forms"
        className="min-h-0 flex-1 border-0 bg-white"
      />

      <Modal
        open={confirmOpen}
        title="Reset data simulasi?"
        description={`Seluruh data di ${entry.name} akan dikembalikan ke data seed awal. Perubahan yang Anda buat akan hilang.`}
        onClose={() => setConfirmOpen(false)}
        width="sm"
        data-testid="reset-confirm"
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button
              variant="danger"
              onClick={requestReset}
              data-testid="reset-confirm-accept"
            >
              Ya, reset
            </Button>
          </>
        }
      />
    </div>
  )
}
