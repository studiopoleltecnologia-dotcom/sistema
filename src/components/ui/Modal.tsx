import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from './cn'

const SIZE_CLS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

export function Modal({
  title,
  onFechar,
  size = 'md',
  children,
}: {
  title: string
  onFechar: () => void
  size?: keyof typeof SIZE_CLS
  children: ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFechar])

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[2px]"
      onClick={onFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full rounded-xl bg-white p-6 shadow-lg',
          SIZE_CLS[size],
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-neutral-900">{title}</h2>
          <button
            onClick={onFechar}
            className="rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
