import { ShieldAlert } from 'lucide-react'
import { Card, CardHeader } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { fmtData } from '../../../lib/datas'
import { useClientesRisco, usePlanosNomes } from '../hooks/useAnalises'
import { PRIORIDADE_TOM, type Prioridade } from '../types'

const SINAL_LABEL: Record<string, string> = {
  queda_frequencia: 'Queda de frequência',
  faltas_recentes: 'Faltas recentes',
  vencimento_proximo: 'Vencimento próximo',
  poucos_creditos: 'Poucos créditos',
  sem_interacao: 'Sem interação há 30+ dias',
}

export function ClientesRisco() {
  const { data, isLoading } = useClientesRisco()
  const { data: planosNomes } = usePlanosNomes()
  const linhas = data ?? []

  const nomePlano = (id: string | null) =>
    (planosNomes ?? []).find((p) => p.id === id)?.nome ?? 'Plano'

  return (
    <Card>
      <CardHeader
        title="Clientes em risco"
        subtitle="Score por sinais de queda — quem merece contato prioritário"
      />
      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : linhas.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Ninguém em risco no momento"
          description="Nenhum aluno com sinal de queda hoje."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {linhas.map((c) => {
            const prioridade = (c.prioridade ?? 'baixa') as Prioridade
            const tom = PRIORIDADE_TOM[prioridade]
            const sinais = (
              ['queda_frequencia', 'faltas_recentes', 'vencimento_proximo', 'poucos_creditos', 'sem_interacao'] as const
            ).filter((s) => c[s])
            return (
              <li key={c.cliente_id} className="rounded-lg border border-neutral-100 p-3.5">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm font-medium text-neutral-800">
                    {c.nome}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tom.chip}`}>
                    {tom.label}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400">
                  <span>{nomePlano(c.plano_id)}</span>
                  <span>{c.saldo_creditos} crédito(s)</span>
                  <span>vence {fmtData(c.data_fim)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {sinais.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-500"
                    >
                      {SINAL_LABEL[s]}
                    </span>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
