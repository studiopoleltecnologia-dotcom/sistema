import { cn } from './cn'

export type ChipItem<T extends string> = {
  value: T
  label: string
  /** Contador opcional — mostra o tamanho do filtro antes de clicar. */
  qtd?: number
}

/**
 * Pílulas de filtro com estado ativo forte.
 *
 * A versão anterior (feita à mão dentro de EntradasPage) diferenciava ativo
 * de inativo só por cor de fundo suave, então dava para não perceber qual
 * filtro estava ligado. Aqui o ativo é bloco sólido da marca — não tem como
 * confundir com os demais.
 */
export function FiltroChips<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T
  onChange: (v: T) => void
  items: ChipItem<T>[]
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((item) => {
        const ativo = value === item.value
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            aria-pressed={ativo}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition',
              'outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1',
              ativo
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50 hover:text-neutral-900 hover:ring-neutral-300',
            )}
          >
            {item.label}
            {item.qtd != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  ativo ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500',
                )}
              >
                {item.qtd}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
