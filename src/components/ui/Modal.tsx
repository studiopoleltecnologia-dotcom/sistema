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
      // No mobile o formulário costuma passar da altura da tela: ancora no
      // topo e deixa o overlay rolar, senão o botão de salvar fica fora.
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'my-auto w-full rounded-xl bg-white p-5 shadow-lg sm:p-6',
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
