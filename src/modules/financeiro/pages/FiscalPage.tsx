import { CalendarRange, Landmark, TrendingUp, Wallet } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KpiCard } from '../../../components/ui/KpiCard'
import { Card, CardHeader } from '../../../components/ui/Card'
import { fmtCentavos } from '../../../lib/dinheiro'
import { anoCorrente, mesAtual, periodoMes } from '../periodo'
import { useEntradas, useMei, useMixReceitaPeriodo } from '../hooks/useFinanceiro'
import { nivelAlertaMei } from '../types'

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const NIVEL_INFO = {
  ok: { cor: 'var(--color-success-500)', chip: 'bg-success-50 text-success-700', texto: 'Dentro do limite — tudo tranquilo.' },
  atencao: { cor: 'var(--color-warning-500)', chip: 'bg-warning-50 text-warning-700', texto: 'Passou de 70% do teto — vale acompanhar de perto.' },
  alerta: { cor: 'var(--color-warning-600)', chip: 'bg-warning-100 text-warning-700', texto: 'Passou de 85% do teto — cuidado com novos recebimentos.' },
  critico: { cor: 'var(--color-danger-500)', chip: 'bg-danger-50 text-danger-700', texto: 'Acima de 95% do teto — risco de desenquadrar do MEI.' },
} as const

export function FiscalPage() {
  const { data: mei } = useMei()
  const { data: entradasMes } = useEntradas(periodoMes(mesAtual()))
  const { data: mix } = useMixReceitaPeriodo(anoCorrente())

  const faturamentoAno = mei?.faturamento_ano_centavos ?? 0
  const limite = mei?.limite_mei_centavos ?? 8100000
  const pct = Number(mei?.percentual_limite ?? 0)
  const falta = mei?.falta_para_limite_centavos ?? 0
  const projecao = mei?.projecao_dezembro_centavos ?? 0
  const nivel = nivelAlertaMei(pct)
  const info = NIVEL_INFO[nivel]

  const faturamentoMes = (entradasMes ?? [])
    .filter((e) => e.status === 'recebida')
    .reduce((s, e) => s + e.valor_centavos, 0)

  // Evolução acumulada do faturamento no ano (para ver a curva chegando no teto).
  const porMes = new Map<number, number>()
  for (const r of mix ?? []) {
    if (!r.mes) continue
    const m = Number(r.mes.slice(5, 7))
    porMes.set(m, (porMes.get(m) ?? 0) + (r.total_centavos ?? 0))
  }
  let acc = 0
  const curva = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    acc += porMes.get(m) ?? 0
    return { mes: MESES_ABREV[i], acumulado: acc / 100, temDado: porMes.has(m) }
  }).filter((p, i) => p.temDado || i < new Date().getMonth() + 1)

  const projetaEstouro = projecao > limite

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              Faturamento MEI no ano
            </p>
            <p className="mt-1 font-display text-3xl font-bold tracking-tight text-neutral-900">
              {fmtCentavos(faturamentoAno)}
              <span className="ml-2 text-base font-medium text-neutral-400">
                de {fmtCentavos(limite)}
              </span>
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${info.chip}`}>
            {pct.toFixed(0)}% do teto
          </span>
        </div>

        {/* Barra de uso do teto, com os degraus de alerta 70 / 85 / 95 */}
        <div className="relative mt-5 h-3 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, pct)}%`, background: info.cor }}
          />
        </div>
        <div className="relative mt-1 h-4 text-[10px] text-neutral-400">
          {[70, 85, 95].map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${t}%` }}>
              {t}%
            </span>
          ))}
        </div>

        <p className={`mt-3 inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${info.chip}`}>
          {info.texto}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Faturamento do mês" value={fmtCentavos(faturamentoMes)} icon={Wallet} tone="brand" />
        <KpiCard label="Acumulado no ano" value={fmtCentavos(faturamentoAno)} icon={TrendingUp} tone="success" />
        <KpiCard label="Falta para o teto" value={fmtCentavos(falta)} icon={Landmark} tone={falta > 0 ? 'neutral' : 'danger'} />
        <KpiCard
          label="Projeção dezembro"
          value={fmtCentavos(projecao)}
          icon={CalendarRange}
          tone={projetaEstouro ? 'danger' : 'neutral'}
          hint={projetaEstouro ? 'no ritmo atual, estoura o teto' : 'no ritmo atual, dentro do teto'}
        />
      </div>

      <Card>
        <CardHeader title="Evolução do faturamento" subtitle="Acumulado no ano x limite do MEI" />
        {curva.length < 2 ? (
          <p className="py-12 text-center text-sm text-neutral-400">Sem histórico suficiente no ano.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={curva} margin={{ left: -12, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-neutral-100)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--color-neutral-300)"
                width={72}
                tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
              />
              <Tooltip formatter={(v) => fmtCentavos(Math.round(Number(v) * 100))} />
              <ReferenceLine
                y={limite / 100}
                stroke="var(--color-danger-500)"
                strokeDasharray="5 4"
                label={{ value: 'Teto MEI', position: 'insideTopRight', fontSize: 11, fill: 'var(--color-danger-600)' }}
              />
              <Area type="monotone" dataKey="acumulado" name="Acumulado" stroke="var(--color-brand-600)" strokeWidth={2} fill="url(#gFat)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}
