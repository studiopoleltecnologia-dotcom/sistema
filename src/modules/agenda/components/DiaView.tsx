import { useState } from 'react'
import { Check, ChevronDown, UserPlus, X } from 'lucide-react'
import { cn } from '../../../components/ui/cn'
import { useClientes } from '../../clientes/hooks/useClientes'
import { corDaTurma, faixaOcupacao } from '../cores'
import {
  useAgendarAula,
  useCancelarAgendamento,
  useDia,
  useRegistrarPresenca,
  useTurmas,
} from '../hooks/useAgenda'
import {
  CANAL_LABEL,
  fmtHora,
  type AgendamentoComCliente,
  type CanalAula,
  type Presenca,
  type TurmaComProfessora,
} from '../types'

/**
 * Painel do dia. Mesmo conteúdo de sempre — agendados, presença, inclusão
 * de aluno, canal de acesso, cancelamento —, reorganizado para caber numa
 * coluna estreita sem vazar.
 *
 * O que causava o overflow: os dois `<select>` e o botão viviam numa
 * `flex` sem quebra, e `max-w-44` num deles fixava 11rem dentro de uma
 * coluna de 21rem. Agora os campos empilham e todo bloco carrega `min-w-0`,
 * que é o que efetivamente permite um filho encolher dentro de um flex.
 *
 * A turma clicada na grade abre expandida; as outras do dia ficam
 * recolhidas, para o painel responder "essa aula aqui" sem esconder o
 * resto do dia.
 */
export function DiaView({
  data,
  turmaSelecionada,
  onSelecionarTurma,
}: {
  data: string
  turmaSelecionada?: string | null
  onSelecionarTurma?: (turmaId: string | null) => void
}) {
  const { data: turmas } = useTurmas()
  const { data: dia, isLoading } = useDia(data)
  const diaSemana = new Date(data + 'T00:00:00').getDay()
  const doDia = (turmas ?? []).filter((t) => t.dia_semana === diaSemana)

  if (isLoading) return <p className="px-1 text-sm text-neutral-400">Carregando…</p>
  if (doDia.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 py-10 text-center text-sm text-neutral-400">
        Nenhuma turma neste dia.
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {doDia.map((turma) => (
        <TurmaDoDia
          key={turma.id}
          turma={turma}
          data={data}
          // Sem seleção, a primeira aula do dia já vem aberta: painel todo
          // recolhido obrigaria um clique só para ver qualquer coisa.
          aberta={turmaSelecionada ? turma.id === turmaSelecionada : turma.id === doDia[0].id}
          onAlternar={() =>
            onSelecionarTurma?.(turma.id === turmaSelecionada ? null : turma.id)
          }
          agendamentos={(dia?.agendamentos ?? []).filter((a) => a.turma_id === turma.id)}
          presencas={(dia?.presencas ?? []).filter((p) => p.turma_id === turma.id)}
        />
      ))}
    </div>
  )
}

