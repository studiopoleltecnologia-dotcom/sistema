import { useState, type ReactNode } from 'react'
import { MessageCircle } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { fmtData, fmtDataHora } from '../../../lib/datas'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useArquivarSolicitacao, useConfirmarCancelamentoPlano } from '../hooks/useMatriculas'
import type { SolicitacaoCancelamento } from '../types'

/**
 * Pedidos de cancelamento feitos pelo aluno no portal (regulamento 7.1).
 *
 * O pedido NÃO cancelou nada: é aqui que a gestão confirma. As datas do
 * cartão são o retrato do momento do pedido — "dentro do prazo" não vira
 * "fora" porque alguém demorou a abrir esta tela. Confirmar encerra a
 * assinatura exatamente em "ativo até" e manda ao aluno a confirmação por
 * escrito que o regulamento exige.
 */
export function SolicitacoesCancelamento({
  solicitacoes,
  gestao,
}: {
  solicitacoes: SolicitacaoCancelamento[]
  gestao: boolean
}) {
  const [resolvendo, setResolvendo] = useState<{
    s: SolicitacaoCancelamento
    modo: 'confirmar' | 'arquivar'
  } | null>(null)

  return (
    <>
      {!gestao && (
        <p className="text-sm text-neutral-500">
          Quem confirma o cancelamento é a gestão. Se o aluno falar com você, oriente que o pedido já foi
          registrado.
        </p>
      )}
      <div className="grid gap-3 xl:grid-cols-2">
        {solicitacoes.map((s) => (
          <CartaoSolicitacao
            key={s.id}
            s={s}
            gestao={gestao}
            onConfirmar={() => setResolvendo({ s, modo: 'confirmar' })}
            onArquivar={() => setResolvendo({ s, modo: 'arquivar' })}
          />
        ))}
      </div>
      {resolvendo && (
        <ResolverSolicitacao
          s={resolvendo.s}
          modo={resolvendo.modo}
          onFechar={() => setResolvendo(null)}
        />
      )}
    </>
  )
}

