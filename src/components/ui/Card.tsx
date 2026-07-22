import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: 'none' | 'sm' | 'md'
}

export function Card({ padding = 'md', className, children, ...props }: CardProps) {
  const paddingCls = { none: '', sm: 'p-3.5', md: 'p-5' }[padding]
  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-200/80 bg-white shadow-sm',
        paddingCls,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-sm font-semibold tracking-wide text-neutral-900">
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
