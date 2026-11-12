import { useEffect, useState } from 'react'
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
  IconChevronLeft,
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
  { to: '/reconstruction', label: 'UI Reconstruction', icon: IconWand },
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
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem('nigmasim.sidebar.collapsed') === '1',
  )

  useEffect(() => {
    localStorage.setItem('nigmasim.sidebar.collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const renderSidebar = (isCollapsed: boolean, canCollapse: boolean) => (
    <div className="flex h-full flex-col bg-ink-900">
      <div
        className={`flex items-center border-b border-white/5 ${
          isCollapsed ? 'justify-center px-2 py-4' : 'gap-2.5 px-3 py-4'
        }`}
      >
        <button
          type="button"
          onClick={() => canCollapse && setCollapsed(false)}
          title={canCollapse ? 'Perlebar sidebar' : undefined}
          aria-label={canCollapse ? 'Perlebar sidebar' : undefined}
          className={cn(
            'shrink-0 rounded transition-opacity',
            canCollapse ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
          )}
        >
          <img
            src="/brand/nigmagrid-logo.png"
            alt="Logo PT Nigmagrid Indo Nesia"
            className={isCollapsed ? 'h-6 w-6' : 'h-7 w-7'}
          />
        </button>
        {!isCollapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-tight text-white">NigmaSim</p>
              <p className="text-[11px] leading-tight text-slate-500">PT Nigmagrid Indo Nesia</p>
            </div>
            {canCollapse && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Ciutkan sidebar"
                title="Ciutkan sidebar"
                className="grid h-7 w-7 shrink-0 place-items-center rounded text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <IconChevronLeft size={16} />
              </button>
            )}
          </>
        )}
      </div>

      <nav className="flex-1 space-y-px overflow-y-auto px-2.5 py-3">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={isCollapsed ? item.label : undefined}
              aria-label={isCollapsed ? item.label : undefined}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded text-[13px] transition-colors duration-150',
                  isCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-[7px]',
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'grid h-6 w-6 shrink-0 place-items-center rounded transition-colors',
                      isActive && !isCollapsed && 'bg-white/[0.06]',
                    )}
                  >
                    <Icon
                      size={16}
                      className={isActive ? 'text-brand-400' : 'text-slate-500'}
                    />
                  </span>
                  {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!isCollapsed && item.soon && (
                    <span className="text-[11px] text-slate-600">soon</span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-white/5 p-2.5">
        <div
          className={cn(
            'mb-1 flex items-center rounded',
            isCollapsed ? 'justify-center py-1.5' : 'gap-2.5 px-2.5 py-2',
          )}
        >
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-medium text-slate-200">
            {user?.name?.slice(0, 2).toUpperCase() ?? 'NA'}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight text-slate-100">
                {user?.name}
              </p>
              <p className="truncate text-[11px] leading-tight text-slate-500">{user?.role.name}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          title={isCollapsed ? 'Keluar' : undefined}
          aria-label="Keluar"
          className={cn(
            'flex w-full items-center rounded text-left text-[13px] text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-200',
            isCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2',
          )}
        >
          <IconLogout size={16} className="shrink-0 text-slate-500" />
          {!isCollapsed && 'Keluar'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          'hidden shrink-0 transition-[width] duration-200 ease-out lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {renderSidebar(collapsed, true)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="w-60">{renderSidebar(false, false)}</div>
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

        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 lg:px-6">
          <div className="mx-auto max-w-[1700px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
