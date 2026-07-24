import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CardColapsavel } from '../../../components/ui/CardColapsavel'
import { EmptyState } from '../../../components/ui/EmptyState'
import { KpiCard } from '../../../components/ui/KpiCard'
import { fmtCentavos } from '../../../lib/dinheiro'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { mesAtual, periodoMes, type Periodo } from '../periodo'
import { useEntradas, useSaidas } from '../hooks/useFinanceiro'
import { CATEGORIA_ENTRADA_LABEL } from '../types'

type Mov = { data: string; tipo: 'entrada' | 'saida'; desc: string; valor: number }

const fmtDia = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function FluxoPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(mesAtual()))
  const { data: entradas } = useEntradas(periodo)
  const { data: saidas } = useSaidas(periodo)

  const movs = useMemo<Mov[]>(() => {
    const es: Mov[] = (entradas ?? [])
      .filter((e) => e.status === 'recebida' && e.data_caixa)
      .map((e) => ({ data: e.data_caixa!, tipo: 'entrada', desc: e.descricao || CATEGORIA_ENTRADA_LABEL[e.categoria], valor: e.valor_centavos }))
    const ss: Mov[] = (saidas ?? []).map((s) => ({ data: s.data_caixa, tipo: 'saida', desc: s.descricao || s.categoria?.nome || 'Saída', valor: s.valor_centavos }))
    return [...es, ...ss].sort((a, b) => a.data.localeCompare(b.data))
  }, [entradas, saidas])

  const totalEntradas = movs.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const totalSaidas = movs.filter((m) => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0)
  const resultado = totalEntradas - totalSaidas

  // Saldo acumulado (dentro do período) por movimento, do mais antigo ao novo.
  let acc = 0
  const comSaldo = movs.map((m) => {
    acc += m.tipo === 'entrada' ? m.valor : -m.valor
    return { ...m, saldo: acc }
  })

  // Curva de saldo acumulado por dia, para o gráfico.
  const porDia = new Map<string, number>()
  for (const m of comSaldo) porDia.set(m.data, m.saldo)
  const curva = [...porDia.entries()].map(([data, saldo]) => ({ dia: fmtDia(data), saldo: saldo / 100 }))

  const extrato = [...comSaldo].reverse() // mais recente primeiro

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <SeletorPeriodo periodo={periodo} onChange={setPeriodo} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard size="lg" label="Entradas" value={fmtCentavos(totalEntradas)} icon={TrendingUp} tone="success" />
        <KpiCard size="lg" label="Saídas" value={fmtCentavos(totalSaidas)} icon={TrendingDown} tone="danger" />
        <KpiCard size="lg" label="Resultado" value={fmtCentavos(resultado)} icon={Scale} tone={resultado >= 0 ? 'success' : 'danger'} hint="entradas − saídas no período" />
      </div>

      {curva.length >= 2 && (
        <CardColapsavel title="Saldo acumulado" subtitle="Como o caixa evoluiu no período" persistKey="fin-fluxo-curva">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={curva} margin={{ left: -12, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="gSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-neutral-100)" />
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" width={64} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(v) => fmtCentavos(Math.round(Number(v) * 100))} />
              <Area type="monotone" dataKey="saldo" name="Saldo" stroke="var(--color-brand-600)" strokeWidth={2} fill="url(#gSaldo)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardColapsavel>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h3 className="font-display text-sm font-semibold text-neutral-900">Extrato</h3>
          <p className="text-xs text-neutral-400">Movimentações do período, da mais recente para a mais antiga</p>
        </div>
        {extrato.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Sem movimentações" description="Nenhuma entrada recebida ou saída paga no período." />
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {extrato.map((m, i) => {
              const entrada = m.tipo === 'entrada'
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${entrada ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600'}`}>
                    {entrada ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-neutral-700">{m.desc}</p>
                    <p className="text-xs text-neutral-400">{fmtDia(m.data)}</p>
                  </div>
                  <span className={`shrink-0 font-semibold tabular-nums ${entrada ? 'text-success-600' : 'text-danger-600'}`}>
                    {entrada ? '+' : '−'} {fmtCentavos(m.valor)}
                  </span>
                  <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-neutral-400 sm:inline">
                    saldo {fmtCentavos(m.saldo)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
