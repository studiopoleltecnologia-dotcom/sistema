import { cn } from './cn'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-neutral-100', className)} />
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-neutral-200/80 bg-white p-5">
      <Skeleton className="mb-3 h-3 w-20" />
      <Skeleton className="h-7 w-28" />
    </div>
  )
}
