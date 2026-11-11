import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { cn } from '../components/ui'

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
  soon?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/applications', label: 'Application Registry', icon: 'app' },
  { to: '/capture', label: 'Capture Studio', icon: 'camera', soon: true },
  { to: '/screens', label: 'Screen Repository', icon: 'image', soon: true },
  { to: '/reconstruction', label: 'UI Reconstruction', icon: 'magic', soon: true },
  { to: '/simulation', label: 'Simulation Builder', icon: 'layers', soon: true },
  { to: '/workflow', label: 'Workflow Builder', icon: 'flow', soon: true },
  { to: '/tutorial', label: 'Tutorial Builder', icon: 'book', soon: true },
  { to: '/documentation', label: 'Documentation Generator', icon: 'doc', soon: true },
  { to: '/demos', label: 'Published Demos', icon: 'globe', soon: true },
  { to: '/analytics', label: 'Analytics', icon: 'chart', soon: true },
  { to: '/users', label: 'User Management', icon: 'users' },
  { to: '/settings', label: 'Settings', icon: 'settings', soon: true },
]

const PATHS: Record<string, string> = {
  grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  app: 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3H4V5Zm0 5h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z',
  camera: 'M4 8a2 2 0 0 1 2-2h2l1-2h6l1 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Zm8 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  image: 'M4 4h16v16H4V4Zm2 12 3.5-4 2.5 3 3-4L18 16H6Z',
  magic: 'M5 19 16 8l-2-2L3 17l2 2Zm11-13 1.5-1.5L19 6l-1.5 1.5L16 6Zm3 4 1-1 1 1-1 1-1-1Z',
  layers: 'M12 3 3 8l9 5 9-5-9-5Zm0 9-9 5 9 5 9-5-9-5Z',
  flow: 'M5 4h6v5H5V4Zm8 11h6v5h-6v-5ZM8 9v4h8V9h2v6h-2v-1h-6v1H6V9h2Z',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4V4Zm16 0h-4a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h4V4Z',
  doc: 'M6 2h8l4 4v16H6V2Zm7 1.5V7h3.5L13 3.5Z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2c1.7 0 3.3 3.4 3.3 8s-1.6 8-3.3 8-3.3-3.4-3.3-8 1.6-8 3.3-8ZM3 11h18v2H3v-2Z',
  chart: 'M4 20V9h4v11H4Zm6 0V4h4v16h-4Zm6 0v-7h4v7h-4Z',
  users: 'M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19c0-3 2.7-5 6-5s6 2 6 5v1H2v-1Zm13.5-3.5c2.6.3 4.5 2 4.5 4.5v1h-5v-1c0-1.7-.6-3.2-1.6-4.3.6-.1 1.4-.2 2.1-.2Z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4c0-.6 0-1.2-.1-1.7l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.5-.9L16.5 3h-4l-.4 2.5c-.5.2-1 .5-1.5.9l-2.4-1-2 3.4 2 1.6a9 9 0 0 0 0 3.4l-2 1.6 2 3.4 2.4-1c.5.4 1 .7 1.5.9l.4 2.5h4l.4-2.5c.5-.2 1-.5 1.5-.9l2.4 1 2-3.4-2-1.6c.1-.5.1-1.1.1-1.7Z',
}

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden>
      <path d={PATHS[name] ?? PATHS.grid} />
    </svg>
  )
}

export function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-900">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          NS
        </div>
        <div>
          <p className="text-sm font-semibold text-white">NigmaSim</p>
          <p className="text-[11px] text-slate-400">Simulation Platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition',
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <Icon name={item.icon} />
            <span className="flex-1 truncate">{item.label}</span>
            {item.soon && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-300">
                soon
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
            {user?.name?.slice(0, 2).toUpperCase() ?? 'NA'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">{user?.name}</p>
            <p className="truncate text-[10px] text-slate-400">{user?.role.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 hover:text-white"
        >
          Keluar
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="w-64">{sidebar}</div>
          <button
            type="button"
            aria-label="Tutup menu"
            className="flex-1 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-8">
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M3 5h14v2H3V5Zm0 4h14v2H3V9Zm0 4h14v2H3v-2Z" />
            </svg>
          </button>
          <p className="text-xs text-slate-500">
            Environment: <span className="font-medium text-slate-700">Development</span>
          </p>
          <span className="ml-auto hidden text-[11px] text-slate-400 sm:block">
            NigmaSim v0.1.0 — Phase 1
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
