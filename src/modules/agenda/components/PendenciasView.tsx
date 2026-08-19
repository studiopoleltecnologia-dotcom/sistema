import { useState } from 'react'
import type { CheckinPendente } from '../api/agenda'
import { useCheckinsPendentes, useResolverCheckinPendente, useTurmas } from '../hooks/useAgenda'
import { DIAS_SEMANA, fmtHora } from '../types'

// Fila de check-ins que o sistema se recusou a atribuir sozinho.
// Existe porque o horário não identifica a turma quando duas salas têm
// aula na mesma hora — e chutar significa pagar a professora errada.

export function PendenciasView() {
  const { data: pendencias, isLoading } = useCheckinsPendentes()

  if (isLoading) return <p className="text-sm text-neutral-400">Carregando…</p>
  const fila = pendencias ?? []

  if (fila.length === 0)
    return (
      <p className="text-sm text-neutral-400">
        Nenhum check-in aguardando atribuição. Todo check-in do Wellhub caiu numa turma.
      </p>
    )

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm text-neutral-500">
        Estes check-ins foram validados pelo Wellhub, mas o sistema não conseguiu dizer
        com certeza a qual turma pertencem. Enquanto estiverem aqui, não contam presença
        nem pagamento de professora — e a conciliação do mês fica travada.
      </p>
      <div className="flex flex-col gap-3">
        {fila.map((p) => (
          <LinhaPendencia key={p.id} pendencia={p} />
        ))}
      </div>
    </div>
  )
}

function LinhaPendencia({ pendencia: p }: { pendencia: CheckinPendente }) {
  const resolver = useResolverCheckinPendente()
  const { data: turmas } = useTurmas()
  const [descartando, setDescartando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const hora = new Date(p.momento).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
  const dia = new Date(p.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR')

  // Sem candidata (motivo `sem_turma`) a equipe escolhe entre as turmas do
  // mesmo dia da semana — o banco recusa qualquer outra.
  const doDia = (turmas ?? []).filter((t) => t.dia_semana === p.dia_semana)

  function aplicar(turmaId: string | null) {
    setErro(null)
    resolver.mutate(
      { pendencia_id: p.id, turma_id: turmaId, observacao: turmaId ? null : motivo },
      { onError: (e) => setErro((e as Error).message) },
    )
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-sm font-medium text-neutral-800">{p.cliente}</span>
          {p.gympass_id && (
            <span className="ml-2 text-xs text-neutral-400">Wellhub {p.gympass_id}</span>
          )}
        </div>
        <span className="text-xs text-neutral-400">
          {DIAS_SEMANA[p.dia_semana]}, {dia} às {hora}
        </span>
      </div>

      {p.motivo === 'sem_turma' ? (
        <p className="mb-3 text-xs text-warning-700">
          Nenhuma turma cadastrada nesse horário. Escolha a turma correta ou descarte.
        </p>
      ) : (
        <p className="mb-3 text-xs text-neutral-500">
          {p.candidatas.length} turmas acontecem nesse horário. Qual delas?
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {(p.motivo === 'sem_turma'
          ? doDia.map((t) => ({
              turma_id: t.id,
              horario: t.horario,
              modalidade: t.modalidade,
              sala: t.sala?.nome ?? null,
              professora: t.professora?.nome ?? null,
            }))
          : p.candidatas
        ).map((c) => (
          <button
            key={c.turma_id}
            onClick={() => aplicar(c.turma_id)}
            disabled={resolver.isPending}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-left text-xs transition hover:border-brand-500 hover:bg-brand-50 disabled:opacity-50"
          >
            <span className="font-medium text-neutral-800">{fmtHora(c.horario)}</span>{' '}
            <span className="text-neutral-600">{c.modalidade}</span>
            {c.sala && <span className="text-neutral-400"> · {c.sala}</span>}
            {c.professora && <span className="text-neutral-400"> · {c.professora}</span>}
          </button>
        ))}
      </div>

      {descartando ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por que descartar? (obrigatório)"
            className="w-72 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs outline-none transition focus:border-brand-500"
          />
          <button
            onClick={() => aplicar(null)}
            disabled={resolver.isPending || motivo.trim() === ''}
            className="rounded-md bg-danger-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-danger-700 disabled:opacity-50"
          >
            Confirmar descarte
          </button>
          <button
            onClick={() => setDescartando(false)}
            className="text-xs text-neutral-400 transition hover:text-neutral-700"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setDescartando(true)}
          className="text-xs text-neutral-400 transition hover:text-danger-700"
        >
          Descartar
        </button>
      )}

      {erro && <p className="mt-2 text-xs text-danger-700">{erro}</p>}
    </div>
  )
}
