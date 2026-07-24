import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from './Card'
import { cn } from './cn'

/** Lembra o estado (aberto/fechado) entre sessões, por chave. */
function useAberto(key: string, inicial = true) {
  const [aberto, setAberto] = useState(() => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? inicial : v === '1'
    } catch {
      return inicial
    }
  })
  const alternar = () =>
    setAberto((a) => {
      const n = !a
      try {
        localStorage.setItem(key, n ? '1' : '0')
      } catch {
        /* ignore */
      }
      return n
    })
  return [aberto, alternar] as const
}

/**
 * Card com cabeçalho clicável que recolhe o conteúdo (accordion).
 * `persistKey` guarda o estado no navegador para a tela abrir do jeito
 * que a pessoa deixou.
 */
export function CardColapsavel({
  title,
  subtitle,
  persistKey,
  defaultOpen = true,
  right,
  className,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  persistKey: string
  defaultOpen?: boolean
  right?: ReactNode
  className?: string
  children: ReactNode
}) {
  const [aberto, alternar] = useAberto(persistKey, defaultOpen)

  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={alternar}
          aria-expanded={aberto}
          className="group flex flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'mt-0.5 size-4 shrink-0 text-neutral-400 transition-transform group-hover:text-neutral-600',
              aberto ? '' : '-rotate-90',
            )}
          />
          <div>
            <h3 className="font-display text-sm font-semibold tracking-wide text-neutral-900">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p>}
          </div>
        </button>
        {right}
      </div>
      {aberto && <div className="mt-4">{children}</div>}
    </Card>
  )
}
