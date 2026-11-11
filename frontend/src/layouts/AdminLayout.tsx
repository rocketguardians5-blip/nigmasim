import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { cn } from '../components/ui'
import {
  IconApps,
  IconBook,
  IconCamera,
  IconChart,
  IconDashboard,
  IconDoc,
  IconFlow,
  IconGlobe,
  IconImages,
  IconLayers,
  IconLogout,
  IconMenu,
  IconSettings,
  IconUsers,
  IconWand,
} from '../components/icons'
import type { ReactNode } from 'react'

interface NavItem {
  to: string
  label: string
  icon: (props: { size?: number; className?: string }) => ReactNode
  end?: boolean
  soon?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/applications', label: 'Application Registry', icon: IconApps },
  { to: '/capture', label: 'Capture Studio', icon: IconCamera },
  { to: '/screens', label: 'Screen Repository', icon: IconImages },
  { to: '/reconstruction', label: 'UI Reconstruction', icon: IconWand, soon: true },
  { to: '/simulation', label: 'Simulation Builder', icon: IconLayers, soon: true },
  { to: '/workflow', label: 'Workflow Builder', icon: IconFlow, soon: true },
  { to: '/tutorial', label: 'Tutorial Builder', icon: IconBook, soon: true },
  { to: '/documentation', label: 'Documentation Generator', icon: IconDoc, soon: true },
  { to: '/demos', label: 'Published Demos', icon: IconGlobe, soon: true },
  { to: '/analytics', label: 'Analytics', icon: IconChart, soon: true },
  { to: '/users', label: 'User Management', icon: IconUsers },
  { to: '/settings', label: 'Settings', icon: IconSettings, soon: true },
]

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
      <div className="flex items-center gap-2.5 border-b border-white/5 px-4 py-4">
        <div className="grid h-7 w-7 place-items-center rounded bg-brand-600 text-[11px] font-bold text-white">
          NS
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-tight text-white">NigmaSim</p>
          <p className="text-[11px] leading-tight text-slate-500">Simulation Platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-px overflow-y-auto px-2.5 py-3">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded px-2.5 py-[7px] text-[13px] transition-colors duration-150',
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={isActive ? 'text-brand-300' : 'text-slate-500'} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.soon && <span className="text-[11px] text-slate-600">soon</span>}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-white/5 p-2.5">
        <div className="mb-1 flex items-center gap-2.5 rounded px-2.5 py-2">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-medium text-slate-200">
            {user?.name?.slice(0, 2).toUpperCase() ?? 'NA'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight text-slate-100">
              {user?.name}
            </p>
            <p className="truncate text-[11px] leading-tight text-slate-500">{user?.role.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-200"
        >
          <IconLogout size={16} className="text-slate-500" />
          Keluar
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="w-60">{sidebar}</div>
          <button
            type="button"
            aria-label="Tutup menu"
            className="flex-1 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
          <button
            type="button"
            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
          >
            <IconMenu size={18} />
          </button>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
            Development
          </span>
          <span className="ml-auto text-[11px] text-slate-400">NigmaSim v0.1.0 · Phase 1</span>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-6">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
