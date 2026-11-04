import { Wallet } from 'lucide-react'
import { cn } from '../../../components/ui/cn'
import { fmtCentavos } from '../../../lib/dinheiro'

/**
 * O herói do Resumo: as quatro primeiras perguntas de quem abre o Financeiro
 * — quanto temos, quanto ainda entra, quanto ainda sai, quanto sobra — como
 * UMA equação, não como quatro cards soltos.
 *
 * ⚠️ Os três termos são DO PERÍODO escolhido; o saldo de cima, não — ele é
 * um fato de hoje, não um recorte.
 *
 * Antes os termos vinham de `vw_saldo_caixa`, que não filtra período: "a
 * pagar" somava TUDO que está em aberto, inclusive parcela de dívida com
 * vencimento a um ano dali. Ao lado de um título "Saldo disponível hoje" e
 * de um seletor de mês, o número lia-se como "o que sai neste mês" e era
 * quatro vezes maior que isso — o que tornava a tela inútil justamente para
 * a pergunta que ela existe para responder.
 *
 * A conta fecha porque quem chama calcula `previsto` a partir dos mesmos
 * três números que passa aqui, e não de uma segunda fonte.
 */
export function LinhaDoCaixa({
  atual,
  aReceber,
  aPagar,
  previsto,
  periodo,
}: {
  atual: number
  aReceber: number
  aPagar: number
  previsto: number
  /** Rótulo do recorte, ex.: "nov/26" — vai no nome de cada termo. */
  periodo: string
}) {
  const termos = [
    { op: '+', label: `a receber em ${periodo}`, valor: aReceber, forte: false },
    { op: '−', label: `a pagar em ${periodo}`, valor: aPagar, forte: false },
    { op: '=', label: `sobra em ${periodo}`, valor: previsto, forte: true },
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
