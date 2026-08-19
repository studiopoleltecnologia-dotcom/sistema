import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * Cabeçalho de página: título forte + subtítulo opcional + ações à direita.
 *
 * Existe porque só 4 das 28 telas tinham título próprio — as outras
 * dependiam do `<h1>` da barra do topo, que era `text-sm`, ou seja, menor
 * que o texto do conteúdo. Sem um ponto de entrada visual, toda tela
 * começava "no meio".
 *
 * A ação primária da tela vai em `acoes`. Uma só, de preferência: se duas
 * disputam o mesmo peso, nenhuma é a principal.
 */
export function PageHeader({
  titulo,
  subtitulo,
  acoes,
  filtros,
  className,
}: {
  titulo: string
  subtitulo?: ReactNode
  acoes?: ReactNode
  /** Linha secundária: abas, seletor de período, chips de filtro. */
  filtros?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink sm:text-2xl">
            {titulo}
          </h2>
          {subtitulo && <p className="mt-1 text-sm text-neutral-500">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
      </div>
      {filtros && <div className="flex flex-wrap items-center gap-3">{filtros}</div>}
    </div>
  )
}
