import { useState } from 'react'
import { CheckCircle2, Clock, ShieldAlert, Wallet } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { fmtDataHora } from '../../../lib/datas'
import { fmtCentavos } from '../../../lib/dinheiro'
import {
  useAprovarContratacao,
  useCancelarSolicitacao,
  useConfirmarPagamento,
  useRecusarContratacao,
} from '../hooks/useContratacoes'
import type { Solicitacao } from '../api/contratacoes'

const FORMAS = [
  { valor: 'pix', label: 'Pix' },
  { valor: 'cartao', label: 'Cartão' },
  { valor: 'dinheiro', label: 'Dinheiro' },
  { valor: 'transferencia', label: 'Transferência' },
]

/**
 * A fila de contratações — a "parte só para essas aprovações" pedida na
 * revisão (D14).
 *
 * O que esta tela torna visível, e que antes não existia em lugar nenhum:
 * **entre contratar e pagar existe um intervalo**. Antes, vender era um
 * clique que já criava a matrícula ativa e liberava os créditos; o aluno
 * saía podendo agendar sem ter pago, e a "cobrança prevista" ficava no
 * financeiro esperando alguém lembrar de dar baixa.
 *
 * Agora nada disso acontece até o pagamento ser confirmado. Por isso a
 * fila tem dois estágios visíveis, e não um: o que espera decisão e o
 * que já foi decidido mas ainda não entrou dinheiro.
 */
export function AprovacoesContratacao({
  solicitacoes,
  gestao,
}: {
  solicitacoes: Solicitacao[]
  gestao: boolean
}) {
  const [acao, setAcao] = useState<{
    s: Solicitacao
    modo: 'aprovar' | 'recusar' | 'pagar'
  } | null>(null)

  const aguardando = solicitacoes.filter((s) => s.status === 'aguardando_aprovacao')
  const aPagar = solicitacoes.filter((s) => s.status === 'aguardando_pagamento')

  if (solicitacoes.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nenhuma contratação em aberto"
        description="Quando alguém da equipe vender um plano ou um aluno contratar pelo portal, o pedido aparece aqui até o pagamento ser confirmado."
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {!gestao && (
        <p className="text-sm text-neutral-500">
          Quem aprova e dá baixa no pagamento é a gestão. Os pedidos que você registrar aparecem
          aqui aguardando essa decisão.
        </p>
      )}

      {aguardando.length > 0 && (
        <Secao
          icone={Clock}
          titulo="Aguardando aprovação"
          ajuda="Ninguém foi matriculado ainda e nenhum crédito foi liberado."
        >
          {aguardando.map((s) => (
            <Cartao
              key={s.id}
              s={s}
              gestao={gestao}
              onAprovar={() => setAcao({ s, modo: 'aprovar' })}
              onRecusar={() => setAcao({ s, modo: 'recusar' })}
            />
          ))}
        </Secao>
      )}

      {aPagar.length > 0 && (
        <Secao
          icone={Wallet}
          titulo="Aprovado, aguardando pagamento"
          ajuda="A matrícula é criada e os créditos liberados no momento em que o pagamento for confirmado — não antes."
        >
          {aPagar.map((s) => (
            <Cartao
              key={s.id}
              s={s}
              gestao={gestao}
              onPagar={() => setAcao({ s, modo: 'pagar' })}
              onRecusar={() => setAcao({ s, modo: 'recusar' })}
            />
          ))}
        </Secao>
      )}

      {acao && <Resolver s={acao.s} modo={acao.modo} onFechar={() => setAcao(null)} />}
    </div>
  )
}

function Secao({
  icone: Icone,
  titulo,
  ajuda,
  children,
}: {
  icone: typeof Clock
  titulo: string
  ajuda: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-neutral-800">
        <Icone className="size-4 text-neutral-400" />
        {titulo}
      </h3>
      <p className="mb-2.5 mt-0.5 text-xs text-neutral-500">{ajuda}</p>
      <div className="grid gap-3 xl:grid-cols-2">{children}</div>
    </section>
  )
}

