import { useEffect, useState, type ComponentType } from 'react'
import { AppFrame } from './AppFrame'
import { Lobby } from './Lobby'
import { appLoader, findEntry } from './registry'

/**
 * Shell runtime punya dua mode:
 * 1. Lobby  -> `/?` (tanpa parameter)
 * 2. App    -> `/?app=<slug>` (dipakai sebagai isi iframe)
 *
 * Mode app dipilih lewat query param supaya setiap app tetap bisa menjadi
 * chunk terpisah tanpa perlu HTML entry sendiri.
 */
function EmbeddedApp({ slug }: { slug: string }) {
  const [Component, setComponent] = useState<ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setComponent(null)
    setError(null)

    const entry = findEntry(slug)
    if (!entry) {
      setError('Simulasi tidak terdaftar di registry.json.')
      return
    }

    const loader = appLoader(slug)
    if (!loader) {
      setError(`Folder apps/${slug}/index.tsx tidak ditemukan.`)
      return
    }

    loader()
      .then((module) => {
        if (!cancelled) setComponent(() => module.default)
      })
      .catch(() => {
        if (!cancelled) setError('Gagal memuat simulasi. Periksa console untuk detail.')
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    const entry = findEntry(slug)
    if (entry) document.title = `${entry.name} · NigmaSim Runtime`
  }, [slug])

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="max-w-md rounded-lg border border-rose-200 bg-white px-5 py-4 text-center shadow-card">
          <p className="text-[13px] font-semibold text-rose-700">Simulasi tidak bisa dibuka</p>
          <p className="mt-1 text-[12px] text-slate-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!Component) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <p className="text-[13px] text-slate-500">Memuat simulasi…</p>
      </div>
    )
  }

  return <Component />
}

export function App() {
  const [activeSlug, setActiveSlug] = useState<string | null>(null)

  useEffect(() => {
    if (!activeSlug) document.title = 'NigmaSim · Simulation Runtime'
  }, [activeSlug])

  const params = new URLSearchParams(window.location.search)
  const embedSlug = params.get('app')

  if (embedSlug) return <EmbeddedApp slug={embedSlug} />

  const entry = findEntry(activeSlug)
  if (entry) {
    return <AppFrame entry={entry} onBack={() => setActiveSlug(null)} />
  }

  return <Lobby onOpen={setActiveSlug} />
}
