import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../../../components/ui/cn'

/**
 * Folha que sobe da base da tela — no celular é onde o polegar já está.
 * A partir de `sm` vira um cartão centralizado, como o Modal do sistema.
 *
 * É o "segundo andar" da tela de Planos: tudo que não ajuda a ESCOLHER
 * (regras, cobrança, comparação) mora aqui, aberto só quando pedido.
 */
export function Folha({
  titulo,
  children,
  onFechar,
}: {
  titulo: ReactNode
  children: ReactNode
  onFechar: () => void
}) {
  const tituloId = useId()
  const painel = useRef<HTMLDivElement>(null)
  const [aberta, setAberta] = useState(false)

  // O pai costuma passar uma arrow nova a cada render; guardar em ref
  // evita refazer o efeito abaixo (e travar/destravar a rolagem) à toa.
  const fechar = useRef(onFechar)
  useEffect(() => {
    fechar.current = onFechar
  })

  useEffect(() => {
    // Um frame depois de montar, para a transição de entrada acontecer.
    const quadro = requestAnimationFrame(() => setAberta(true))
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar.current()
    }
    window.addEventListener('keydown', aoTeclar)
    // Sem isto a página de trás rola junto no iOS.
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    painel.current?.focus()
    return () => {
      cancelAnimationFrame(quadro)
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAntes
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        aria-hidden
        onClick={() => fechar.current()}
        className={cn(
          'absolute inset-0 bg-ink/40 transition-opacity duration-200',
          aberta ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-lg outline-none',
          'transition duration-200 ease-out sm:rounded-2xl',
          aberta ? 'translate-y-0 opacity-100' : 'translate-y-full sm:translate-y-4 sm:opacity-0',
        )}
      >
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-neutral-200 sm:hidden" />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4">
          <h2 id={tituloId} className="font-display text-lg font-bold leading-tight text-neutral-900">
            {titulo}
          </h2>
          <button
            onClick={() => fechar.current()}
            aria-label="Fechar"
            className="-mr-1.5 -mt-0.5 rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          {children}
        </div>
      </div>
    </div>
  )
}