function Cartao({
  s,
  gestao,
  onAprovar,
  onRecusar,
  onPagar,
}: {
  s: Solicitacao
  gestao: boolean
  onAprovar?: () => void
  onRecusar?: () => void
  onPagar?: () => void
}) {
  const cancelar = useCancelarSolicitacao()

  return (
    <article className="rounded-lg border border-neutral-200/80 bg-white p-3.5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-display text-sm font-bold text-neutral-900">{s.cliente_nome}</h4>
          <p className="mt-0.5 text-sm text-neutral-600">{s.produto_nome}</p>
        </div>
        <span className="shrink-0 font-display text-base font-bold text-neutral-900">
          {(s.preco_centavos ?? 0) === 0 ? 'cortesia' : fmtCentavos(s.preco_centavos ?? 0)}
        </span>
      </header>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="neutral">{s.origem === 'portal' ? 'pelo portal' : 'pela equipe'}</Badge>
        {s.produto_status === 'legado' && <Badge variant="warning">plano antigo</Badge>}
        {(s.turmas?.length ?? 0) > 0 && (
          <Badge variant="neutral">
            {s.turmas!.length} turma{s.turmas!.length > 1 ? 's' : ''} fixa
            {s.turmas!.length > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* A justificativa é a autorização de exceção. Fica visível na fila
          porque é justamente o caso que merece um segundo olhar antes de
          aprovar — não adianta gravar em auditoria e esconder aqui. */}
      {s.justificativa && (
        <p className="mt-2 flex gap-1.5 rounded-md bg-warning-50 px-2.5 py-1.5 text-xs leading-relaxed text-warning-800">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <b>Exceção autorizada:</b> {s.justificativa}
          </span>
        </p>
      )}

      <p className="mt-2 text-[11px] text-neutral-400">
        Pedido em {fmtDataHora(s.solicitada_em!)}
        {s.decidida_em && ` · aprovado em ${fmtDataHora(s.decidida_em)}`}
      </p>

      {gestao && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-neutral-100 pt-2">
          {onAprovar && (
            <Button size="sm" onClick={onAprovar}>
              Aprovar
            </Button>
          )}
          {onPagar && (
            <Button size="sm" onClick={onPagar}>
              Registrar pagamento
            </Button>
          )}
          {onRecusar && (
            <button
              onClick={onRecusar}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 transition hover:bg-danger-50 hover:text-danger-600"
            >
              Recusar
            </button>
          )}
          <button
            onClick={() => cancelar.mutate(s.id!)}
            title="O aluno desistiu — tira da fila sem virar recusa"
            className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            desistiu
          </button>
        </div>
      )}
    </article>
  )
}

function Resolver({
  s,
  modo,
  onFechar,
}: {
  s: Solicitacao
  modo: 'aprovar' | 'recusar' | 'pagar'
  onFechar: () => void
}) {
  const aprovar = useAprovarContratacao()
  const recusar = useRecusarContratacao()
  const pagar = useConfirmarPagamento()
  const [motivo, setMotivo] = useState('')
  const [forma, setForma] = useState('pix')
  const [erro, setErro] = useState<string | null>(null)

  const cortesia = (s.preco_centavos ?? 0) === 0
  const ocupado = aprovar.isPending || recusar.isPending || pagar.isPending

  function confirmar() {
    setErro(null)
    const aoErro = (e: unknown) => setErro((e as Error).message)
    if (modo === 'aprovar') {
      aprovar.mutate({ id: s.id!, motivo: motivo.trim() || undefined }, { onSuccess: onFechar, onError: aoErro })
    } else if (modo === 'recusar') {
      if (!motivo.trim()) return setErro('Diga por que está recusando — é o que o aluno vai ler.')
      recusar.mutate({ id: s.id!, motivo: motivo.trim() }, { onSuccess: onFechar, onError: aoErro })
    } else {
      pagar.mutate({ id: s.id!, forma }, { onSuccess: onFechar, onError: aoErro })
    }
  }

  const titulo =
    modo === 'aprovar' ? 'Aprovar contratação' : modo === 'recusar' ? 'Recusar' : 'Registrar pagamento'

  return (
    <Modal title={titulo} onFechar={onFechar} size="sm">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-neutral-600">
          <b>{s.cliente_nome}</b> · {s.produto_nome} ·{' '}
          {cortesia ? 'cortesia' : fmtCentavos(s.preco_centavos ?? 0)}
        </p>

        {modo === 'aprovar' && (
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">
            {cortesia
              ? 'Cortesia não gera cobrança: aprovar já matricula e libera os créditos.'
              : 'Aprovar não matricula ainda — a matrícula e os créditos saem quando o pagamento for confirmado.'}
          </p>
        )}

        {modo === 'pagar' && (
          <>
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">
              Isto cria a matrícula, libera os créditos e dá baixa na entrada do Financeiro, com a
              data de hoje no caixa.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                Como o aluno pagou
              </label>
              <Select value={forma} onChange={(e) => setForma(e.target.value)}>
                {FORMAS.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}

        {modo !== 'pagar' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              {modo === 'recusar' ? 'Motivo da recusa *' : 'Observação (opcional)'}
            </label>
            <textarea
              autoFocus
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                modo === 'recusar'
                  ? 'Ex.: o aluno pediu outro plano; turma sem vaga'
                  : 'Fica no histórico do pedido'
              }
              className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
            />
          </div>
        )}

        {erro && <p className="text-sm text-danger-600">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} loading={ocupado}>
            {modo === 'aprovar' ? 'Aprovar' : modo === 'recusar' ? 'Recusar' : 'Confirmar pagamento'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
