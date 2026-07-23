import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Cake,
  CalendarDays,
  Gauge,
  MessageCircle,
  Users,
  Wallet,
} from 'lucide-react'
import { KpiCard } from '../../components/ui/KpiCard'
import { Card, CardHeader } from '../../components/ui/Card'
import { SkeletonCard } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { fmtCentavos } from '../../lib/dinheiro'
import { useMinhaFuncao } from '../../lib/funcao'
import { useMei, useMixReceitaMensal, useSaldoCaixa } from '../financeiro/hooks/useFinanceiro'
import { nivelAlertaMei } from '../financeiro/types'
import { ReceitaEvolucao } from './components/ReceitaEvolucao'
import { OcupacaoSemana } from './components/OcupacaoSemana'
import { FunilResumo } from './components/FunilResumo'
import { FolhaResumo } from './components/FolhaResumo'
import {
  useAniversariantes,
  useFollowupsPendentes,
  useFolhaPrevista,
  useFunil,
  useInadimplentes,
  useOcupacao,
} from './hooks/useDashboard'

function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const hojeExtenso = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const MEI_TOM = { ok: 'brand', atencao: 'warning', alerta: 'warning', critico: 'danger' } as const

/** Chave AAAA-MM do mês corrente, para somar a receita do mês. */
const mesAtual = new Date().toISOString().slice(0, 7)

export function DashboardPage() {
  const { data: funcao } = useMinhaFuncao()
  // Dinheiro só para a gestão. A RLS já devolveria vazio para a
  // secretária, mas nem mostramos os cartões — o painel dela é operacional.
  const gestao = funcao === 'gestao'

  const mei = useMei()
  const caixa = useSaldoCaixa()
  const mix = useMixReceitaMensal(6)
  const funil = useFunil()
  const followups = useFollowupsPendentes()
  const inadimplentes = useInadimplentes()
  const ocupacao = useOcupacao(7)
  const aniversariantes = useAniversariantes()
  const folha = useFolhaPrevista(gestao)

  const carregando = funil.isLoading || (gestao && (mei.isLoading || caixa.isLoading))

  const faturamentoMes = (mix.data ?? [])
    .filter((r) => r.mes?.slice(0, 7) === mesAtual)
    .reduce((s, r) => s + (r.total_centavos ?? 0), 0)

  const pctMei = mei.data?.percentual_limite ?? 0
  const nivelMei = nivelAlertaMei(pctMei)
  const saldo = caixa.data?.saldo_atual_centavos ?? 0
  const ativos = funil.data?.find((f) => f.estagio === 'ativa')?.total ?? 0

  // Alertas: só entram os que pedem ação. Ordem = urgência. Os
  // financeiros (caixa, MEI, inadimplência) só para a gestão.
  const alertas: {
    to: string
    icon: typeof AlertTriangle
    texto: string
    tom: 'danger' | 'warning' | 'brand'
  }[] = []
  if (gestao && saldo < 0) {
    alertas.push({
      to: '/financeiro',
      icon: Wallet,
      texto: `Caixa negativo em ${fmtCentavos(saldo)}`,
      tom: 'danger',
    })
  }
  if (gestao && (inadimplentes.data ?? 0) > 0) {
    alertas.push({
      to: '/planos',
      icon: AlertTriangle,
      texto: `${inadimplentes.data} matrícula(s) com pagamento em aberto`,
      tom: 'danger',
    })
  }
  if (gestao && nivelMei !== 'ok') {
    alertas.push({
      to: '/financeiro',
      icon: Gauge,
      texto: `Faturamento MEI em ${pctMei.toFixed(0)}% do teto`,
      tom: nivelMei === 'critico' ? 'danger' : 'warning',
    })
  }
  if ((followups.data ?? 0) > 0) {
    alertas.push({
      to: '/followup',
      icon: MessageCircle,
      texto: `${followups.data} follow-up(s) pendente(s)`,
      tom: 'brand',
    })
  }

  const aulasProximos = (ocupacao.data ?? []).reduce((s, d) => s + d.agendados, 0)

  const TOM_ALERTA = {
    danger: 'border-danger-200 bg-danger-50 text-danger-700 hover:bg-danger-100',
    warning: 'border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100',
    brand: 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100',
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900">
          {saudacao()} 👋
        </h1>
        <p className="mt-0.5 text-sm capitalize text-neutral-400">{hojeExtenso}</p>
      </header>

      {carregando ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : gestao ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Faturamento do mês"
            value={fmtCentavos(faturamentoMes)}
            icon={Wallet}
            tone="brand"
            size="lg"
          />
          <KpiCard
            label="Teto MEI"
            value={`${pctMei.toFixed(0)}%`}
            hint={`Faltam ${fmtCentavos(mei.data?.falta_para_limite_centavos)}`}
            icon={Gauge}
            tone={MEI_TOM[nivelMei]}
            size="lg"
          />
          <KpiCard
            label="Saldo em caixa"
            value={fmtCentavos(saldo)}
            hint={`Projetado ${fmtCentavos(caixa.data?.saldo_projetado_centavos)}`}
            icon={CalendarDays}
            tone={saldo < 0 ? 'danger' : 'success'}
            size="lg"
          />
          <KpiCard
            label="Alunos ativos"
            value={String(ativos)}
            icon={Users}
            tone="neutral"
            size="lg"
          />
        </div>
      ) : (
        // Painel operacional (secretária): nenhum número financeiro.
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard label="Alunos ativos" value={String(ativos)} icon={Users} tone="brand" size="lg" />
          <KpiCard
            label="Aulas nos próximos 7 dias"
            value={String(aulasProximos)}
            icon={CalendarDays}
            tone="neutral"
            size="lg"
          />
          <KpiCard
            label="Follow-ups pendentes"
            value={String(followups.data ?? 0)}
            icon={MessageCircle}
            tone="neutral"
            size="lg"
          />
        </div>
      )}

      {alertas.length > 0 && (
        <div className="flex flex-col gap-2">
          {alertas.map((a) => (
            <Link
              key={a.texto}
              to={a.to}
              className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition ${TOM_ALERTA[a.tom]}`}
            >
              <a.icon className="size-4 shrink-0" />
              <span className="flex-1">{a.texto}</span>
              <ArrowRight className="size-3.5 shrink-0 opacity-60" />
            </Link>
          ))}
        </div>
      )}

      {gestao && folha.data && folha.data.total_centavos > 0 && (
        <FolhaResumo folha={folha.data} />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {gestao && mix.data && <ReceitaEvolucao mix={mix.data} />}
        {ocupacao.data && <OcupacaoSemana dias={ocupacao.data} />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {funil.data && <FunilResumo contagens={funil.data} />}

        <Card>
          <CardHeader
            title="Aniversariantes do mês"
            subtitle="Um toque no dia certo fideliza (a casinha)"
          />
          {aniversariantes.data && aniversariantes.data.length > 0 ? (
            <ul className="flex flex-col divide-y divide-neutral-100">
              {aniversariantes.data.map((a) => (
                <li key={a.nome} className="flex items-center gap-2.5 py-2 text-sm">
                  <Cake className="size-4 shrink-0 text-brand-400" />
                  <span className="flex-1 text-neutral-700">{a.nome}</span>
                  <span className="text-xs text-neutral-400">dia {a.dia}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Cake}
              title="Ninguém faz aniversário este mês"
              description="Nada a comemorar por aqui agora."
            />
          )}
        </Card>
      </div>
    </div>
  )
}
