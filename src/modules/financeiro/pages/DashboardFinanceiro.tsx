import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CalendarClock,
  Landmark,
  PiggyBank,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KpiCard } from '../../../components/ui/KpiCard'
import { CardColapsavel } from '../../../components/ui/CardColapsavel'
import { fmtCentavos } from '../../../lib/dinheiro'
import { deslocarMes, mesAtual, periodoMes, rotuloPeriodo } from '../periodo'
import {
  useEntradas,
  useMei,
  useMixReceitaPeriodo,
  useSaidas,
  useSaidasPeriodo,
  useSaldoCaixa,
} from '../hooks/useFinanceiro'
import { CATEGORIA_ENTRADA_LABEL, nivelAlertaMei, type CategoriaEntrada } from '../types'

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

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const labelMes = (iso: string) => {
  const [ano, mes] = iso.slice(0, 7).split('-').map(Number)
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`
}
const hojeISO = () => new Date().toISOString().slice(0, 10)

const secaoCls = 'mb-3 font-display text-xs font-semibold uppercase tracking-wide text-neutral-400'

export function DashboardFinanceiro() {
  const mes = mesAtual()
  const periodo = periodoMes(mes)
  const janela = { inicio: deslocarMes(mes, -5), fim: mes }

  const { data: saldo } = useSaldoCaixa()
  const { data: mei } = useMei()
  const { data: entradas } = useEntradas(periodo)
  const { data: saidas } = useSaidas(periodo)
  const { data: mixMensal } = useMixReceitaPeriodo(janela)
  const { data: saidasMensal } = useSaidasPeriodo(janela)

  const es = entradas ?? []
  const hoje = hojeISO()

  const recebido = es.filter((e) => e.status === 'recebida').reduce((s, e) => s + e.valor_centavos, 0)
  const previstas = es.filter((e) => e.status === 'prevista')
  const aVencer = previstas
    .filter((e) => (e.data_prevista ?? '') >= hoje)
    .reduce((s, e) => s + e.valor_centavos, 0)
  const vencidasLista = previstas.filter((e) => e.data_prevista != null && e.data_prevista < hoje)
  const vencidas = vencidasLista.reduce((s, e) => s + e.valor_centavos, 0)

  const despesasPagas = (saidas ?? []).reduce((s, x) => s + x.valor_centavos, 0)
  const lucro = recebido - despesasPagas

  const saldoAtual = saldo?.saldo_atual_centavos ?? 0
  const saldoProjetado = saldo?.saldo_projetado_centavos ?? 0

  const pctMei = mei?.percentual_limite ?? 0
  const nivelMei = nivelAlertaMei(pctMei)
  const MEI_TOM = { ok: 'success', atencao: 'warning', alerta: 'warning', critico: 'danger' } as const

  // Série de evolução (6 meses): receita recebida x despesa paga.
  const recPorMes = new Map<string, number>()
  for (const r of mixMensal ?? []) if (r.mes) recPorMes.set(r.mes, (recPorMes.get(r.mes) ?? 0) + (r.total_centavos ?? 0))
  const despPorMes = new Map<string, number>()
  for (const r of saidasMensal ?? []) if (r.mes) despPorMes.set(r.mes, (despPorMes.get(r.mes) ?? 0) + (r.total_centavos ?? 0))
  const meses = [...new Set([...recPorMes.keys(), ...despPorMes.keys()])].sort()
  const evolucao = meses.map((m) => ({
    mes: labelMes(m),
    receita: (recPorMes.get(m) ?? 0) / 100,
    despesa: (despPorMes.get(m) ?? 0) / 100,
  }))

  // Composição da receita recebida no mês, por categoria.
  const porCat = new Map<CategoriaEntrada, number>()
  for (const e of es) {
    if (e.status !== 'recebida') continue
    porCat.set(e.categoria, (porCat.get(e.categoria) ?? 0) + e.valor_centavos)
  }
  const composicao = [...porCat.entries()]
    .map(([cat, v]) => ({ name: CATEGORIA_ENTRADA_LABEL[cat], value: v / 100 }))
    .sort((a, b) => b.value - a.value)

  const alertas: { icon: typeof TriangleAlert; texto: string; tom: 'danger' | 'warning'; to: string }[] = []
  if (saldoAtual < 0)
    alertas.push({ icon: Wallet, texto: `Caixa negativo em ${fmtCentavos(saldoAtual)}`, tom: 'danger', to: 'fluxo' })
  if (vencidasLista.length > 0)
    alertas.push({
      icon: TriangleAlert,
      texto: `${vencidasLista.length} conta(s) vencida(s) — ${fmtCentavos(vencidas)} a receber em atraso`,
      tom: 'danger',
      to: 'entradas',
    })
  if (nivelMei !== 'ok')
    alertas.push({
      icon: Landmark,
      texto: `Faturamento MEI em ${pctMei.toFixed(0)}% do teto anual`,
      tom: nivelMei === 'critico' ? 'danger' : 'warning',
      to: 'fiscal',
    })

  const atalhos = [
    { to: 'entradas', icon: ArrowDownToLine, titulo: 'Entradas', desc: 'Recebimentos e a receber', valor: fmtCentavos(recebido) },
    { to: 'saidas', icon: ArrowUpFromLine, titulo: 'Saídas', desc: 'Despesas fixas e variáveis', valor: fmtCentavos(despesasPagas) },
    { to: 'fluxo', icon: Activity, titulo: 'Fluxo de caixa', desc: 'Entradas x saídas no tempo', valor: null },
    { to: 'fiscal', icon: Landmark, titulo: 'Fiscal', desc: 'Teto do MEI e projeção', valor: `${pctMei.toFixed(0)}%` },
    { to: 'reserva', icon: PiggyBank, titulo: 'Reserva', desc: 'Colchão de segurança', valor: null },
    { to: 'wellhub', icon: Sparkles, titulo: 'Wellhub', desc: 'Repasse a reconciliar', valor: null },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className={secaoCls}>Visão geral · {rotuloPeriodo(periodo)}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            size="lg"
            label="Saldo disponível"
            value={fmtCentavos(saldoAtual)}
            icon={Wallet}
            tone={saldoAtual < 0 ? 'danger' : 'brand'}
            hint={`${fmtCentavos(saldoProjetado)} projetado`}
          />
          <KpiCard
            size="lg"
            label="Receitas do mês"
            value={fmtCentavos(recebido)}
            icon={TrendingUp}
            tone="success"
            hint={aVencer > 0 ? `+ ${fmtCentavos(aVencer)} a receber` : undefined}
          />
          <KpiCard
            size="lg"
            label="Despesas do mês"
            value={fmtCentavos(despesasPagas)}
            icon={TrendingDown}
            tone="danger"
          />
          <KpiCard
            size="lg"
            label="Lucro do mês"
            value={fmtCentavos(lucro)}
            icon={Scale}
            tone={lucro >= 0 ? 'success' : 'danger'}
            hint="recebido − despesas pagas"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Saldo previsto" value={fmtCentavos(saldoProjetado)} icon={Scale} tone="neutral" hint="após pendências" />
        <KpiCard label="Contas a vencer" value={fmtCentavos(aVencer)} icon={CalendarClock} tone="brand" hint="ainda no prazo" />
        <KpiCard
          label="Contas vencidas"
          value={fmtCentavos(vencidas)}
          icon={TriangleAlert}
          tone={vencidas > 0 ? 'danger' : 'neutral'}
          hint={vencidas > 0 ? `${vencidasLista.length} em atraso` : 'nada em atraso'}
        />
        <KpiCard
          label="Teto MEI"
          value={`${pctMei.toFixed(0)}%`}
          icon={Landmark}
          tone={MEI_TOM[nivelMei]}
          hint={`faltam ${fmtCentavos(mei?.falta_para_limite_centavos ?? 0)}`}
        />
      </div>

      {alertas.length > 0 && (
        <div className="flex flex-col gap-2">
          {alertas.map((a) => (
            <Link
              key={a.texto}
              to={a.to}
              className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition ${
                a.tom === 'danger'
                  ? 'border-danger-200 bg-danger-50 text-danger-700 hover:bg-danger-100'
                  : 'border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100'
              }`}
            >
              <a.icon className="size-4 shrink-0" />
              <span className="flex-1">{a.texto}</span>
              <ArrowRight className="size-3.5 shrink-0 opacity-60" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardColapsavel
          className="lg:col-span-2"
          title="Evolução"
          subtitle="Receita recebida x despesa paga, últimos meses"
          persistKey="fin-dash-evolucao"
        >
          {evolucao.length < 2 ? (
            <p className="py-12 text-center text-sm text-neutral-400">
              Ainda sem histórico suficiente para o gráfico.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={evolucao} margin={{ left: -18, right: 4, top: 4 }}>
                <defs>
                  <linearGradient id="gReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-success-500)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-success-500)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDespesa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-danger-500)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--color-danger-500)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-neutral-100)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--color-neutral-300)" width={64} />
                <Tooltip formatter={(v) => fmtCentavos(Math.round(Number(v) * 100))} />
                <Area
                  type="monotone"
                  dataKey="receita"
                  name="Receita"
                  stroke="var(--color-success-600)"
                  strokeWidth={2}
                  fill="url(#gReceita)"
                />
                <Area
                  type="monotone"
                  dataKey="despesa"
                  name="Despesa"
                  stroke="var(--color-danger-500)"
                  strokeWidth={2}
                  fill="url(#gDespesa)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardColapsavel>

        <CardColapsavel title="Receita do mês" subtitle="Composição por categoria" persistKey="fin-dash-composicao">
          {composicao.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-400">Nada recebido ainda este mês.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={composicao} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                    {composicao.map((_, i) => (
                      <Cell key={i} fill={CHART_CORES[i % CHART_CORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtCentavos(Math.round(Number(v) * 100))} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-3 flex flex-col gap-1.5">
                {composicao.slice(0, 5).map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: CHART_CORES[i % CHART_CORES.length] }} />
                    <span className="truncate">{d.name}</span>
                    <span className="ml-auto shrink-0 font-medium tabular-nums text-neutral-700">
                      {fmtCentavos(Math.round(d.value * 100))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardColapsavel>
      </div>

      <div>
        <p className={secaoCls}>Atalhos</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {atalhos.map(({ to, icon: Icon, titulo, desc, valor }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-3 rounded-xl border border-neutral-200/80 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md"
            >
              <span className="rounded-lg bg-brand-50 p-2.5 text-brand-600 transition group-hover:bg-brand-100">
                <Icon className="size-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-900">{titulo}</p>
                <p className="truncate text-xs text-neutral-400">{desc}</p>
              </div>
              {valor && <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-700">{valor}</span>}
              <ArrowRight className="size-4 shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