function CartaoSolicitacao({
  s,
  gestao,
  onConfirmar,
  onArquivar,
}: {
  s: SolicitacaoCancelamento
  gestao: boolean
  onConfirmar: () => void
  onArquivar: () => void
}) {
  const telefone = s.clientes?.telefone?.replace(/\D/g, '')
  const semestral = s.ciclos_compromisso > 1

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-warning-200 bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-bold text-neutral-900">
            {s.clientes?.nome ?? 'Aluno'}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {s.plano_nome} · {semestral ? `Semestral, ciclo ${s.ciclo_atual} de ${s.ciclos_compromisso}` : 'Mensal'}
          </p>
        </div>
        <Badge variant={s.dentro_prazo ? 'success' : 'warning'}>
          {s.dentro_prazo ? 'dentro do prazo' : 'fora do prazo'}
        </Badge>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Item rotulo="Pedido em">{fmtDataHora(s.solicitada_em)}</Item>
        <Item rotulo="Contratado em">{fmtData(s.data_contratacao)}</Item>
        <Item rotulo="Próxima renovação">{fmtData(s.proxima_renovacao)}</Item>
        <Item rotulo="Prazo do pedido">até {fmtData(s.prazo_limite)}</Item>
        <Item rotulo="Fica ativo até">
          <strong className="text-neutral-900">{fmtData(s.vigente_ate)}</strong>
        </Item>
        {s.devolucao_desconto_centavos !== null && (
          <Item rotulo="Devolução do desconto (7.4)">{fmtCentavos(s.devolucao_desconto_centavos)}</Item>
        )}
      </dl>

      {!s.dentro_prazo && (
        <p className="rounded-md bg-warning-50 px-2.5 py-1.5 text-xs text-warning-700">
          Chegou depois do prazo: a renovação de {fmtData(s.proxima_renovacao)} acontece e o plano encerra
          no fim do ciclo seguinte (item 7.1).
        </p>
      )}

      <p className="text-xs text-neutral-600">
        <span className="font-medium text-neutral-500">Motivo:</span>{' '}
        {s.motivo ? `“${s.motivo}”` : <span className="text-neutral-400">não informado</span>}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2.5 text-xs text-neutral-500">
        {s.clientes?.telefone && (
          <a
            href={telefone ? `https://wa.me/55${telefone.replace(/^55/, '')}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
          >
            <MessageCircle className="size-3.5" />
            {s.clientes.telefone}
          </a>
        )}
        {s.clientes?.email && <span className="truncate">{s.clientes.email}</span>}
        {gestao && (
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={onArquivar}>
              Arquivar
            </Button>
            <Button size="sm" onClick={onConfirmar}>
              Confirmar cancelamento
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-neutral-400">{rotulo}</dt>
      <dd className="text-neutral-700">{children}</dd>
    </div>
  )
}

function ResolverSolicitacao({
  s,
  modo,
  onFechar,
}: {
  s: SolicitacaoCancelamento
  modo: 'confirmar' | 'arquivar'
  onFechar: () => void
}) {
  const confirmar = useConfirmarCancelamentoPlano()
  const arquivar = useArquivarSolicitacao()
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const pendente = confirmar.isPending || arquivar.isPending
  const nome = s.clientes?.nome ?? 'o aluno'

  function executar() {
    setErro(null)
    const args = { solicitacaoId: s.id, observacao }
    const opcoes = {
      onSuccess: onFechar,
      onError: (e: unknown) => setErro((e as { message?: string })?.message ?? 'Não foi possível concluir.'),
    }
    if (modo === 'confirmar') confirmar.mutate(args, opcoes)
    else arquivar.mutate(args, opcoes)
  }

  return (
    <Modal
      title={modo === 'confirmar' ? 'Confirmar o cancelamento?' : 'Arquivar o pedido?'}
      onFechar={() => !pendente && onFechar()}
    >
      <div className="flex flex-col gap-3 text-sm text-neutral-600">
        {modo === 'confirmar' ? (
          <>
            <p>
              O plano de <strong className="text-neutral-900">{nome}</strong> fica ativo até{' '}
              <strong className="text-neutral-900">{fmtData(s.vigente_ate)}</strong> e não renova depois disso.
              {!s.dentro_prazo && <> A renovação de {fmtData(s.proxima_renovacao)} ainda acontece.</>}
            </p>
            <p>
              Cobranças previstas para depois dessa data são canceladas, e a vaga de turma fixa (se houver) volta
              para a grade. {nome} recebe a confirmação por e-mail.
            </p>
            {s.devolucao_desconto_centavos !== null && (
              <p className="rounded-md bg-warning-50 px-2.5 py-1.5 text-xs text-warning-700">
                Semestral encerrado antes do fim: devolução do desconto estimada em{' '}
                {fmtCentavos(s.devolucao_desconto_centavos)} (item 7.4). O sistema não lança essa cobrança — isenta
                com atestado ou mudança de cidade (7.5).
              </p>
            )}
          </>
        ) : (
          <p>
            O pedido sai da fila <strong className="text-neutral-900">sem cancelar nada</strong>: o plano de {nome}{' '}
            continua renovando normalmente. Use quando o aluno desistir ou quando o caso foi resolvido por outro
            caminho.
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            {modo === 'confirmar' ? 'Recado para o aluno (vai no e-mail, opcional)' : 'Observação (opcional)'}
          </span>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
          />
        </label>

        {erro && <p className="text-sm text-danger-600">{erro}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onFechar} disabled={pendente} autoFocus>
          Voltar
        </Button>
        <Button variant={modo === 'confirmar' ? 'danger' : 'primary'} onClick={executar} loading={pendente}>
          {modo === 'confirmar' ? 'Confirmar cancelamento' : 'Arquivar pedido'}
        </Button>
      </div>
    </Modal>
  )
}
