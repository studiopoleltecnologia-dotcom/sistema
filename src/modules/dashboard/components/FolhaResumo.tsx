import { Link } from 'react-router-dom'
import { ArrowRight, Coins } from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import { fmtCentavos } from '../../../lib/dinheiro'
import type { FolhaPrevista } from '../api/dashboard'

/**
 * Lembrete de obrigação: quanto de pagamento de professora está previsto
 * para o mês (pago dia 15). É o bruto ao vivo — o valor fechado, com
 * ajustes e aprovação, vive no /fechamento, para onde este card leva.
 */
export function FolhaResumo({ folha }: { folha: FolhaPrevista }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-brand-50 p-2 text-brand-600">
          <Coins className="size-4" strokeWidth={2} />
        </span>
        <div>
          <p className="text-[13px] font-medium text-neutral-400">
            Folha das professoras · previsto
          </p>
          <p className="mt-0.5 font-display text-2xl font-bold tracking-tight text-neutral-900">
            {fmtCentavos(folha.total_centavos)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {folha.professoras} professora{folha.professoras === 1 ? '' : 's'} ·{' '}
            {folha.aulas} aula{folha.aulas === 1 ? '' : 's'} · pagamento dia 15
          </p>
        </div>
      </div>
      <Link
        to="/fechamento"
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900"
      >
        Abrir fechamento
        <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  )
}
