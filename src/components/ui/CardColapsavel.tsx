import { useEffect, useState, type ReactNode } from 'react'
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
  const gravar = (n: boolean) => {
    try {
      localStorage.setItem(key, n ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  const alternar = () =>
    setAberto((a) => {
      gravar(!a)
      return !a
    })
  /** Abre sem gravar: é decisão do sistema, não preferência da pessoa. */
  const abrir = () => setAberto(true)
  return [aberto, alternar, abrir] as const
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
  forcarAberto = false,
  right,
  className,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  persistKey: string
  defaultOpen?: boolean
  /**
   * Abre a seção mesmo que a pessoa a tenha deixado fechada — para quando o
   * conteúdo passou a exigir atenção (MEI estourando, aluna inadimplente).
   * Não sobrescreve a preferência salva: se ela fechar de novo, fica fechada
   * até a próxima visita.
   */
  forcarAberto?: boolean
  right?: ReactNode
  className?: string
  children: ReactNode
}) {
  const [aberto, alternar, abrir] = useAberto(persistKey, defaultOpen)

  // O dado chega depois da montagem, então não dá para resolver isso só no
  // estado inicial do useState.
  useEffect(() => {
    if (forcarAberto) abrir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcarAberto])

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
