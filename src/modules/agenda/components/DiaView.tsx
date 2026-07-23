import { useState } from 'react'
import { useClientes } from '../../clientes/hooks/useClientes'
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

const inputCls =
  'rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none transition focus:border-brand-500'

/** Visão do dia: turmas com agendadas, presença e inclusão na hora. */
export function DiaView({ data }: { data: string }) {
  const { data: turmas } = useTurmas()
  const { data: dia, isLoading } = useDia(data)
  const diaSemana = new Date(data + 'T00:00:00').getDay()
  const doDia = (turmas ?? []).filter((t) => t.dia_semana === diaSemana)

  if (isLoading) return <p className="text-sm text-neutral-400">Carregando…</p>
  if (doDia.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-400">
        Nenhuma turma neste dia.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {doDia.map((turma) => (
        <TurmaDoDia
          key={turma.id}
          turma={turma}
          data={data}
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
  agendamentos,
  presencas,
}: {
  turma: TurmaComProfessora
  data: string
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

  const presencaDe = (clienteId: string) =>
    presencas.find((p) => p.cliente_id === clienteId)

  // clientes ainda sem agendamento nesta turma/dia
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

  return (
    <div className="rounded-lg border border-neutral-100 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-neutral-900">
            {fmtHora(turma.horario)} — {turma.modalidade}
          </span>
          {turma.sala && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
              {turma.sala.nome}
            </span>
          )}
          <span className="text-xs text-neutral-400">{turma.professora.nome}</span>
        </div>
        <span
          className={`text-xs ${
            agendamentos.length >= turma.capacidade ? 'text-red-600' : 'text-neutral-400'
          }`}
        >
          {agendamentos.length}/{turma.capacidade} vagas
        </span>
      </div>

      <ul className="mb-3 flex flex-col gap-1">
        {agendamentos.map((a) => {
          const p = presencaDe(a.cliente_id)
          return (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-neutral-800">{a.cliente.nome}</span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                {CANAL_LABEL[a.canal]}
              </span>
              <button
                onClick={() =>
                  presenca.mutate({
                    turma_id: turma.id,
                    data,
                    cliente_id: a.cliente_id,
                    presente: true,
                  })
                }
                className={`rounded px-2 py-0.5 text-xs transition ${
                  p?.presente === true
                    ? 'bg-brand-600 font-medium text-white'
                    : 'border border-neutral-200 text-neutral-500 hover:border-brand-500'
                }`}
              >
                Presente
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
                className={`rounded px-2 py-0.5 text-xs transition ${
                  p?.presente === false
                    ? 'bg-neutral-700 font-medium text-white'
                    : 'border border-neutral-200 text-neutral-500 hover:border-neutral-400'
                }`}
              >
                Faltou
              </button>
              <button
                onClick={() => cancelar.mutate(a.id)}
                title="Cancelar agendamento (libera a vaga)"
                className="px-1 text-xs text-neutral-300 transition hover:text-red-500"
              >
                ×
              </button>
            </li>
          )
        })}
        {agendamentos.length === 0 && (
          <li className="text-xs text-neutral-300">Ninguém agendado.</li>
        )}
      </ul>

      <div className="flex items-center gap-1.5">
        <select
          value={novaClienteId}
          onChange={(e) => setNovaClienteId(e.target.value)}
          className={`${inputCls} max-w-44 flex-1`}
        >
          <option value="">Adicionar aluno…</option>
          {disponiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select
          value={novoCanal}
          onChange={(e) => setNovoCanal(e.target.value as CanalAula)}
          className={inputCls}
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
          className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          Agendar
        </button>
        {erro && <span className="text-xs text-red-600">{erro}</span>}
      </div>
    </div>
  )
}
