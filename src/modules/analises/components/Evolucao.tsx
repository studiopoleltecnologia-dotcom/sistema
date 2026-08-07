import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardHeader } from '../../../components/ui/Card'
import { useEvolucaoSemanal } from '../hooks/useAnalises'

const PERIODOS = [
  { semanas: 4, label: '4 semanas' },
  { semanas: 12, label: '12 semanas' },
  { semanas: 26, label: '26 semanas' },
  { semanas: 52, label: '52 semanas' },
] as const

function labelSemana(iso: string) {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

export function Evolucao() {
  const [semanas, setSemanas] = useState<number>(12)
  const { data, isLoading } = useEvolucaoSemanal(semanas)

  const dados = (data ?? []).map((s) => ({
    semana: labelSemana(s.semana_inicio ?? ''),
    ocupacao: s.ocupacao_pct ?? 0,
    novosAlunos: s.novos_alunos ?? 0,
    cancelamentos: s.cancelamentos ?? 0,
    faltas: s.faltas ?? 0,
  }))
  const temAtividade = dados.some(
    (d) => d.ocupacao > 0 || d.novosAlunos > 0 || d.cancelamentos > 0 || d.faltas > 0,
  )

  return (
    <Card>
      <CardHeader
        title="Evolução"
        subtitle="Ocupação, novos alunos, cancelamentos e faltas por semana"
        action={
          <div className="flex gap-1">
            {PERIODOS.map((p) => (
              <button
                key={p.semanas}
                onClick={() => setSemanas(p.semanas)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  semanas === p.semanas
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-neutral-400 hover:text-neutral-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />
      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : !temAtividade ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          Ainda não há atividade registrada nessas semanas para desenhar o gráfico.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-500">Ocupação (%)</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={dados} margin={{ left: -18, top: 4, right: 4 }}>
                <defs>
                  <linearGradient id="grad-ocupacao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-neutral-100)" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" width={40} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Area
                  type="monotone"
                  dataKey="ocupacao"
                  name="Ocupação"
                  stroke="var(--color-brand-600)"
                  strokeWidth={2}
                  fill="url(#grad-ocupacao)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-neutral-500">
              Novos alunos, cancelamentos e faltas
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dados} margin={{ left: -18, top: 4, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--color-neutral-100)" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" width={30} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="novosAlunos" name="Novos alunos" fill="var(--color-success-500)" radius={2} />
                <Bar dataKey="cancelamentos" name="Cancelamentos" fill="var(--color-warning-500)" radius={2} />
                <Bar dataKey="faltas" name="Faltas" fill="var(--color-danger-500)" radius={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  )
}
