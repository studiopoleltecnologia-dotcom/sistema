import { Trophy } from 'lucide-react'
import { Card, CardHeader } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { fmtCentavos } from '../../../lib/dinheiro'
import { fmtData } from '../../../lib/datas'
import { useClientesRanking } from '../hooks/useAnalises'

/** Gestão-only: mistura faturamento (dado financeiro) com tempo de casa/frequência. */
export function ClientesRanking() {
  const { data, isLoading } = useClientesRanking(true)
  const linhas = data ?? []

  return (
    <Card>
      <CardHeader title="Maiores clientes" subtitle="Por faturamento — tempo de casa, renovações e frequência" />
      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : linhas.length === 0 || linhas.every((c) => (c.faturamento_centavos ?? 0) === 0) ? (
        <EmptyState icon={Trophy} title="Ainda sem faturamento registrado por cliente." />
      ) : (
        <ol className="flex flex-col gap-1.5">
          {linhas
            .filter((c) => (c.faturamento_centavos ?? 0) > 0)
            .map((c, i) => (
              <li key={c.cliente_id} className="flex items-center gap-3 rounded-lg border border-neutral-100 p-3">
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-neutral-300">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-800">{c.nome}</span>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-400">
                    <span>desde {fmtData(c.aluno_desde)}</span>
                    <span>{c.matriculas_total} matrícula(s)</span>
                    <span>{c.ciclos_renovados} renovação(ões)</span>
                    <span>{c.aulas_frequentadas} aula(s)</span>
                    {!!c.workshops_eventos && <span>{c.workshops_eventos} workshop/evento</span>}
                  </div>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-neutral-800">
                  {fmtCentavos(c.faturamento_centavos)}
                </span>
              </li>
            ))}
        </ol>
      )}
    </Card>
  )
}
