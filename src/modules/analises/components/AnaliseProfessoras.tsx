import { GraduationCap } from 'lucide-react'
import { Card, CardHeader } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useAnaliseProfessora } from '../hooks/useAnalises'
import { labelTendencia } from '../types'

export function AnaliseProfessoras({ destaqueId }: { destaqueId: string | null }) {
  const { data, isLoading } = useAnaliseProfessora()
  const linhas = data ?? []

  return (
    <Card>
      <CardHeader title="Professoras" subtitle="Ocupação por professora vs. a média da modalidade" />
      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : linhas.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Sem dado suficiente para comparar professoras ainda." />
      ) : (
        <ul className="flex flex-col gap-2">
          {linhas.map((p) => {
            const destacada = destaqueId === p.professora_id
            const insuficiente = p.tendencia === 'insuficiente'
            const vs = p.vs_modalidade_pp ?? 0
            return (
              <li
                key={`${p.professora_id}-${p.modalidade_id}`}
                id={`professora-${p.professora_id}`}
                className={`rounded-lg border p-3.5 transition ${
                  destacada ? 'border-brand-400 ring-2 ring-brand-100' : 'border-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-800">
                    {p.professora} <span className="font-normal text-neutral-400">· {p.modalidade}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-neutral-700">
                    {p.ocupacao_atual_pct}%
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400">
                  <span>{insuficiente ? 'dados insuficientes' : labelTendencia(p.tendencia)}</span>
                  {p.media_modalidade_pct != null && (
                    <span className={vs >= 0 ? 'text-success-600' : 'text-danger-600'}>
                      {vs >= 0 ? '+' : ''}
                      {vs}pp vs. média da modalidade
                    </span>
                  )}
                  {p.taxa_falta_pct != null && <span>{p.taxa_falta_pct}% de falta</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
