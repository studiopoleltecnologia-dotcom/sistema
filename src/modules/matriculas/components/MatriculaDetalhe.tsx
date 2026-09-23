import { CalendarRange, Coins, History } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { PainelLateral } from '../../../components/ui/PainelLateral'
import { fmtData, fmtDataHora } from '../../../lib/datas'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useHistoricoMatricula } from '../hooks/useMatriculas'
import { TurmasVinculadas } from './TurmasVinculadas'
import type { MatriculaCompleta } from '../types'

/**
 * A matrícula por inteiro: situação, turmas, histórico e as ações.
 *
 * As ações moravam no cartão da lista — “renovar agora”, “dar crédito”,
 * “marcar inadimplente”, “cancelar assinatura”, quatro botões visíveis
 * em cada linha. Duas delas mexem em dinheiro e uma encerra contrato;
 * ficar a um clique de distância, repetidas dezenas de vezes na tela, é
 * convite para o clique errado.
 *
 * Agora o cartão é só resumo e o que decide mora aqui, junto do
 * histórico que explica por que aquela decisão faz sentido — que é o
 * contexto que faltava para agir com segurança.
 */
export function MatriculaDetalhe({
  matricula: m,
  gestao,
  pedidoCancelamento,
  onRenovar,
  onBonus,
  onInadimplir,
  onCancelar,
  onFechar,
}: {
  matricula: MatriculaCompleta
  gestao: boolean
  pedidoCancelamento: boolean
  onRenovar: () => void
  onBonus: () => void
  onInadimplir: () => void
  onCancelar: () => void
  onFechar: () => void
}) {
  const s = m.saldo
  const { data: historico, isLoading } = useHistoricoMatricula(s.matricula_id ?? null)
  const emAberto = s.status === 'inadimplente'
  const cancelando = Boolean(s.cancelamento_efetivo_em)

  return (
    <PainelLateral
      titulo={m.clienteNome}
      subtitulo={m.produto?.nome ?? 'Produto'}
      onFechar={onFechar}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-neutral-50 py-2.5">
            <div
              className={`font-display text-xl font-bold leading-none ${
                m.ehTurmaFixa ? 'text-neutral-900' : (s.saldo ?? 0) > 0 ? 'text-neutral-900' : 'text-danger-600'
              }`}
            >
              {m.ehTurmaFixa ? (
                <CalendarRange className="mx-auto size-5 text-success-600" />
              ) : (
                s.saldo
              )}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-400">
              {m.ehTurmaFixa ? 'turma fixa' : 'créditos'}
            </div>
          </div>
          <div className="rounded-lg bg-neutral-50 py-2.5">
            <div className="font-display text-xl font-bold leading-none text-neutral-900">
              {fmtCentavos(s.preco_contratado_centavos ?? 0)}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-400">
              por ciclo
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {emAberto && <Badge variant="danger">pagamento em aberto</Badge>}
          {pedidoCancelamento && <Badge variant="warning">pediu cancelamento</Badge>}
          {cancelando && (
            <Badge variant="warning">cancela {fmtData(s.cancelamento_efetivo_em)}</Badge>
          )}
          {!cancelando && s.renova_automaticamente && (
            <Badge variant="neutral">renova sozinha</Badge>
          )}
          <Badge variant="neutral">ciclo até {fmtData(s.data_fim)}</Badge>
          {!m.ehTurmaFixa && s.proxima_validade && s.proxima_validade !== s.data_fim && (
            <Badge variant="neutral">créditos vencem {fmtData(s.proxima_validade)}</Badge>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-neutral-100 pt-3 text-sm">
          <Dado
            rotulo="Ciclo"
            valor={
              (s.ciclos_compromisso ?? 1) > 1
                ? `${s.ciclo_atual} de ${s.ciclos_compromisso}`
                : String(s.ciclo_atual ?? 1)
            }
          />
          <Dado rotulo="Início" valor={fmtData(s.data_inicio)} />
          <Dado rotulo="Situação" valor={s.status ?? '—'} />
        </dl>

        {m.ehTurmaFixa && (
          <div className="border-t border-neutral-100 pt-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              {m.turmas.length + m.turmasFuturas.length === 1
                ? 'Turma vinculada'
                : 'Turmas vinculadas'}
            </p>
            <TurmasVinculadas matricula={m} gestao={gestao} />
          </div>
        )}

        {gestao && (
          <div className="flex flex-col gap-1.5 border-t border-neutral-100 pt-3">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Ações
            </p>
            {!cancelando && (
              <Acao
                onClick={onRenovar}
                titulo="Renovar agora"
                ajuda="Recebeu por fora e quer liberar o próximo ciclo sem esperar a virada."
              />
            )}
            <Acao
              onClick={onBonus}
              titulo="Dar crédito"
              ajuda="Cortesia ou reposição — entra no saldo com prazo e motivo."
            />
            {s.status === 'ativa' && (
              <Acao
                onClick={onInadimplir}
                titulo="Marcar pagamento em aberto"
                ajuda="Bloqueia novos agendamentos até regularizar. Não apaga crédito."
              />
            )}
            {!cancelando && (
              <Acao
                onClick={onCancelar}
                tom="perigo"
                titulo="Cancelar assinatura"
                ajuda="Para a cobrança automática. O ciclo já pago continua valendo."
              />
            )}
          </div>
        )}

        <div className="border-t border-neutral-100 pt-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            <History className="size-3" />
            Histórico
          </h3>
          {isLoading && <p className="text-xs text-neutral-400">Carregando…</p>}
          {!isLoading && (historico ?? []).length === 0 && (
            <p className="text-xs text-neutral-400">Nada registrado ainda.</p>
          )}
          <ul className="flex flex-col divide-y divide-neutral-100">
            {(historico ?? []).map((h) => (
              <li key={h.id} className="flex items-start gap-2 py-2">
                {h.tipo === 'credito' ? (
                  <Coins className="mt-0.5 size-3.5 shrink-0 text-brand-400" />
                ) : (
                  <span className="mt-0.5 size-3.5 shrink-0 text-center text-[11px] font-bold text-success-600">
                    R$
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-neutral-700">{h.titulo}</p>
                  {h.detalhe && (
                    <p className="text-[11px] text-neutral-400">{h.detalhe}</p>
                  )}
                  <p className="text-[10px] text-neutral-300">{fmtDataHora(h.quando)}</p>
                </div>
                {h.valor !== null && (
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-neutral-700">
                    {fmtCentavos(h.valor)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PainelLateral>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{rotulo}</dt>
      <dd className="text-sm text-neutral-700">{valor}</dd>
    </div>
  )
}

function Acao({
  onClick,
  titulo,
  ajuda,
  tom,
}: {
  onClick: () => void
  titulo: string
  ajuda: string
  tom?: 'perigo'
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left transition ${
        tom === 'perigo'
          ? 'border-danger-200 hover:border-danger-300 hover:bg-danger-50'
          : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
      }`}
    >
      <span
        className={`block text-sm font-medium ${
          tom === 'perigo' ? 'text-danger-700' : 'text-neutral-800'
        }`}
      >
        {titulo}
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{ajuda}</span>
    </button>
  )
}
