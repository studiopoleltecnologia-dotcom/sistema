import type { ComponentType } from 'react'
import { TrendingDown, TrendingUp, type LucideProps } from 'lucide-react'
import { cn } from './cn'

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'
type Size = 'md' | 'lg'

const ICON_TONE_CLS: Record<Tone, string> = {
  neutral: 'bg-neutral-100 text-neutral-500',
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
}

const VALUE_TONE_CLS: Record<Tone, string> = {
  neutral: 'text-ink',
  brand: 'text-brand-700',
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
}

/**
 * `size="lg"` é reservado para os poucos números que devem "saltar aos
 * olhos" (destaque de página) — o valor herda a cor do tom para reforçar a
 * leitura rápida. `size="md"` (default) é para métricas de apoio.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  tendencia,
  size = 'md',
  className,
}: {
  label: string
  value: string
  hint?: string
  icon?: ComponentType<LucideProps>
  tone?: Tone
  tendencia?: { valor: string; positiva: boolean }
  size?: Size
  className?: string
}) {
  const lg = size === 'lg'
  return (
    <div
      className={cn(
        'rounded-xl border border-neutral-200/80 bg-white shadow-sm transition hover:shadow-md',
        lg ? 'p-5' : 'p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <span className={cn('font-medium text-neutral-400', lg ? 'text-[13px]' : 'text-xs')}>
          {label}
        </span>
        {Icon && (
          <span className={cn('rounded-lg', lg ? 'p-2' : 'p-1.5', ICON_TONE_CLS[tone])}>
            <Icon className={lg ? 'size-4' : 'size-3.5'} strokeWidth={2} />
          </span>
        )}
      </div>
      <div
        className={cn(
          'mt-2 font-display font-bold tracking-tight',
          lg ? `text-[2.15rem] leading-none ${VALUE_TONE_CLS[tone]}` : 'text-xl text-neutral-900',
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {tendencia && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              lg ? 'text-sm' : 'text-xs',
              tendencia.positiva ? 'text-success-600' : 'text-danger-600',
            )}
          >
            {tendencia.positiva ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {tendencia.valor}
          </span>
        )}
        {hint && <span className="text-[11px] text-neutral-400">{hint}</span>}
      </div>
    </div>
  )
}
