import type { HTMLAttributes } from 'react'
import { cn } from './cn'

type Variant = 'brand' | 'success' | 'warning' | 'danger' | 'neutral'

const VARIANT_CLS: Record<Variant, string> = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  neutral: 'bg-neutral-100 text-neutral-600',
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: Variant }

export function Badge({ variant = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        VARIANT_CLS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
