import { Wallet } from 'lucide-react'
import { cn } from '../../../components/ui/cn'
import { fmtCentavos } from '../../../lib/dinheiro'
import type { SaldoCaixa } from '../types'

/**
 * O herói do Resumo: as quatro primeiras perguntas de quem abre o Financeiro
 * — quanto temos, quanto ainda entra, quanto ainda sai, quanto sobra — como
 * UMA equação, não como quatro cards soltos.
 *
 * Os termos saem inteiros de `vw_saldo_caixa`, e é de propósito: a view
 * calcula `saldo_projetado` exatamente como
 * `saldo_atual + previstas − saidas_previstas − recorrentes_pendentes`.
 * Somar de novo aqui no front abriria espaço para a conta não fechar na tela.
 *
 * "Em aberto" e não "no mês": a view não filtra por período, então os valores
 * são o total pendente. Rotular de outro jeito seria mentira.
 */
export function LinhaDoCaixa({ saldo }: { saldo?: SaldoCaixa | null }) {
  const atual = saldo?.saldo_atual_centavos ?? 0
  const aReceber = saldo?.previsto_em_aberto_centavos ?? 0
  const aPagar =
    (saldo?.saidas_previstas_centavos ?? 0) + (saldo?.recorrentes_pendentes_mes_centavos ?? 0)
  const previsto = saldo?.saldo_projetado_centavos ?? 0

  const termos = [
    { op: '+', label: 'a receber', valor: aReceber, forte: false },
    { op: '−', label: 'a pagar', valor: aPagar, forte: false },
    { op: '=', label: 'previsto', valor: previsto, forte: true },
  ]

  return (
    <div className="rounded-xl border border-neutral-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-neutral-400">Saldo disponível hoje</span>
        <span
          className={cn(
            'rounded-lg p-2',
            atual < 0 ? 'bg-danger-50 text-danger-600' : 'bg-brand-50 text-brand-600',
          )}
        >
          <Wallet className="size-4" strokeWidth={2} />
        </span>
      </div>

      {/* O único número deste tamanho na página inteira. É esse o ponto. */}
      <p
        className={cn(
          'mt-2 break-words font-display text-[1.75rem] font-bold leading-none tracking-tight tabular-nums sm:text-[2.75rem]',
          atual < 0 ? 'text-danger-700' : 'text-brand-700',
        )}
      >
        {fmtCentavos(atual)}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-neutral-100 pt-4">
        {termos.map((t) => (
          <div key={t.label} className="min-w-0">
            <p className="flex items-baseline gap-1 text-[11px] text-neutral-400">
              <span className="font-semibold text-neutral-300">{t.op}</span>
              <span className="truncate">{t.label}</span>
            </p>
            <p
              className={cn(
                'mt-0.5 break-words text-sm font-semibold tabular-nums sm:text-base',
                t.forte
                  ? t.valor < 0
                    ? 'text-danger-700'
                    : 'text-neutral-900'
                  : 'text-neutral-600',
              )}
            >
              {fmtCentavos(t.valor)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
