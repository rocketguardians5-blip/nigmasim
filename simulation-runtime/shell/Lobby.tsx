import { useMemo, useState } from 'react'
import { AppIcon } from './icons'
import { registry } from './registry'

export function Lobby({ onOpen }: { onOpen: (slug: string) => void }) {
  const [query, setQuery] = useState('')

  const apps = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return registry
    return registry.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) ||
        entry.description.toLowerCase().includes(needle),
    )
  }, [query])

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500 text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18V6l6 7 6-7v12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-slate-900">
                Simulation Runtime
              </h1>
              <p className="text-[12px] text-slate-500">
                Katalog simulasi hidup · data lokal, tanpa API produksi
              </p>
            </div>
          </div>

          <div className="w-full sm:w-72">
            <label className="sr-only" htmlFor="app-search">
              Cari simulasi
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="9" cy="9" r="5.5" />
                  <path d="m13.5 13.5 3 3" strokeLinecap="round" />
                </svg>
              </span>
              <input
                id="app-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari simulasi…"
                className="sim-input pl-8"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-end justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold text-slate-900">Simulasi tersedia</h2>
            <p className="text-[12px] text-slate-500">
              {apps.length} dari {registry.length} aplikasi
            </p>
          </div>
          <p className="hidden text-[11px] text-slate-400 sm:block">
            Semua data sintetis · disimpan di browser Anda
          </p>
        </div>

        {apps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="text-[13px] font-medium text-slate-700">Tidak ada simulasi yang cocok</p>
            <p className="mt-1 text-[12px] text-slate-500">Coba kata kunci lain.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((entry) => (
              <li key={entry.slug}>
                <button
                  type="button"
                  onClick={() => onOpen(entry.slug)}
                  data-testid={`sim-card-${entry.slug}`}
                  className="group flex h-full w-full flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-overlay"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="grid h-10 w-10 place-items-center rounded-lg text-white"
                      style={{ backgroundColor: entry.accent ?? '#4268ff' }}
                    >
                      <AppIcon name={entry.icon} />
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Simulasi
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-slate-900 group-hover:text-brand-700">
                      {entry.name}
                    </h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                      {entry.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-[12px]">
                    <span className="font-medium text-brand-600">Buka simulasi</span>
                    <span aria-hidden="true" className="text-brand-500 transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          <strong className="text-slate-600">Catatan keamanan:</strong> runtime ini tidak
          terhubung ke backend admin maupun API produksi. Semua permintaan dibatasi ke origin
          sendiri dan semua data adalah data sintetis.
        </p>
      </main>
    </div>
  )
}
