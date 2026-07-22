import { useState } from 'react'
import { fmtData } from '../../lib/datas'
import { fmtHora } from './types'
import {
  useCancelarReserva,
  useConfigAgendamento,
  useGradePublica,
  useMinhasReservas,
} from './hooks/usePortalAluna'

function dentroDoPrazo(data: string, horario: string, horasCancelamento: number) {
  const limite = new Date(`${data}T${horario}`)
  limite.setHours(limite.getHours() - horasCancelamento)
  return new Date() < limite
}

export function ReservasPage() {
  const { data: reservas, isLoading } = useMinhasReservas()
  const { data: grade } = useGradePublica()
  const { data: config } = useConfigAgendamento()
  const cancelar = useCancelarReserva()
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function confirmarCancelamento(id: string) {
    setAviso(null)
    cancelar.mutate(id, {
      onSuccess: (devolveu) => {
        setConfirmando(null)
        setAviso(devolveu ? 'Reserva cancelada — crédito devolvido.' : 'Reserva cancelada.')
      },
      onError: () => setAviso('Não foi possível cancelar.'),
    })
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-neutral-900">Minhas Reservas</h1>

      {aviso && <p className="mb-3 text-sm text-brand-700">{aviso}</p>}
      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}
      {!isLoading && (reservas ?? []).length === 0 && (
        <p className="text-sm text-neutral-400">Você ainda não tem aulas agendadas.</p>
      )}

      <div className="flex flex-col gap-2.5">
        {(reservas ?? []).map((r) => {
          const turma = grade?.find((t) => t.turma_id === r.turma_id)
          const horas = config?.horas_cancelamento ?? 0
          const noPrazo = turma?.horario ? dentroDoPrazo(r.data, turma.horario, horas) : true

          return (
            <div key={r.id} className="rounded-lg border border-neutral-200 bg-white p-3.5">
              <div className="text-sm font-medium text-neutral-900">
                {fmtData(r.data)} • {fmtHora(turma?.horario ?? '')}
              </div>
              <div className="mb-2.5 text-xs text-neutral-500">
                {turma?.modalidade} — {turma?.professora_nome}
              </div>

              {confirmando === r.id ? (
                <div className="rounded-md bg-neutral-50 p-2.5 text-xs">
                  <p className={noPrazo ? 'text-brand-700' : 'text-orange-600'}>
                    {noPrazo
                      ? 'Dentro do prazo — seu crédito volta para o saldo.'
                      : `Fora do prazo (era até ${horas}h antes) — o crédito não será devolvido.`}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => confirmarCancelamento(r.id)}
                      disabled={cancelar.isPending}
                      className="flex-1 rounded-md bg-red-600 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Sim, cancelar
                    </button>
                    <button
                      onClick={() => setConfirmando(null)}
                      className="flex-1 rounded-md border border-neutral-200 py-1.5 text-xs text-neutral-600"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmando(r.id)}
                  className="w-full rounded-md border border-neutral-200 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50"
                >
                  Cancelar
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
