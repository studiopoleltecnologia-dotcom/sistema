import { useMemo, useState } from 'react'
import { AlertTriangle, Percent, UserPlus, Users, XCircle } from 'lucide-react'
import { KpiCard } from '../../components/ui/KpiCard'
import { SkeletonCard } from '../../components/ui/Skeleton'
import { useMinhaFuncao } from '../../lib/funcao'
import { AnaliseHorarios } from './components/AnaliseHorarios'
import { AnaliseModalidades } from './components/AnaliseModalidades'
import { AnaliseProfessoras } from './components/AnaliseProfessoras'
import { CentralAlertas } from './components/CentralAlertas'
import { ClientesRanking } from './components/ClientesRanking'
import { ClientesRisco } from './components/ClientesRisco'
import { ClientesSumidos } from './components/ClientesSumidos'
import { Evolucao } from './components/Evolucao'
import { Rankings } from './components/Rankings'
import { useOcupacaoTendencia, useResumo } from './hooks/useAnalises'

export function AnalisesPage() {
  const { data: funcao } = useMinhaFuncao()
  const gestao = funcao === 'gestao'
  const resumo = useResumo()
  const ocupacao = useOcupacaoTendencia()
  const [destaque, setDestaque] = useState<{ tipo: string; id: string } | null>(null)

  const carregando = resumo.isLoading || ocupacao.isLoading

  const { ocupacaoGeral, criticos } = useMemo(() => {
    const linhas = ocupacao.data ?? []
    const reservas = linhas.reduce((s, t) => s + (t.reservas_atual ?? 0), 0)
    const vagas = linhas.reduce((s, t) => s + (t.ocorrencias_atual ?? 0) * (t.capacidade ?? 0), 0)
    const criticos = linhas.filter(
      (t) =>
        t.tendencia !== 'insuficiente' &&
        (t.ocupacao_atual_pct ?? 0) < 40 &&
        (t.ocupacao_anterior_pct ?? 0) < 40,
    ).length
    return { ocupacaoGeral: vagas > 0 ? Math.round((100 * reservas) / vagas) : 0, criticos }
  }, [ocupacao.data])

  function selecionar(origemTipo: string, origemId: string) {
    setDestaque({ tipo: origemTipo, id: origemId })
    document.getElementById(`${origemTipo}-${origemId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900">Análises</h1>
        <p className="mt-0.5 text-sm text-neutral-400">
          O que está funcionando, o que está piorando e o que fazer agora — últimas 4 semanas vs. as 4
          anteriores.
        </p>
      </header>

      {carregando ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard label="Ocupação geral" value={`${ocupacaoGeral}%`} icon={Percent} tone="brand" size="lg" />
          <KpiCard
            label="Alunos ativos"
            value={String(resumo.data?.alunos_ativos ?? 0)}
            icon={Users}
            tone="neutral"
            size="lg"
          />
          <KpiCard
            label="Novos alunos"
            value={String(resumo.data?.novos_alunos_periodo ?? 0)}
            icon={UserPlus}
            tone="success"
            size="lg"
            hint="últimas 4 semanas"
          />
          <KpiCard
            label="Cancelamento"
            value={`${resumo.data?.taxa_cancelamento_pct ?? 0}%`}
            icon={XCircle}
            tone={(resumo.data?.taxa_cancelamento_pct ?? 0) >= 30 ? 'danger' : 'neutral'}
            size="lg"
            hint="últimas 4 semanas"
          />
          <KpiCard
            label="Horários críticos"
            value={String(criticos)}
            icon={AlertTriangle}
            tone={criticos > 0 ? 'danger' : 'neutral'}
            size="lg"
          />
        </div>
      )}

      <CentralAlertas onSelecionar={selecionar} />

      <Evolucao />

      <AnaliseHorarios destaqueId={destaque?.tipo === 'turma' ? destaque.id : null} />
      <AnaliseModalidades destaqueId={destaque?.tipo === 'modalidade' ? destaque.id : null} />
      <AnaliseProfessoras destaqueId={destaque?.tipo === 'professora' ? destaque.id : null} />

      <Rankings />

      <ClientesRisco />
      <ClientesSumidos />
      {gestao && <ClientesRanking />}
    </div>
  )
}
