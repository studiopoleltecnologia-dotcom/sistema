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
  variant = 'neutro',
  className,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: string }[]
  size?: 'sm' | 'md' | 'lg'
  /**
   * `neutro` — trilho cinza, pastilha branca. O padrão, para alternar entre
   * visões dentro de um bloco já delimitado.
   *
   * `marca` — trilho ameixa claro, pastilha ameixa sólida. Para quando o
   * seletor É a navegação principal da tela e precisa ser encontrado antes
   * de qualquer outra coisa; na Grade de horários, cinza-sobre-branco
   * desaparecia entre o título e a barra de controles.
   */
  variant?: 'neutro' | 'marca'
  className?: string
}) {
  const SIZE_CLS = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3.5 py-1.5 text-sm',
    lg: 'px-5 py-2 text-sm',
  } as const

  return (
    <div
      className={cn(
        'inline-flex max-w-full flex-wrap gap-1 rounded-lg p-1',
        variant === 'marca' ? 'bg-brand-100 ring-1 ring-brand-200' : 'bg-neutral-100',
        className,
      )}
    >
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
              SIZE_CLS[size],
              ativo
                ? variant === 'marca'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-white text-brand-700 shadow-sm'
                : variant === 'marca'
                  ? 'text-brand-700 hover:bg-white/60 hover:text-brand-800'
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
