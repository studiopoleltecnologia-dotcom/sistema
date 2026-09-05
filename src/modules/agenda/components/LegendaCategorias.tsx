import { SlidersHorizontal } from 'lucide-react'
import { corDaCategoria } from '../cores'
import type { CategoriaModalidade } from '../types'

/**
 * Legenda das categorias — o mesmo par cor/nome da grade impressa que o
 * estúdio publica (Pole · Dança · Projeto Casinha · Condicionamento).
 *
 * Cada categoria virou pastilha na própria cor, em vez de bolinha com
 * texto cinza: a legenda precisa mostrar a cor do jeito que ela aparece no
 * cartão, senão ela ensina um código que a grade não usa.
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
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      {categorias.map((c) => {
        const cor = corDaCategoria(c)
        return (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-1.5 pr-2.5 text-[11px] font-medium"
            style={{ background: cor.bg, borderColor: cor.borda, color: cor.texto }}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: cor.acento }}
            />
            {c.nome}
          </span>
        )
      })}

      {/* Honestidade na tela: a turma sem categoria recebe uma cor estável
          derivada do nome da modalidade só para não sumir na grade. Dizer
          "cor provisória" é o que faz alguém abrir Categorias e resolver —
          esconder o aviso deixaria a grade parecendo já organizada. */}
      {temSemCategoria && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 py-0.5 pl-1.5 pr-2.5 text-[11px] text-neutral-500">
          <span className="size-2.5 shrink-0 rounded-full bg-neutral-300" />
          Há aulas sem categoria — cor provisória
        </span>
      )}

      {onGerenciar && (
        <button
          onClick={onGerenciar}
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-neutral-400 transition hover:text-brand-700"
        >
          <SlidersHorizontal className="size-3" />
          Categorias
        </button>
      )}
    </div>
  )
}
