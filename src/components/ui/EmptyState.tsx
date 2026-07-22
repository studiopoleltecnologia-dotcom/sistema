import type { ComponentType, ReactNode } from 'react'
import { Inbox, type LucideProps } from 'lucide-react'

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: ComponentType<LucideProps>
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-200 px-6 py-10 text-center">
      <Icon className="size-6 text-neutral-300" strokeWidth={1.5} />
      <p className="text-sm font-medium text-neutral-600">{title}</p>
      {description && <p className="text-xs text-neutral-400">{description}</p>}
      {action}
    </div>
  )
}
