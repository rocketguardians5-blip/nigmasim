import { cloneElement, isValidElement, useEffect, useId, useState, createContext, useContext } from 'react'
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { IconInfo, IconWarning } from './icons'

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/* ---------- Button ---------- */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline-primary'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary:
    'bg-[#4268ff] text-white hover:bg-[#3257e6] active:bg-[#2c4fd1] focus-visible:ring-2 focus-visible:ring-[#4268ff]/30 disabled:bg-[#4268ff]/50 disabled:text-white/80',
  'outline-primary':
    'border border-[#4268ff] text-[#4268ff] bg-transparent hover:bg-[#4268ff] hover:text-white active:bg-[#2c4fd1] active:text-white focus-visible:ring-2 focus-visible:ring-[#4268ff]/30 disabled:opacity-50',
  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400 disabled:text-slate-400 disabled:hover:bg-white',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-600/50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  )
}

/* ---------- Field ---------- */

interface FieldProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId()
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children

  return (
    <div className="block">
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="ml-1 text-slate-400">*</span>}
        </label>
      )}
      {control}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </div>
  )
}

/* ---------- Badge ---------- */

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-brand-50 text-brand-700 ring-brand-200',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

/* ---------- Card ---------- */

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-16">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-lg bg-white shadow-overlay"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            title="Tutup"
            className="-mr-1 rounded px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            Tutup
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/* ---------- Lain-lain ---------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin text-current', className ?? 'h-4 w-4')}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded border border-dashed border-slate-300 bg-slate-50/60 px-5 py-8">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-md text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  title?: string
  children?: ReactNode
}) {
  const styles = {
    info: 'border-brand-200 bg-brand-50 text-brand-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }[tone]

  const Icon = tone === 'warning' ? IconWarning : IconInfo

  return (
    <div className={cn('flex gap-2.5 rounded border px-3 py-2.5', styles)}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="text-[13px] font-medium">{title}</p>}
        {children && (
          <div className={cn('text-xs leading-relaxed', title && 'mt-0.5')}>{children}</div>
        )}
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

/* ---------- Tabs ---------- */

type TabsVariant = 'line' | 'enclosed'

interface TabsProps {
  defaultValue: string
  value?: string
  onChange?: (value: string) => void
  variant?: TabsVariant
  className?: string
  children: ReactNode
}

export function Tabs({
  defaultValue,
  value,
  onChange,
  variant = 'line',
  className,
  children,
}: TabsProps) {
  const [activeValue, setActiveValue] = useState(value ?? defaultValue)

  const handleChange = (newValue: string) => {
    if (value === undefined) setActiveValue(newValue)
    onChange?.(newValue)
  }

  const context = { activeValue, handleChange, variant }

  return (
    <TabsContext.Provider value={context}>
      <div className={cn(className)}>{children}</div>
    </TabsContext.Provider>
  )
}

const TabsContext = createContext<{
  activeValue: string
  handleChange: (value: string) => void
  variant: TabsVariant
} | null>(null)

function useTabsContext() {
  const context = useContext(TabsContext)
  if (!context) throw new Error('Tabs components must be used within Tabs')
  return context
}

interface TabListProps {
  children: ReactNode
  className?: string
}

export function TabList({ children, className }: TabListProps) {
  const { variant } = useTabsContext()
  return (
    <div
      role="tablist"
      className={cn(
        'flex gap-1',
        variant === 'enclosed' && 'bg-slate-100 rounded-lg p-1',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface TabProps {
  value: string
  children: ReactNode
  disabled?: boolean
  className?: string
}

export function Tab({ value, children, disabled, className }: TabProps) {
  const { activeValue, handleChange, variant } = useTabsContext()
  const isActive = activeValue === value

  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => !disabled && handleChange(value)}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : variant === 'enclosed'
          ? isActive
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          : isActive
          ? 'text-indigo-600 border-b-2 border-indigo-600'
          : 'text-slate-500 hover:text-slate-700',
        className,
      )}
    >
      {children}
    </button>
  )
}

interface TabPanelsProps {
  children: ReactNode
  className?: string
}

export function TabPanels({ children, className }: TabPanelsProps) {
  return <div className={cn('mt-4', className)}>{children}</div>
}

interface TabPanelProps {
  value: string
  children: ReactNode
  className?: string
}

export function TabPanel({ value, children, className }: TabPanelProps) {
  const { activeValue } = useTabsContext()
  if (activeValue !== value) return null
  return <div className={cn('animate-fade-in', className)}>{children}</div>
}

/* ---------- ScrollArea ---------- */

export function ScrollArea({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn('overflow-y-auto overflow-x-hidden', className)}
      style={style}
    >
      {children}
    </div>
  )
}
