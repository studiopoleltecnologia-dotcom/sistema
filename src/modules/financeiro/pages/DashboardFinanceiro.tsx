import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  Landmark,
  Repeat,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  Users,
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
import { PageHeader } from '../../../components/ui/PageHeader'
import { cn } from '../../../components/ui/cn'
import { fmtCentavos } from '../../../lib/dinheiro'
import { LinhaDoCaixa } from '../components/LinhaDoCaixa'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import {
  deslocarMes,
  ehMesUnico,
  mesAtual,
  periodoMes,
  qtdMeses,
  rotuloPeriodo,
  type Periodo,
} from '../periodo'
import {
  useConfigFinanceiro,
  useEntradas,
  useMei,
  useMixReceitaPeriodo,
  useMrr,
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

const FAIXA_TOM = {
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
} as const

/**
 * Progresso como faixa fina, não como card. Um percentual é uma posição
 * dentro de um limite — a barra mostra isso de relance; o card em volta só
 * somaria peso visual competindo com os números que importam.
 */
function Faixa({
  label,
  pct,
  detalhe,
  tom,
}: {
  label: string
  pct: number
  detalhe: string
  tom: keyof typeof FAIXA_TOM
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="w-20 shrink-0 text-xs font-medium text-neutral-500">{label}</span>
      <div className="h-1.5 min-w-[100px] flex-1 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={cn('h-full rounded-full transition-all', FAIXA_TOM[tom])}
          style={{ width: `${Math.min(100, Math.max(pct, 1.5))}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-neutral-400">
        <strong className="font-semibold text-neutral-600">{Math.round(pct)}%</strong> · {detalhe}
      </span>
    </div>
  )
}

export function DashboardFinanceiro() {
  // O Resumo era o único lugar do módulo com o mês fixo no código — as demais
  // abas já deixavam escolher. Se todos os números vêm de um recorte, o
  // recorte precisa estar visível e ser trocável.
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(mesAtual()))

  // Para o gráfico: se a pessoa já pediu vários meses, mostra os dela;
  // se pediu um mês só, mostra os 6 que terminam nele (um ponto não é linha).
  const janela: Periodo =
    qtdMeses(periodo) >= 2 ? periodo : { inicio: deslocarMes(periodo.fim, -5), fim: periodo.fim }

  const { data: saldo } = useSaldoCaixa()
  const { data: mei } = useMei()
  const { data: mrr } = useMrr()
  const { data: config } = useConfigFinanceiro()
  const { data: entradas } = useEntradas(periodo)
  const { data: saidas } = useSaidas(periodo)
  const { data: mixMensal } = useMixReceitaPeriodo(janela)
  const { data: saidasMensal } = useSaidasPeriodo(janela)

  const es = entradas ?? []
  const hoje = hojeISO()
  const mesUnico = ehMesUnico(periodo)

  const recebido = es.filter((e) => e.status === 'recebida').reduce((s, e) => s + e.valor_centavos, 0)
  const previstas = es.filter((e) => e.status === 'prevista')
  const vencidasLista = previstas.filter((e) => e.data_prevista != null && e.data_prevista < hoje)
  const vencidas = vencidasLista.reduce((s, e) => s + e.valor_centavos, 0)

  const despesasPagas = (saidas ?? []).reduce((s, x) => s + x.valor_centavos, 0)
  const lucro = recebido - despesasPagas

  const saldoAtual = saldo?.saldo_atual_centavos ?? 0
  const saldoProjetado = saldo?.saldo_projetado_centavos ?? 0

  const pctMei = mei?.percentual_limite ?? 0
  const nivelMei = nivelAlertaMei(pctMei)

  // Receita recorrente (MRR): valor mensalizado das matrículas ativas.
  const mrrCentavos = mrr?.mrr_centavos ?? 0
  const clientesAtivos = mrr?.clientes_ativos ?? 0
  const ticketMedio = mrr?.ticket_medio_centavos ?? 0
  const novosMes = mrr?.novos_mes ?? 0
  const mrrNovos = mrr?.mrr_novos_centavos ?? 0
  const renovacoesMes = mrr?.renovacoes_mes ?? 0
  const mrrRenovacoes = mrr?.mrr_renovacoes_centavos ?? 0
  const inadimplentes = mrr?.inadimplentes ?? 0
  const mrrEmRisco = mrr?.mrr_em_risco_centavos ?? 0

  // Metas de faturamento (regime de caixa). 0 = não definida → faixa escondida.
  const metaMes = config?.meta_faturamento_mensal_centavos ?? 0
  const metaAno = config?.meta_faturamento_anual_centavos ?? 0
  const faturamentoAno = mei?.faturamento_ano_centavos ?? 0
  const temMeta = metaMes > 0 || metaAno > 0

  // Wellhub a reconciliar: check-in já registrado que ainda não virou repasse.
  const wellhubAReconciliar = previstas
    .filter((e) => e.categoria === 'wellhub')
    .reduce((s, e) => s + e.valor_centavos, 0)

  // Série de evolução: receita recebida x despesa paga.
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

  // Composição da receita recebida no período, por categoria.
  const porCat = new Map<CategoriaEntrada, number>()
  for (const e of es) {
    if (e.status !== 'recebida') continue
    porCat.set(e.categoria, (porCat.get(e.categoria) ?? 0) + e.valor_centavos)
  }
  const composicao = [...porCat.entries()]
    .map(([cat, v]) => ({ name: CATEGORIA_ENTRADA_LABEL[cat], value: v / 100 }))
    .sort((a, b) => b.value - a.value)
  const totalComposicao = composicao.reduce((s, c) => s + c.value, 0)
  const lider = composicao[0]

  const alertas: { icon: typeof TriangleAlert; texto: string; tom: 'danger' | 'warning'; to: string }[] = []
  if (saldoAtual < 0)
    alertas.push({ icon: Wallet, texto: `Caixa negativo em ${fmtCentavos(saldoAtual)}`, tom: 'danger', to: 'fluxo' })
  else if (saldoProjetado < 0)
    alertas.push({
      icon: Wallet,
      texto: `Caixa fica negativo em ${fmtCentavos(saldoProjetado)} depois de pagar o que está em aberto`,
      tom: 'warning',
      to: 'saidas',
    })
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
  if (inadimplentes > 0)
    alertas.push({
      icon: Repeat,
      texto: `${inadimplentes} mensalista(s) inadimplente(s) — ${fmtCentavos(mrrEmRisco)}/mês de MRR em risco`,
      tom: 'warning',
      to: 'entradas',
    })

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        titulo="Resumo"
        subtitulo="A saúde financeira do mês em uma tela"
        acoes={<SeletorPeriodo periodo={periodo} onChange={setPeriodo} />}
        className="mb-0"
      />

      {/*
        Nível 0 — acima de tudo. Antes este bloco era renderizado por último,
        depois de 12 cards: "3 contas vencidas" aparecia perto de 1.400px de
        rolagem no celular. Alerta que não é a primeira coisa vista não é
        alerta.
      */}
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

      {/* Nível 1 — o herói. */}
      <LinhaDoCaixa saldo={saldo} />

      {/* Nível 2 — desempenho do recorte escolhido. */}
      <div>
        <p className={secaoCls}>{mesUnico ? 'O mês' : 'O período'} · {rotuloPeriodo(periodo)}</p>
        <div className="grid grid-cols-3 gap-3">
          {/*
            Tom neutro de propósito: pagar aluguel não é perigo, é terça-feira.
            Antes Receitas era sempre `success` e Despesas sempre `danger`, o
            que gastava o vermelho na categoria e o deixava sem força para
            dizer "isto está errado". Cor agora é estado, não direção.
          */}
          <KpiCard label="Receitas" value={fmtCentavos(recebido)} icon={TrendingUp} tone="neutral" />
          <KpiCard label="Despesas" value={fmtCentavos(despesasPagas)} icon={TrendingDown} tone="neutral" />
          <KpiCard
            label="Lucro"
            value={fmtCentavos(lucro)}
            icon={Scale}
            tone={lucro >= 0 ? 'success' : 'danger'}
          />
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          {temMeta ? (
            <>
              {metaMes > 0 && mesUnico && (
                <Faixa
                  label="Meta do mês"
                  pct={(recebido / metaMes) * 100}
                  detalhe={
                    recebido >= metaMes
                      ? 'meta batida 🎉'
                      : `faltam ${fmtCentavos(metaMes - recebido)}`
                  }
                  tom={recebido >= metaMes ? 'success' : 'brand'}
                />
              )}
              {metaAno > 0 && (
                <Faixa
                  label="Meta do ano"
                  pct={(faturamentoAno / metaAno) * 100}
                  detalhe={
                    faturamentoAno >= metaAno
                      ? 'meta batida 🎉'
                      : `faltam ${fmtCentavos(metaAno - faturamentoAno)}`
                  }
                  tom={faturamentoAno >= metaAno ? 'success' : 'brand'}
                />
              )}
            </>
          ) : (
            <p className="flex items-center gap-2 text-xs text-neutral-400">
              <Target className="size-3.5 shrink-0" />
              Defina metas de faturamento em <strong className="font-medium text-neutral-500">Config</strong>.
            </p>
          )}

          {/* Nível 3 — o teto do MEI é uma posição dentro de um limite. */}
          <Faixa
            label="Teto do MEI"
            pct={pctMei}
            detalhe={`faltam ${fmtCentavos(mei?.falta_para_limite_centavos ?? 0)}`}
            tom={nivelMei === 'ok' ? 'success' : nivelMei === 'critico' ? 'danger' : 'warning'}
          />
        </div>
      </div>

      {/* Nível 4 — o único gráfico que muda decisão fica aberto. */}
      <CardColapsavel
        title="Tendência"
        subtitle="Receita recebida x despesa paga"
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

      {/*
        Nível 5 — camada estratégica, fechada por padrão.
        Regra: seção fechada mostra o próprio número no cabeçalho (`right`).
        Recolher esconde o detalhe, nunca o valor — senão a pessoa reabre
        tudo na primeira semana e a tela volta ao que era.
      */}
      <div className="flex flex-col gap-3">
        <CardColapsavel
          title="Alunos e recorrência"
          subtitle="Receita previsível dos mensalistas"
          persistKey="fin-dash-mrr"
          defaultOpen={false}
          forcarAberto={inadimplentes > 0}
          right={
            <ResumoFechado
              valor={`${fmtCentavos(mrrCentavos)}/mês`}
              detalhe={clientesAtivos > 0 ? `${clientesAtivos} ativo(s)` : 'sem mensalistas'}
            />
          }
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="MRR" value={fmtCentavos(mrrCentavos)} icon={Repeat} tone="brand" hint="receita previsível" />
            <KpiCard label="Ticket médio" value={fmtCentavos(ticketMedio)} icon={Users} tone="neutral" hint="por mensalista/mês" />
            <KpiCard
              label="Novos no mês"
              value={novosMes > 0 ? `+ ${fmtCentavos(mrrNovos)}` : fmtCentavos(0)}
              icon={UserPlus}
              tone={novosMes > 0 ? 'success' : 'neutral'}
              hint={`${novosMes} nova(s) matrícula(s)`}
            />
            <KpiCard
              label="Renovam este mês"
              value={fmtCentavos(mrrRenovacoes)}
              icon={CalendarClock}
              tone="neutral"
              hint={renovacoesMes > 0 ? `${renovacoesMes} ciclo(s) a renovar` : 'nenhum ciclo vence agora'}
            />
          </div>
          {inadimplentes > 0 && (
            <p className="mt-3 text-xs text-warning-700">
              {inadimplentes} mensalista(s) inadimplente(s) — {fmtCentavos(mrrEmRisco)}/mês em risco.
            </p>
          )}
        </CardColapsavel>

        <CardColapsavel
          title="De onde veio o dinheiro"
          subtitle={`Composição da receita · ${rotuloPeriodo(periodo)}`}
          persistKey="fin-dash-composicao-v2"
          defaultOpen={false}
          right={
            lider && totalComposicao > 0 ? (
              <ResumoFechado
                valor={`${Math.round((lider.value / totalComposicao) * 100)}%`}
                detalhe={lider.name}
              />
            ) : undefined
          }
        >
          {composicao.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">Nada recebido ainda no período.</p>
          ) : (
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={composicao} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                    {composicao.map((_, i) => (
                      <Cell key={i} fill={CHART_CORES[i % CHART_CORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtCentavos(Math.round(Number(v) * 100))} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex flex-col gap-1.5">
                {composicao.slice(0, 6).map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: CHART_CORES[i % CHART_CORES.length] }} />
                    <span className="truncate">{d.name}</span>
                    <span className="ml-auto shrink-0 font-medium tabular-nums text-neutral-700">
                      {fmtCentavos(Math.round(d.value * 100))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardColapsavel>

        <CardColapsavel
          title="Fiscal"
          subtitle="Teto do MEI e projeção do ano"
          persistKey="fin-dash-fiscal"
          defaultOpen={false}
          forcarAberto={nivelMei !== 'ok'}
          right={<ResumoFechado valor={`${pctMei.toFixed(0)}%`} detalhe="do teto" />}
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Faturamento no ano" value={fmtCentavos(faturamentoAno)} icon={TrendingUp} tone="neutral" />
            <KpiCard
              label="Falta para o teto"
              value={fmtCentavos(mei?.falta_para_limite_centavos ?? 0)}
              icon={Landmark}
              tone={nivelMei === 'ok' ? 'neutral' : nivelMei === 'critico' ? 'danger' : 'warning'}
            />
            <KpiCard
              label="Projeção dezembro"
              value={fmtCentavos(mei?.projecao_dezembro_centavos ?? 0)}
              icon={Target}
              tone={
                (mei?.projecao_dezembro_centavos ?? 0) > (mei?.limite_mei_centavos ?? 0)
                  ? 'danger'
                  : 'neutral'
              }
              hint="no ritmo atual"
            />
            <KpiCard label="Limite anual" value={fmtCentavos(mei?.limite_mei_centavos ?? 0)} icon={Scale} tone="neutral" />
          </div>
          <LinkAba to="fiscal" texto="Ver Fiscal completo" />
        </CardColapsavel>

        <CardColapsavel
          title="Wellhub"
          subtitle="Check-ins registrados aguardando o repasse"
          persistKey="fin-dash-wellhub"
          defaultOpen={false}
          right={<ResumoFechado valor={fmtCentavos(wellhubAReconciliar)} detalhe="a reconciliar" />}
        >
          {wellhubAReconciliar === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-400">
              Nenhum check-in Wellhub a reconciliar no período.
            </p>
          ) : (
            <p className="text-sm text-neutral-500">
              <strong className="font-semibold text-neutral-900">{fmtCentavos(wellhubAReconciliar)}</strong> em
              check-ins já registrados que ainda não bateram com o repasse. A Wellhub transfere todo dia 15,
              referente ao mês anterior.
            </p>
          )}
          <LinkAba to="wellhub" texto="Conciliar repasse" />
        </CardColapsavel>
      </div>
    </div>
  )
}

/** Valor-título que fica visível mesmo com a seção fechada. */
function ResumoFechado({ valor, detalhe }: { valor: string; detalhe: string }) {
  return (
    <span className="shrink-0 text-right">
      <span className="block text-sm font-semibold tabular-nums text-neutral-900">{valor}</span>
      <span className="block text-[11px] text-neutral-400">{detalhe}</span>
    </span>
  )
}

function LinkAba({ to, texto }: { to: string; texto: string }) {
  return (
    <Link
      to={to}
      className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 transition hover:text-brand-700"
    >
      {texto}
      <ArrowRight className="size-3.5" />
    </Link>
  )
}
