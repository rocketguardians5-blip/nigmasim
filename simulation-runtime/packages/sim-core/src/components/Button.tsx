import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'dark'
type Size = 'sm' | 'md'
type Shape = 'rounded' | 'pill'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Bentuk sudut: `rounded` (default) atau `pill` (rounded-full). */
  shape?: Shape
  children: ReactNode
}

const BASE =
  'inline-flex select-none items-center justify-center gap-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
  dark: 'bg-[#0f172a] text-white hover:bg-[#1e293b]',
}

const SHAPES: Record<Shape, string> = {
  rounded: 'rounded',
  pill: 'rounded-full',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[12px]',
  md: 'h-9 px-3.5 text-[13px]',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  shape = 'rounded',
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SHAPES[shape], SIZES[size], className)}
      {...rest}
    >
      {children}
    </button>
  )
}
