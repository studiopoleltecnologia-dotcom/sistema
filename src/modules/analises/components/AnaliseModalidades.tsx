import { Layers } from 'lucide-react'
import { Card, CardHeader } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useAnaliseModalidade } from '../hooks/useAnalises'
import { labelTendencia } from '../types'

export function AnaliseModalidades({ destaqueId }: { destaqueId: string | null }) {
  const { data, isLoading } = useAnaliseModalidade()
  const linhas = data ?? []

  return (
    <Card>
      <CardHeader title="Modalidades" subtitle="Ocupação, alunas novas e falta por modalidade" />
      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : linhas.length === 0 ? (
        <EmptyState icon={Layers} title="Nenhuma modalidade com turma ativa vinculada." />
      ) : (
        <ul className="flex flex-col gap-2">
          {linhas.map((m) => {
            const destacada = destaqueId === m.modalidade_id
            const insuficiente = m.tendencia === 'insuficiente'
            return (
              <li
                key={m.modalidade_id}
                id={`modalidade-${m.modalidade_id}`}
                className={`rounded-lg border p-3.5 transition ${
                  destacada ? 'border-brand-400 ring-2 ring-brand-100' : 'border-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-800">{m.modalidade}</span>
                  <span className="text-sm font-semibold tabular-nums text-neutral-700">
                    {m.ocupacao_atual_pct}%
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400">
                  <span>{m.turmas} turma(s)</span>
                  <span>{insuficiente ? 'dados insuficientes' : labelTendencia(m.tendencia)}</span>
                  {!!m.alunas_novas_periodo && (
                    <span>{m.alunas_novas_periodo} aluna(s) nova(s) no período</span>
                  )}
                  {m.taxa_falta_pct != null && <span>{m.taxa_falta_pct}% de falta</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
