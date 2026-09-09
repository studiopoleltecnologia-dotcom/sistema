import type { ReactNode } from 'react'
import { ArchiveRestore, ArrowRight, EyeOff, Lock, Pencil, Trash2, X } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useModalidades } from '../../agenda/hooks/useAgenda'
import {
  REQUISITO_LABEL,
  TIPO_PRODUTO_LABEL,
  beneficiosDoProduto,
  custoPorAula,
  descreverCobranca,
  descreverEntrega,
  precoResumido,
  regrasDoProduto,
  tituloDoProduto,
  type Produto,
  type ProdutoRequisito,
} from '../types'

/**
 * Tudo que o cartão do catálogo deixou de fora.
 *
 * Existe para que a visão principal possa ser curta sem que nada se
 * perca: cobrança, entrega, benefícios, regras de uso, requisitos de
 * compra, modalidades cobertas, sucessão e o custo por aula continuam
 * disponíveis — a um clique, não empilhados na grade.
 *
 * Painel lateral e não modal porque a grade continua visível ao lado:
 * dá para clicar de um produto para o outro e comparar sem fechar nada.
 */
export function DetalheProduto({
  produto: p,
  porId,
  requisitos,
  gestao,
  onEditar,
  onArquivar,
  onReativar,
  onFechar,
}: {
  produto: Produto
  porId: Map<string, Produto>
  requisitos: ProdutoRequisito[]
  gestao: boolean
  onEditar: () => void
  onArquivar: () => void
  onReativar: () => void
  onFechar: () => void
}) {
  const { data: modalidades } = useModalidades()
  const beneficios = beneficiosDoProduto(p, porId)
  const regras = regrasDoProduto(p)
  const porAula = custoPorAula(p)
  const sucessor = p.produto_sucessor_id ? porId.get(p.produto_sucessor_id) : null
  const naoElegiveis = (modalidades ?? []).filter((m) => !m.elegivel_turma_fixa)

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold leading-tight text-neutral-900">
            {tituloDoProduto(p)}
          </h3>
          <p className="mt-0.5 truncate text-xs text-neutral-400">{p.nome}</p>
        </div>
        <button
          onClick={onFechar}
          aria-label="Fechar detalhes"
          className="shrink-0 rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="font-display text-2xl font-bold leading-none text-neutral-900">
          {precoResumido(p)}
        </p>
        <p className="mt-1 text-xs text-neutral-500">{descreverCobranca(p)}</p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant={p.ativo ? 'success' : 'neutral'}>
            {p.ativo ? 'ativo' : 'arquivado'}
          </Badge>
          <Badge variant="neutral">{TIPO_PRODUTO_LABEL[p.tipo_produto]}</Badge>
          {!p.visivel_no_catalogo && (
            <Badge variant="neutral" className="gap-1">
              <EyeOff className="size-3" /> só a equipe
            </Badge>
          )}
        </div>

        {p.descricao && (
          <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">
            {p.descricao}
          </p>
        )}

        <Bloco titulo="Entrega">
          <p>{descreverEntrega(p)}</p>
        </Bloco>

        {beneficios.length > 0 && (
          <Bloco titulo="Benefícios">
            <ul className="flex flex-col gap-1">
              {beneficios.map((b) => (
                <li key={b} className="flex gap-1.5">
                  <span aria-hidden className="text-brand-400">
                    ·
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </Bloco>
        )}

        {regras.length > 0 && (
          <Bloco titulo="Regras de uso">
            <dl className="flex flex-col gap-1">
              {regras.map((r) => (
                <div key={r.rotulo} className="flex justify-between gap-3">
                  <dt className="text-neutral-500">{r.rotulo}</dt>
                  <dd className="shrink-0 text-right font-medium text-neutral-700">{r.valor}</dd>
                </div>
              ))}
            </dl>
          </Bloco>
        )}

        {requisitos.length > 0 && (
          <Bloco titulo="Quem pode comprar">
            <ul className="flex flex-col gap-1">
              {requisitos.map((r) => (
                <li key={r.id}>
                  {REQUISITO_LABEL[r.tipo]}
                  {r.tipo === 'checkins_wellhub' && r.parametro_int
                    ? ` — ${r.parametro_int} nos últimos ${r.janela_dias} dias`
                    : ''}
                </li>
              ))}
            </ul>
          </Bloco>
        )}

        {p.turmas_fixas > 0 && (
          <Bloco titulo="Modalidades bloqueadas">
            <p>
              {naoElegiveis.length > 0
                ? naoElegiveis.map((m) => m.nome).join(' · ')
                : 'Nenhuma — todas as modalidades aceitam.'}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-neutral-400">
              Regulamento 2.3.6. A regra é da modalidade e se edita em Grade de horários → Grupos
              e aulas. O banco recusa a matrícula numa turma bloqueada.
            </p>
          </Bloco>
        )}

        {sucessor && (
          <Bloco titulo="Ao fim do compromisso">
            <p className="flex items-center gap-1.5">
              vira <ArrowRight className="size-3 text-neutral-400" />
              <span className="font-medium text-neutral-700">{sucessor.nome}</span>
            </p>
            <p className="mt-1 text-[11px] leading-snug text-neutral-400">
              Regulamento 7.7: o semestral não se renova por mais seis — passa a mensal, no valor
              vigente do mesmo formato.
            </p>
          </Bloco>
        )}

        {porAula !== null && p.preco_centavos > 0 && (
          // Regulamento 2.4, bloco INTERNO: "nunca publicar estes
          // números". Esta tela é interna — é onde eles servem —, mas
          // fora da visão de catálogo, para ninguém ler de relance e
          // repetir para o aluno.
          <div className="mt-4 rounded-md border border-warning-200 bg-warning-50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-warning-700">
              <Lock className="size-3" />
              interno — não divulgar
            </p>
            <p className="mt-1 text-sm font-semibold text-neutral-800">
              {fmtCentavos(porAula)} por aula
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
              Serve para argumentar no atendimento, não para publicar.
            </p>
          </div>
        )}
      </div>

      {gestao && (
        <footer className="flex gap-2 border-t border-neutral-100 px-4 py-3">
          <button
            onClick={onEditar}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            <Pencil className="size-3.5" />
            Editar
          </button>
          {p.ativo ? (
            <button
              onClick={onArquivar}
              title="Arquivar produto"
              className="rounded-md px-3 py-2 text-sm font-medium text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-danger-50 hover:text-danger-600"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : (
            <button
              onClick={onReativar}
              title="Voltar ao catálogo"
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-success-50 hover:text-success-700"
            >
              <ArchiveRestore className="size-3.5" />
              Reativar
            </button>
          )}
        </footer>
      )}
    </aside>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-neutral-100 pt-3 text-xs leading-relaxed text-neutral-600">
      <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
        {titulo}
      </h4>
      {children}
    </section>
  )
}
