import { useNavigate } from 'react-router-dom'
import { fmtData } from '../../lib/datas'
import { fmtHora } from './types'
import {
  useGradePublica,
  useMeuCliente,
  useMeuSaldo,
  useMinhasReservas,
} from './hooks/usePortalAluna'

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: cliente } = useMeuCliente()
  const { data: saldos } = useMeuSaldo()
  const { data: reservas } = useMinhasReservas()
  const { data: grade } = useGradePublica()

  const hoje = new Date().toISOString().slice(0, 10)
  const proxima = (reservas ?? []).find((r) => r.data >= hoje)
  const turmaProxima = grade?.find((t) => t.turma_id === proxima?.turma_id)

  const creditosRestantes = (saldos ?? []).reduce((s, m) => s + (m.saldo ?? 0), 0)
  const validade = saldos?.[0]?.data_fim

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-neutral-900">
        Olá, {cliente?.nome?.split(' ')[0] ?? 'aluno'} 👋
      </h1>

      <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="text-xs text-neutral-400">Créditos restantes</div>
        <div className="mt-1 text-2xl font-semibold text-neutral-900">{creditosRestantes}</div>
        {validade && (
          <div className="mt-0.5 text-xs text-neutral-400">válido até {fmtData(validade)}</div>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-2 text-xs font-semibold tracking-wide text-neutral-400">
          PRÓXIMA AULA
        </div>
        {proxima && turmaProxima ? (
          <div>
            <div className="text-sm font-medium text-neutral-900">
              {fmtData(proxima.data)} • {fmtHora(turmaProxima.horario ?? '')}
            </div>
            <div className="text-sm text-neutral-500">
              {turmaProxima.modalidade} — {turmaProxima.professora_nome}
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">Você ainda não tem aulas agendadas.</p>
        )}
      </div>

      <button
        onClick={() => navigate('agenda')}
        className="mb-3 w-full rounded-md bg-brand-600 py-3 text-sm font-medium text-white transition hover:bg-brand-700"
      >
        Agendar aula
      </button>
      <button
        onClick={() => navigate('planos')}
        className="mb-3 w-full rounded-md border border-neutral-200 py-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
      >
        {creditosRestantes > 0 ? 'Ver planos' : 'Contratar um plano'}
      </button>
      <button
        onClick={() => navigate('reservas')}
        className="w-full rounded-md border border-neutral-200 py-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
      >
        Minhas reservas
      </button>
    </div>
  )
}
