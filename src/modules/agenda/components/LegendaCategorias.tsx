import { SlidersHorizontal } from 'lucide-react'
import type { CategoriaModalidade } from '../types'

/**
 * Legenda das categorias — o mesmo par cor/nome da grade impressa que o
 * estúdio publica (Pole · Dança · Projeto Casinha · Condicionamento).
 *
 * Discreta de propósito: é referência de leitura, não conteúdo. Uma linha
 * de bolinhas com rótulo, sem caixa nem título, para não competir com a
 * grade logo abaixo.
 *
 * Só aparece quando a grade está colorida por categoria — nas outras
 * formas de colorir ela estaria descrevendo uma cor que não está na tela.
 */
export function LegendaCategorias({
  categorias,
  temSemCategoria,
  onGerenciar,
}: {
  categorias: CategoriaModalidade[]
  /** Há turma na grade cuja modalidade ainda não foi agrupada? */
  temSemCategoria: boolean
  onGerenciar?: () => void
}) {
  if (categorias.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {categorias.map((c) => (
        <span key={c.id} className="inline-flex items-center gap-1.5 text-[11px] text-neutral-600">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.cor }} />
          {c.nome}
        </span>
      ))}

      {/* Só entra quando existe de fato uma turma sem categoria: caso
          contrário a legenda anunciaria uma faixa vazia. */}
      {temSemCategoria && (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-400">
          <span className="size-2.5 shrink-0 rounded-full bg-neutral-300" />
          Sem categoria
        </span>
      )}

      {onGerenciar && (
        <button
          onClick={onGerenciar}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-neutral-400 transition hover:text-brand-700"
        >
          <SlidersHorizontal className="size-3" />
          Categorias
        </button>
      )}
    </div>
  )
}
