import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Cake,
  CalendarDays,
  Eye,
  EyeOff,
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
import { useSigilo } from '../../lib/sigilo'
import { useMei, useMixReceitaMensal, useSaldoCaixa } from '../financeiro/hooks/useFinanceiro'
import { nivelAlertaMei } from '../financeiro/types'
import { ReceitaEvolucao } from './components/ReceitaEvolucao'
import { AulasDoDia } from './components/AulasDoDia'
import { FunilResumo } from './components/FunilResumo'
import { FolhaResumo } from './components/FolhaResumo'
import {
  useAniversariantes,
  useAulasDeHoje,
  useFollowupsPendentes,
  useFolhaPrevista,
  useFunil,
  useInadimplentes,
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
  // Mesmo para a gestão, o valor começa escondido: esta é a tela de abertura
  // do sistema e ela é aberta na recepção, com gente do lado. Ver lib/sigilo.
  const { oculto, alternar, mascarar } = useSigilo()

  const mei = useMei()
  const caixa = useSaldoCaixa()
  const mix = useMixReceitaMensal(6)
  const funil = useFunil()
  const followups = useFollowupsPendentes()
  const inadimplentes = useInadimplentes()
  const aulas = useAulasDeHoje()
  const aniversariantes = useAniversariantes()
  const folha = useFolhaPrevista(gestao)

  const carregando = funil.isLoading || aulas.isLoading

  const faturamentoMes = (mix.data ?? [])
    .filter((r) => r.mes?.slice(0, 7) === mesAtual)
    .reduce((s, r) => s + (r.total_centavos ?? 0), 0)

  const pctMei = mei.data?.percentual_limite ?? 0
  const nivelMei = nivelAlertaMei(pctMei)
  const saldo = caixa.data?.saldo_atual_centavos ?? 0
  const ativos = funil.data?.find((f) => f.estagio === 'ativa')?.total ?? 0
  const aulasHoje = aulas.data?.length ?? 0

  // Alertas: só entram os que pedem ação. Ordem = urgência. Os
  // financeiros (caixa, MEI, inadimplência) só para a gestão.
  //
  // Eles também obedecem ao sigilo: um alerta que anuncia "Caixa negativo em
  // R$ 2.310,00" entrega justamente o número que os cartões abaixo escondem.
  // Oculto, o alerta continua chamando para a ação — sem dizer de quanto.
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
      texto: oculto ? 'Caixa negativo' : `Caixa negativo em ${fmtCentavos(saldo)}`,
      tom: 'danger',
    })
  }
  if (gestao && (inadimplentes.data ?? 0) > 0) {
    alertas.push({
      to: '/matriculas?aba=em_aberto',
      icon: AlertTriangle,
      texto: `${inadimplentes.data} matrícula(s) com pagamento em aberto`,
      tom: 'danger',
    })
  }
  if (gestao && nivelMei !== 'ok') {
    alertas.push({
      to: '/financeiro/fiscal',
      icon: Gauge,
      texto: oculto
        ? 'Faturamento MEI se aproximando do teto'
        : `Faturamento MEI em ${pctMei.toFixed(0)}% do teto`,
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

      {/*
        O topo do painel é operacional para todo mundo — inclusive para a
        gestão. Antes os três números financeiros abriam a tela, e era isso
        que aparecia ao ligar o projetor ou virar o notebook para alguém. Eles
        continuam no painel, mas no rodapé e atrás do olhinho.
      */}
      {carregando ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard label="Alunos ativos" value={String(ativos)} icon={Users} tone="brand" size="lg" />
          <KpiCard
            label="Aulas hoje"
            value={String(aulasHoje)}
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

      {aulas.data && <AulasDoDia aulas={aulas.data} />}

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

      {gestao && (
        <section className="flex flex-col gap-4 border-t border-neutral-200/80 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-neutral-900">
                Financeiro
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                {oculto ? 'Valores ocultos — toque no olho para ver' : 'Visível nesta tela'}
              </p>
            </div>
            <button
              onClick={alternar}
              aria-pressed={!oculto}
              aria-label={oculto ? 'Mostrar valores' : 'Ocultar valores'}
              title={oculto ? 'Mostrar valores' : 'Ocultar valores'}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700"
            >
              {oculto ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              <span className="hidden sm:inline">{oculto ? 'Mostrar' : 'Ocultar'}</span>
            </button>
          </div>

          {mei.isLoading || caixa.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard
                label="Faturamento do mês"
                value={mascarar(fmtCentavos(faturamentoMes))}
                icon={Wallet}
                tone="brand"
                size="lg"
              />
              <KpiCard
                label="Teto MEI"
                value={mascarar(`${pctMei.toFixed(0)}%`)}
                hint={
                  oculto
                    ? undefined
                    : `Faltam ${fmtCentavos(mei.data?.falta_para_limite_centavos)}`
                }
                icon={Gauge}
                // Oculto o tom vira neutro: um cartão vermelho anuncia
                // "estamos perto do teto" sem precisar do número.
                tone={oculto ? 'neutral' : MEI_TOM[nivelMei]}
                size="lg"
              />
              <KpiCard
                label="Saldo em caixa"
                value={mascarar(fmtCentavos(saldo))}
                hint={
                  oculto
                    ? undefined
                    : `Projetado ${fmtCentavos(caixa.data?.saldo_projetado_centavos)}`
                }
                icon={CalendarDays}
                tone={oculto ? 'neutral' : saldo < 0 ? 'danger' : 'success'}
                size="lg"
              />
            </div>
          )}

          {folha.data && folha.data.total_centavos > 0 && (
            <FolhaResumo folha={folha.data} oculto={oculto} />
          )}

          {mix.data && <ReceitaEvolucao mix={mix.data} oculto={oculto} />}
        </section>
      )}
    </div>
  )
}
