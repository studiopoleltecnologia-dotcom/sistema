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
/** Tons do chip de título — o mesmo vocabulário de cor do resto do app. */
const CHIP_CLS = {
  brand: 'bg-brand-100 text-brand-800',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  danger: 'bg-danger-100 text-danger-700',
  neutral: 'bg-neutral-200 text-neutral-700',
} as const

export type ChipTom = keyof typeof CHIP_CLS

export function CardColapsavel({
  title,
  subtitle,
  chip,
  persistKey,
  defaultOpen = true,
  forcarAberto = false,
  right,
  className,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /**
   * Renderiza o título dentro de uma caixinha tingida em vez de texto solto
   * — marca a seção de longe, sem depender de o olho encontrar o negrito.
   */
  chip?: ChipTom
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
            {chip ? (
              <span
                className={cn(
                  'inline-block rounded-md px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wider',
                  CHIP_CLS[chip],
                )}
              >
                {title}
              </span>
            ) : (
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-neutral-900">
                {title}
              </h3>
            )}
            {subtitle && <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>}
          </div>
        </button>
        {right}
      </div>
      {aberto && <div className="mt-4">{children}</div>}
    </Card>
  )
}
