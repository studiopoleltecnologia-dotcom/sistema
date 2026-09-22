import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react'
import { cn } from '../../../components/ui/cn'

/**
 * Peças pequenas repetidas pelas telas do portal. Seguem o design system
 * (tokens brand/success/warning/danger, League Spartan nos títulos), no
 * tom mais leve que o portal sempre teve — o ERP usa título em caixa alta,
 * aqui é conversa com o aluno.
 */

export function Cabecalho({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  acao?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 lg:mb-7">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold leading-tight text-ink lg:text-3xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-neutral-500">{subtitulo}</p>}
      </div>
      {acao}
    </header>
  )
}

/** Rótulo de seção — o mesmo tom do "PRÓXIMA AULA" de sempre. */
export function Secao({
  titulo,
  acao,
  children,
  className,
}: {
  titulo: ReactNode
  acao?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  )
}

type TomAviso = 'info' | 'sucesso' | 'atencao' | 'perigo'

const TOM: Record<TomAviso, { cls: string; icone: LucideIcon }> = {
  info: { cls: 'border-brand-100 bg-brand-50 text-brand-800', icone: Info },
  sucesso: { cls: 'border-success-100 bg-success-50 text-success-700', icone: CircleCheck },
  atencao: { cls: 'border-warning-100 bg-warning-50 text-warning-700', icone: AlertTriangle },
  perigo: { cls: 'border-danger-100 bg-danger-50 text-danger-700', icone: CircleAlert },
}

/** Faixa de aviso: um título curto e, se preciso, uma linha de apoio e uma ação. */
export function Aviso({
  tom = 'info',
  titulo,
  children,
  acao,
  className,
}: {
  tom?: TomAviso
  titulo: ReactNode
  children?: ReactNode
  acao?: ReactNode
  className?: string
}) {
  const { cls, icone: Icone } = TOM[tom]
  return (
    <div role="status" className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm', cls, className)}>
      <Icone className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{titulo}</p>
        {children && <div className="mt-0.5 text-[13px] leading-snug opacity-90">{children}</div>}
        {acao && <div className="mt-2">{acao}</div>}
      </div>
    </div>
  )
}

/** Cartão branco padrão do portal. */
export function Cartao({
  children,
  className,
  destaque,
}: {
  children: ReactNode
  className?: string
  destaque?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-4 lg:p-5',
        destaque ? 'border-brand-200 shadow-md' : 'border-neutral-200/80 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Um par rótulo → valor, para listas de detalhe. */
export function Dado({ rotulo, children }: { rotulo: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-neutral-500">{rotulo}</dt>
      <dd className="min-w-0 text-right font-medium text-neutral-900">{children}</dd>
    </div>
  )
}

export function Carregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-100" />
      ))}
    </div>
  )
}

export function ErroCarregar({ onTentar }: { onTentar: () => void }) {
  return (
    <Aviso
      tom="perigo"
      titulo="Não foi possível carregar"
      acao={
        <button onClick={onTentar} className="text-xs font-semibold underline underline-offset-2">
          Tentar de novo
        </button>
      }
    >
      Verifique sua conexão e tente de novo.
    </Aviso>
  )
}

/**
 * `true` a partir de 1024px (o `lg` do Tailwind). A Agenda muda de forma —
 * não só de largura — no desktop, então a decisão precisa estar no JS, e
 * não apenas em classes CSS.
 */
export function useTelaGrande(): boolean {
  const consulta = '(min-width: 1024px)'
  const [grande, setGrande] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(consulta).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(consulta)
    const aoMudar = () => setGrande(mq.matches)
    mq.addEventListener('change', aoMudar)
    return () => mq.removeEventListener('change', aoMudar)
  }, [])
  return grande
}
