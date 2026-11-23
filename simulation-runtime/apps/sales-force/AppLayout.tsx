import { Badge } from '@sim/core'
import { NavLink, Outlet } from 'react-router-dom'
import { useCustomerStore } from './store'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/customers', label: 'Pelanggan', end: false },
]

export function AppLayout() {
  const total = useCustomerStore((state) => state.items.length)

  return (
    <div className="flex min-h-full bg-slate-50">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5">
          <span className="grid h-8 w-8 place-items-center rounded bg-brand-500 text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="9" cy="8" r="3" />
              <path d="M3.5 19a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
              <path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 19a5.5 5.5 0 0 0-2-4.2" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-900">Sales Force</p>
            <p className="text-[11px] text-slate-400">Simulasi</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <p className="text-[11px] text-slate-400">Total pelanggan</p>
          <p className="text-[13px] font-semibold tabular-nums text-slate-700">{total}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-slate-900">Sales Force Automation</span>
            <Badge tone="brand">Data lokal</Badge>
          </div>
          <nav className="flex gap-1 md:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded px-2.5 py-1.5 text-[12px] font-medium ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="flex-1 p-4">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
