import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export function Card({ title, description, actions, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-lg border border-slate-200 bg-white shadow-card', className)}
      {...rest}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            {title && <h2 className="text-[13px] font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {title || actions ? <div className="p-4">{children}</div> : children}
    </div>
  )
}
