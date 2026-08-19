import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * Rótulo de seção dentro de uma página — o degrau entre o título da página
 * (PageHeader) e o conteúdo. Caixa alta e pequeno: precisa organizar sem
 * competir com o título.
 *
 * `cor` aceita uma classe de texto para amarrar a seção a um status (ex.:
 * A PAGAR em âmbar, PAGO em verde), seguindo a escala de statusVisual.ts.
 */
export function SectionTitle({
  children,
  direita,
  cor = 'text-neutral-500',
  className,
}: {
  children: ReactNode
  /** Conteúdo alinhado à direita, normalmente um total. */
  direita?: ReactNode
  cor?: string
  className?: string
}) {
  return (
    <div className={cn('mb-2 flex items-center gap-2 border-b border-neutral-100 pb-1.5', className)}>
      <h4 className={cn('text-xs font-bold uppercase tracking-wider', cor)}>{children}</h4>
      {direita && <span className={cn('ml-auto text-xs font-semibold tabular-nums', cor)}>{direita}</span>}
    </div>
  )
}