function TurmaDoDia({
  turma,
  data,
  aberta,
  onAlternar,
  agendamentos,
  presencas,
}: {
  turma: TurmaComProfessora
  data: string
  aberta: boolean
  onAlternar: () => void
  agendamentos: AgendamentoComCliente[]
  presencas: Presenca[]
}) {
  const { data: clientes } = useClientes()
  const agendar = useAgendarAula()
  const cancelar = useCancelarAgendamento()
  const presenca = useRegistrarPresenca()

  const [novaClienteId, setNovaClienteId] = useState('')
  const [novoCanal, setNovoCanal] = useState<CanalAula>('mensalista')
  const [erro, setErro] = useState<string | null>(null)

  const cor = corDaTurma(turma)
  const faixa = faixaOcupacao(agendamentos.length, turma.capacidade)
  const vagas = Math.max(turma.capacidade - agendamentos.length, 0)

  const presencaDe = (clienteId: string) => presencas.find((p) => p.cliente_id === clienteId)

  const disponiveis = (clientes ?? []).filter(
    (c) => !agendamentos.some((a) => a.cliente_id === c.id),
  )

  function adicionar() {
    if (!novaClienteId) return
    setErro(null)
    agendar.mutate(
      { cliente_id: novaClienteId, turma_id: turma.id, data, canal: novoCanal },
      {
        onSuccess: () => setNovaClienteId(''),
        onError: (e) => setErro((e as Error).message),
      },
    )
  }

  const campo =
    'w-full min-w-0 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-800 outline-none transition focus:border-brand-500'

  return (
    <div
      className="min-w-0 overflow-hidden rounded-lg border bg-white"
      style={{ borderColor: cor.borda }}
    >
      <button
        onClick={onAlternar}
        aria-expanded={aberta}
        className="flex w-full min-w-0 items-center gap-2 border-l-4 px-2.5 py-2 text-left transition hover:bg-neutral-50"
        style={{ borderLeftColor: cor.acento, background: aberta ? cor.bg : undefined }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-bold tabular-nums" style={{ color: cor.texto }}>
              {fmtHora(turma.horario)}
            </span>
            <span className="truncate text-[13px] font-semibold text-ink">{turma.modalidade}</span>
          </div>
          <div className="truncate text-[10px] text-neutral-500">
            {[turma.professora.nome, turma.sala?.nome].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
          style={{
            background: faixa.pastilha,
            color: faixa.chave === 'lotada' ? '#fff' : faixa.barra,
          }}
        >
          {agendamentos.length}/{turma.capacidade}
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-neutral-400 transition-transform',
            aberta && 'rotate-180',
          )}
        />
      </button>

      {aberta && (
        <div className="min-w-0 border-t border-neutral-100 px-2.5 py-2.5">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-neutral-400">
            {faixa.label}
            {faixa.chave !== 'lotada' && ` · ${vagas} vaga${vagas === 1 ? '' : 's'} livre${vagas === 1 ? '' : 's'}`}
          </p>

          <ul className="mb-3 flex min-w-0 flex-col gap-1">
            {agendamentos.map((a) => {
              const p = presencaDe(a.cliente_id)
              return (
                <li
                  key={a.id}
                  className="flex min-w-0 items-center gap-1.5 rounded-md bg-neutral-50 px-1.5 py-1"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-neutral-800">
                      {a.cliente.nome}
                    </div>
                    <div className="text-[10px] text-neutral-400">{CANAL_LABEL[a.canal]}</div>
                  </div>
                  <button
                    onClick={() =>
                      presenca.mutate({
                        turma_id: turma.id,
                        data,
                        cliente_id: a.cliente_id,
                        presente: true,
                      })
                    }
                    title="Marcar presença"
                    aria-label={`Marcar presença de ${a.cliente.nome}`}
                    className={cn(
                      'shrink-0 rounded p-1 transition',
                      p?.presente === true
                        ? 'bg-success-500 text-white'
                        : 'border border-neutral-200 text-neutral-400 hover:border-success-500 hover:text-success-700',
                    )}
                  >
                    <Check className="size-3" />
                  </button>
                  <button
                    onClick={() =>
                      presenca.mutate({
                        turma_id: turma.id,
                        data,
                        cliente_id: a.cliente_id,
                        presente: false,
                      })
                    }
                    title="Marcar falta"
                    aria-label={`Marcar falta de ${a.cliente.nome}`}
                    className={cn(
                      'shrink-0 rounded p-1 transition',
                      p?.presente === false
                        ? 'bg-neutral-700 text-white'
                        : 'border border-neutral-200 text-neutral-400 hover:border-neutral-400 hover:text-neutral-700',
                    )}
                  >
                    <X className="size-3" />
                  </button>
                  <button
                    onClick={() => cancelar.mutate(a.id)}
                    title="Cancelar agendamento (libera a vaga)"
                    aria-label={`Cancelar agendamento de ${a.cliente.nome}`}
                    className="shrink-0 px-0.5 text-sm leading-none text-neutral-300 transition hover:text-danger-600"
                  >
                    ×
                  </button>
                </li>
              )
            })}
            {agendamentos.length === 0 && (
              <li className="rounded-md bg-neutral-50 px-2 py-2 text-center text-[11px] text-neutral-400">
                Ninguém agendado.
              </li>
            )}
          </ul>

          {/* Campos empilhados: é o que impede o vazamento numa coluna
              estreita, e de quebra deixa cada rótulo legível. */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <select
              value={novaClienteId}
              onChange={(e) => setNovaClienteId(e.target.value)}
              aria-label="Aluno a agendar"
              className={campo}
            >
              <option value="">Adicionar aluno…</option>
              {disponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <div className="flex min-w-0 items-center gap-1.5">
              <select
                value={novoCanal}
                onChange={(e) => setNovoCanal(e.target.value as CanalAula)}
                aria-label="Tipo de acesso"
                className={campo}
              >
                {Object.entries(CANAL_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                onClick={adicionar}
                disabled={!novaClienteId || agendar.isPending}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
              >
                <UserPlus className="size-3" />
                Agendar
              </button>
            </div>
            {erro && <p className="text-[11px] text-danger-600">{erro}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
