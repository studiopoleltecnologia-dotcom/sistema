import { cn } from './cn'

/**
 * Segmented control — alternar entre visões do MESMO conteúdo (Lista x
 * Calendário, Funil x Lista). Não usar para navegação entre telas.
 *
 * Existia desde sempre com zero usos: cada tela remarcava o seu à mão, cada
 * uma com um peso um pouco diferente. A aba ativa agora é branca sólida com
 * sombra sobre trilho cinza — lê como "pastilha levantada", não como mais um
 * botão.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  size = 'md',
  className,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: string }[]
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div className={cn('inline-flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1', className)}>
      {items.map((item) => {
        const ativo = value === item.value
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            aria-pressed={ativo}
            className={cn(
              'rounded-md font-semibold transition',
              'outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              ativo
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-900',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
