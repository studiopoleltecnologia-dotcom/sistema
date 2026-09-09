import { ArchiveRestore, CalendarClock, Coins, EyeOff, Pencil, Trash2, Users } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { fmtCentavos } from '../../../lib/dinheiro'
import {
  descreverCobranca,
  descreverEntrega,
  custoPorAula,
  type Produto,
  type ProdutoRequisito,
} from '../types'
import { REQUISITO_LABEL } from '../types'

/**
 * Um produto do catálogo.
 *
 * A hierarquia do cartão é deliberada e responde ao "bater o olho e
 * entender": o NÚMERO DE ENTREGA (16 créditos / 2 turmas fixas) é o
 * maior elemento, porque é o que diferencia um produto do vizinho
 * dentro do mesmo bloco; o preço vem logo abaixo em segundo peso; o
 * nome, terceiro, porque numa coluna "Semestral" dentro do bloco
 * "Planos por créditos" o nome só repete o que os dois títulos já
 * disseram. Regra, cobrança e selos ficam em corpo pequeno.
 *
 * As ações só aparecem no hover (e sempre no foco, para teclado): numa
 * grade de 20 cartões, 40 ícones permanentes é exatamente a poluição
 * que a tela antiga tinha.
 */
export function ProdutoCard({
  produto: p,
  requisitos,
  gestao,
  onEditar,
  onArquivar,
  onReativar,
}: {
  produto: Produto
  requisitos: ProdutoRequisito[]
  gestao: boolean
  onEditar: () => void
  onArquivar: () => void
  onReativar: () => void
}) {
  const cortesia = p.preco_centavos === 0
  const porAula = custoPorAula(p)
  const arquivado = !p.ativo

  // O destaque numérico: o que o produto entrega, em uma palavra.
  const destaque = p.turmas_fixas > 0
    ? { valor: p.turmas_fixas, unidade: p.turmas_fixas === 1 ? 'turma fixa' : 'turmas fixas', Icone: Users }
    : p.gera_credito && p.creditos_por_ciclo > 0
      ? { valor: p.creditos_por_ciclo, unidade: p.creditos_por_ciclo === 1 ? 'crédito' : 'créditos', Icone: Coins }
      : null

  return (
    <div
      className={`group relative flex flex-col gap-2 rounded-lg border p-4 transition ${
        arquivado
          ? 'border-dashed border-neutral-200 bg-neutral-50/60'
          : 'border-neutral-200/80 bg-white shadow-sm hover:border-neutral-300 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {destaque ? (
            <p className="flex items-baseline gap-1.5">
              <span
                className={`font-display text-2xl font-bold leading-none ${
                  arquivado ? 'text-neutral-400' : 'text-neutral-900'
                }`}
              >
                {destaque.valor}
              </span>
              <span className="text-xs font-medium text-neutral-500">{destaque.unidade}</span>
            </p>
          ) : (
            <p className="font-display text-base font-bold leading-tight text-neutral-900">
              {p.nome}
            </p>
          )}
          {destaque && (
            <p className="mt-0.5 truncate text-xs text-neutral-400" title={p.nome}>
              {p.nome}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p
            className={`font-display text-lg font-bold leading-none ${
              cortesia ? 'text-success-700' : arquivado ? 'text-neutral-400' : 'text-neutral-900'
            }`}
          >
            {cortesia ? 'Cortesia' : fmtCentavos(p.preco_centavos)}
          </p>
          {p.renova_automaticamente && !cortesia && (
            <p className="mt-0.5 text-[10px] text-neutral-400">por ciclo</p>
          )}
        </div>
      </div>

      {p.descricao && (
        <p className="line-clamp-2 text-xs leading-snug text-neutral-500">{p.descricao}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {arquivado && <Badge variant="neutral">arquivado</Badge>}
        {!p.visivel_no_catalogo && (
          <Badge
            variant="neutral"
            title="Só a equipe vende — o aluno não vê no portal"
            className="gap-1"
          >
            <EyeOff className="size-3" /> só a equipe
          </Badge>
        )}
        {p.acumula_creditos && <Badge variant="brand">acumula</Badge>}
        {p.convidados_por_ciclo > 0 && (
          <Badge variant="brand">
            {p.convidados_por_ciclo} convidado{p.convidados_por_ciclo === 1 ? '' : 's'}
          </Badge>
        )}
        {p.desconto_eventos_pct > 0 && (
          <Badge variant="brand">{p.desconto_eventos_pct}% em aulões</Badge>
        )}
        {requisitos.map((r) => (
          <Badge key={r.id} variant="warning" title="Requisito para poder comprar">
            {REQUISITO_LABEL[r.tipo]}
            {r.tipo === 'checkins_wellhub' && r.parametro_int
              ? ` (${r.parametro_int}/${r.janela_dias}d)`
              : ''}
          </Badge>
        ))}
      </div>

      <dl className="grid gap-0.5 border-t border-neutral-100 pt-2 text-[11px] leading-snug text-neutral-500">
        <div className="flex gap-1.5">
          <dt className="sr-only">Entrega</dt>
          <dd>{descreverEntrega(p)}</dd>
        </div>
        <div className="flex items-start gap-1.5">
          <CalendarClock className="mt-px size-3 shrink-0 text-neutral-300" />
          <dd>{descreverCobranca(p)}</dd>
        </div>
        {porAula !== null && !cortesia && (
          // Regulamento 2.4, bloco INTERNO: "nunca publicar estes
          // números". Esta tela é interna — é exatamente onde eles
          // servem, para a equipe argumentar no atendimento.
          <div className="flex gap-1.5">
            <dd className="text-neutral-400">
              {fmtCentavos(porAula)} por aula
              <span className="ml-1 text-neutral-300">· não divulgar</span>
            </dd>
          </div>
        )}
      </dl>

      {gestao && (
        <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          {arquivado ? (
            <button
              onClick={onReativar}
              title="Voltar ao catálogo"
              className="rounded-md bg-white/90 p-1.5 text-neutral-400 shadow-sm ring-1 ring-neutral-200 transition hover:text-success-700"
            >
              <ArchiveRestore className="size-3.5" />
            </button>
          ) : (
            <>
              <button
                onClick={onEditar}
                title="Editar produto"
                className="rounded-md bg-white/90 p-1.5 text-neutral-400 shadow-sm ring-1 ring-neutral-200 transition hover:text-brand-600"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={onArquivar}
                title="Arquivar produto"
                className="rounded-md bg-white/90 p-1.5 text-neutral-400 shadow-sm ring-1 ring-neutral-200 transition hover:text-danger-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
