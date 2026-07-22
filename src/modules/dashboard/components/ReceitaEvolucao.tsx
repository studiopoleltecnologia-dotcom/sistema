import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardHeader } from '../../../components/ui/Card'
import { fmtCentavos } from '../../../lib/dinheiro'
import type { MixReceitaMensal } from '../../financeiro/types'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function labelMes(iso: string) {
  const [ano, mes] = iso.slice(0, 7).split('-').map(Number)
  return `${MESES[mes - 1]}/${String(ano).slice(2)}`
}

/** Receita total recebida/prevista por mês — a linha de vida do estúdio. */
export function ReceitaEvolucao({ mix }: { mix: MixReceitaMensal[] }) {
  const porMes = new Map<string, number>()
  for (const r of mix) {
    if (!r.mes) continue
    porMes.set(r.mes, (porMes.get(r.mes) ?? 0) + (r.total_centavos ?? 0))
  }
  const dados = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, total]) => ({ mes: labelMes(mes), receita: total / 100 }))

  return (
    <Card>
      <CardHeader title="Receita por mês" subtitle="Todas as origens somadas" />
      {dados.length < 2 ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          Ainda não há meses suficientes para o gráfico.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={dados} margin={{ left: -18, top: 4, right: 4 }}>
            <defs>
              <linearGradient id="grad-receita" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-neutral-100)" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" width={56} />
            <Tooltip formatter={(v) => fmtCentavos(Math.round(Number(v) * 100))} />
            <Area
              type="monotone"
              dataKey="receita"
              name="Receita"
              stroke="var(--color-brand-600)"
              strokeWidth={2}
              fill="url(#grad-receita)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
