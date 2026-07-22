import { Card, CardHeader } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import type { OcupacaoDia } from '../api/dashboard'

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function rotulo(iso: string) {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  if (d.getTime() === hoje.getTime()) return 'Hoje'
  return `${DIAS[d.getDay()]} ${String(dia).padStart(2, '0')}`
}

/**
 * Barras simples em CSS (não recharts): são poucos dias e o valor exato
 * importa mais que a forma — barra + número lado a lado lê mais rápido
 * que um gráfico com eixo.
 */
export function OcupacaoSemana({ dias }: { dias: OcupacaoDia[] }) {
  const max = Math.max(1, ...dias.map((d) => d.agendados))

  return (
    <Card>
      <CardHeader title="Aulas dos próximos dias" subtitle="Reservas confirmadas por dia" />
      {dias.length === 0 ? (
        <EmptyState title="Nenhuma aula agendada" description="Nada reservado para os próximos dias." />
      ) : (
        <ul className="flex flex-col gap-2">
          {dias.map((d) => (
            <li key={d.data} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 text-xs text-neutral-500">{rotulo(d.data)}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${(d.agendados / max) * 100}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right font-medium tabular-nums text-neutral-700">
                {d.agendados}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
