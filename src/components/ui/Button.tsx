import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

/**
 * Escada de peso visual — é o que faz a ação principal de uma tela ser
 * encontrada sem leitura. Antes `secondary` (bg-neutral-100) e `ghost`
 * (hover:bg-neutral-100) terminavam idênticos no hover, então "salvar" e
 * "cancelar" tinham a mesma presença.
 *
 * Do mais forte ao mais fraco:
 *   primary   — caixa sólida da marca + sombra que cresce. Uma por tela.
 *   secondary — caixa branca com borda: ainda é botão, mas cede a vez.
 *   outline    — como secondary, porém sem preenchimento sólido no hover.
 *   ghost     — só texto até o hover. Ação terciária/reversível.
 *   danger    — sólida vermelha, para destruição confirmada.
 */
const VARIANT_CLS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-md focus-visible:ring-brand-300',
  secondary:
    'border border-neutral-300 bg-white text-neutral-700 shadow-xs hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:ring-neutral-300',
  outline:
    'border border-neutral-200 bg-white text-neutral-700 hover:border-brand-400 hover:text-brand-700 focus-visible:ring-brand-200',
  ghost:
    'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-neutral-300',
  danger:
    'bg-danger-600 text-white shadow-sm hover:bg-danger-700 hover:shadow-md focus-visible:ring-danger-300',
}

const SIZE_CLS: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  /** Ação principal de uma página inteira. */
  lg: 'px-5 py-3 text-sm gap-2',
}

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        'active:scale-[0.98]',
        // Foco visível por teclado — nenhuma variante tinha, então navegar
        // sem mouse era às cegas.
        'outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        VARIANT_CLS[variant],
        SIZE_CLS[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
})
