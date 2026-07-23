import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardHeader } from '../../../components/ui/Card'
import { fmtCentavos } from '../../../lib/dinheiro'
import { contemMes, rotuloPeriodo, type Periodo } from '../periodo'
import type { Entrada, MixReceitaMensal, Saida, SaidasMensal, TipoSaida } from '../types'

const CHART_CORES = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
  'var(--color-chart-7)',
  'var(--color-chart-8)',
]

const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

function labelMes(iso: string) {
  const [ano, mes] = iso.slice(0, 7).split('-').map(Number)
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`
}

function tooltipReais(valor: number) {
  return fmtCentavos(Math.round(valor * 100))
}

export function GraficosFinanceiro({
  entradas,
  saidas,
  periodo,
  mixMensal,
  saidasMensal,
}: {
  entradas: Entrada[]
  saidas: (Saida & { categoria?: { tipo: TipoSaida; nome: string } | null })[]
  periodo: Periodo
  mixMensal: MixReceitaMensal[]
  saidasMensal: SaidasMensal[]
}) {
  const receitaPorMes = new Map<string, number>()
  for (const r of mixMensal) {
    if (!r.mes) continue
    receitaPorMes.set(r.mes, (receitaPorMes.get(r.mes) ?? 0) + (r.total_centavos ?? 0))
  }
  const despesaPorMes = new Map<string, number>()
  for (const r of saidasMensal) {
    if (!r.mes) continue
    despesaPorMes.set(r.mes, (despesaPorMes.get(r.mes) ?? 0) + (r.total_centavos ?? 0))
  }
  const todosMeses = [...new Set([...receitaPorMes.keys(), ...despesaPorMes.keys()])].sort()
  const evolucao = todosMeses.map((m) => ({
    mes: labelMes(m),
    receita: (receitaPorMes.get(m) ?? 0) / 100,
    despesa: (despesaPorMes.get(m) ?? 0) / 100,
    lucro: ((receitaPorMes.get(m) ?? 0) - (despesaPorMes.get(m) ?? 0)) / 100,
  }))

  const porCategoria = new Map<string, number>()
  for (const s of saidas) {
    const nome = s.categoria?.nome ?? 'Outros'
    porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + s.valor_centavos)
  }
  const distribuicao = [...porCategoria.entries()]
    .map(([name, value]) => ({ name, value: value / 100 }))
    .sort((a, b) => b.value - a.value)

  const recebidoMes = entradas
    .filter((e) => e.status === 'recebida')
    .reduce((s, e) => s + e.valor_centavos, 0)
  const previstoMes = entradas
    .filter(
      (e) => e.status === 'prevista' && contemMes(periodo, (e.data_prevista ?? '').slice(0, 7)),
    )
    .reduce((s, e) => s + e.valor_centavos, 0)
  const pagasMes = saidas.reduce((s, x) => s + x.valor_centavos, 0)

  const comparativo = [
    { nome: 'Receita', previsto: previstoMes / 100, realizado: recebidoMes / 100 },
    { nome: 'Despesa', previsto: 0, realizado: pagasMes / 100 },
  ]

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Evolução" subtitle="Receita recebida x despesa paga, últimos meses" />
        {evolucao.length < 2 ? (
          <p className="py-8 text-center text-sm text-neutral-400">
            Ainda não há histórico suficiente de meses para o gráfico.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={evolucao} margin={{ left: -20 }}>
              <CartesianGrid vertical={false} stroke="var(--color-neutral-100)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" width={60} />
              <Tooltip formatter={(v) => tooltipReais(Number(v))} />
              <Line
                type="monotone"
                dataKey="receita"
                name="Receita"
                stroke="var(--color-success-500)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="despesa"
                name="Despesa"
                stroke="var(--color-danger-500)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="lucro"
                name="Lucro"
                stroke="var(--color-brand-600)"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <CardHeader title="Gastos por categoria" subtitle={rotuloPeriodo(periodo)} />
        {distribuicao.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">Sem despesas no mês.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={distribuicao}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
              >
                {distribuicao.map((_, i) => (
                  <Cell key={i} fill={CHART_CORES[i % CHART_CORES.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => tooltipReais(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        )}
        <ul className="mt-2 flex flex-col gap-1">
          {distribuicao.slice(0, 5).map((d, i) => (
            <li key={d.name} className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: CHART_CORES[i % CHART_CORES.length] }}
              />
              <span className="truncate">{d.name}</span>
              <span className="ml-auto shrink-0 font-medium text-neutral-700">
                {fmtCentavos(Math.round(d.value * 100))}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader title="Previsto x Realizado" subtitle={rotuloPeriodo(periodo)} />
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={comparativo} margin={{ left: -20 }}>
            <CartesianGrid vertical={false} stroke="var(--color-neutral-100)" />
            <XAxis dataKey="nome" tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" width={60} />
            <Tooltip formatter={(v) => tooltipReais(Number(v))} />
            <Bar dataKey="previsto" name="Previsto" fill="var(--color-warning-500)" radius={4} />
            <Bar dataKey="realizado" name="Realizado" fill="var(--color-brand-600)" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
