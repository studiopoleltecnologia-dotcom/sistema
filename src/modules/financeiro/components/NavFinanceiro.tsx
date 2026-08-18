import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../../../components/ui/cn'

/**
 * Sub-navegação do Financeiro.
 *
 * Duas decisões que valem registro, porque a versão anterior tropeçou nas duas:
 *
 * 1. **Texto sempre, ícone nunca.** Antes o rótulo era `hidden sm:inline` — ou
 *    seja, abaixo de 640px sobravam só os ícones, justamente onde eles são mais
 *    difíceis de ler. Ícone + texto dobraria a largura de cada chip; então o
 *    texto trabalha sozinho.
 * 2. **Uma linha, com rolagem horizontal.** Onze abas quebravam em duas ou três
 *    fileiras no celular e empurravam o conteúdo para baixo. Rolar mantém a
 *    altura fixa em qualquer quantidade; as máscaras nas bordas avisam que há
 *    mais para o lado.
 *
 * As abas que eram irmãs mas respondem à mesma pergunta viraram grupo com
 * sub-abas: Contas/Calendário/Recorrências são "o que cai e quando" em três
 * formatos, e DRE é resultado apurado igual ao teto do MEI. De 11 para 8.
 */
type Sub = { to: string; label: string }
type Grupo = {
  to: string
  label: string
  /** Segmentos de URL que acendem este chip (o grupo inteiro). */
  rotas: string[]
  subs?: Sub[]
}

const GRUPOS: Grupo[] = [
  { to: '.', label: 'Resumo', rotas: [''] },
  { to: 'entradas', label: 'Entradas', rotas: ['entradas'] },
  { to: 'saidas', label: 'Saídas', rotas: ['saidas'] },
  {
    to: 'contas',
    label: 'Contas',
    rotas: ['contas', 'calendario', 'recorrencias'],
    subs: [
      { to: 'contas', label: 'Lista' },
      { to: 'calendario', label: 'Calendário' },
      { to: 'recorrencias', label: 'Recorrências' },
    ],
  },
  { to: 'fluxo', label: 'Fluxo de caixa', rotas: ['fluxo'] },
  { to: 'dividas', label: 'Dívidas', rotas: ['dividas'] },
  {
    to: 'fiscal',
    label: 'Fiscal',
    rotas: ['fiscal', 'dre'],
    subs: [
      { to: 'fiscal', label: 'Teto do MEI' },
      { to: 'dre', label: 'DRE' },
    ],
  },
  { to: 'reserva', label: 'Reserva', rotas: ['reserva'] },
  { to: 'wellhub', label: 'Wellhub', rotas: ['wellhub'] },
]

/** Segmento logo depois de /financeiro ('' = Resumo). */
function segmentoAtual(pathname: string): string {
  return pathname.split('/').filter(Boolean)[1] ?? ''
}

export function NavFinanceiro({ acoes }: { acoes?: ReactNode }) {
  const seg = segmentoAtual(useLocation().pathname)
  const grupo = GRUPOS.find((g) => g.rotas.includes(seg)) ?? GRUPOS[0]

  const trilho = useRef<HTMLDivElement>(null)
  const chipAtivo = useRef<HTMLAnchorElement>(null)
  const [corte, setCorte] = useState({ esq: false, dir: false })

  function medirCorte() {
    const el = trilho.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    // 1px de folga: zoom do navegador deixa scrollLeft fracionário.
    setCorte({ esq: el.scrollLeft > 1, dir: el.scrollLeft < max - 1 })
  }

  useEffect(() => {
    medirCorte()
    window.addEventListener('resize', medirCorte)
    return () => window.removeEventListener('resize', medirCorte)
  }, [])

  // Traz o chip ativo para o centro ao trocar de aba. Não uso
  // scrollIntoView porque ele também rola a PÁGINA para achar o elemento —
  // entrar em Wellhub e a tela pular para baixo seria pior que o problema.
  useEffect(() => {
    const el = trilho.current
    const ativo = chipAtivo.current
    if (!el || !ativo) return
    el.scrollLeft = ativo.offsetLeft - (el.clientWidth - ativo.clientWidth) / 2
    medirCorte()
  }, [seg])

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <div
          ref={trilho}
          onScroll={medirCorte}
          className="flex snap-x snap-proximity gap-1 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {GRUPOS.map((g) => {
            const ativo = g === grupo
            return (
              <NavLink
                key={g.to}
                to={g.to}
                end={g.to === '.'}
                ref={ativo ? chipAtivo : undefined}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'shrink-0 snap-start whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                  ativo
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
                )}
              >
                {g.label}
              </NavLink>
            )
          })}
        </div>

        {/* Máscaras: só existem quando há conteúdo cortado daquele lado. */}
        {corte.esq && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-neutral-50 to-transparent" />
        )}
        {corte.dir && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-neutral-50 to-transparent" />
        )}
      </div>
        {acoes && <div className="shrink-0">{acoes}</div>}
      </div>

      {grupo.subs && (
        <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-neutral-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {grupo.subs.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                cn(
                  'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition',
                  isActive
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-800',
                )
              }
            >
              {s.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}
