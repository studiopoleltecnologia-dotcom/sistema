import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: 'none' | 'sm' | 'md'
  /** Card principal da tela — ganha borda e sombra mais presentes. */
  destaque?: boolean
}

export function Card({ padding = 'md', destaque, className, children, ...props }: CardProps) {
  const paddingCls = { none: '', sm: 'p-3.5', md: 'p-5' }[padding]
  return (
    <div
      className={cn(
        'rounded-lg bg-white',
        destaque
          ? 'border border-brand-200 shadow-md'
          : 'border border-neutral-200/80 shadow-sm',
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
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-neutral-900">
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
