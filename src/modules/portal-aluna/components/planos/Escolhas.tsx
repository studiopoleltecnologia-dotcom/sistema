import type { ReactNode } from 'react'
import { CalendarCheck, Check, ChevronRight, Shuffle } from 'lucide-react'
import { cn } from '../../../../components/ui/cn'
import {
  destaqueDoPlano,
  entregaDoPlano,
  fmtPreco,
  resumoAvulso,
  sufixoPreco,
  type Produto,
  type Recorrencia,
  type TipoPlano,
} from './catalogo'

/** Rótulo de seção no mesmo tom do "PRÓXIMA AULA" do Início. */
export function Rotulo({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{children}</h2>
      {acao}
    </div>
  )
}

/** Link discreto que abre uma folha ("Qual a diferença?", "Como funciona?"). */
export function LinkFolha({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline decoration-brand-200 underline-offset-2 transition hover:decoration-brand-500"
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------
// 1. Qual formato
// ------------------------------------------------------------

const TIPOS: Record<TipoPlano, { titulo: string; apoio: string; Icone: typeof Shuffle }> = {
  creditos: {
    titulo: 'Por créditos',
    apoio: 'Escolha diferentes aulas e horários.',
    Icone: Shuffle,
  },
  turma_fixa: {
    titulo: 'Turma fixa',
    apoio: 'Garanta sua vaga na mesma turma toda semana.',
    Icone: CalendarCheck,
  },
}

/**
 * A primeira pergunta da tela, e a única que aparece antes de qualquer
 * preço de plano. Lado a lado, e não empilhados: é uma escolha entre dois,
 * e o olho compara melhor na horizontal.
 */
export function EscolhaTipo({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: { tipo: TipoPlano; aPartirDe: string | null }[]
  valor: TipoPlano | null
  onChange: (t: TipoPlano) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {opcoes.map(({ tipo, aPartirDe }) => {
        const { titulo, apoio, Icone } = TIPOS[tipo]
        const ativo = valor === tipo
        return (
          <button
            key={tipo}
            type="button"
            onClick={() => onChange(tipo)}
            aria-pressed={ativo}
            className={cn(
              'relative flex flex-col items-start rounded-xl border bg-white p-3.5 text-left transition',
              'outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
              ativo
                ? 'border-brand-500 shadow-md ring-2 ring-brand-200'
                : 'border-neutral-200 shadow-sm hover:border-neutral-300 hover:shadow-md',
            )}
          >
            <span
              className={cn(
                'mb-2.5 flex size-9 items-center justify-center rounded-lg transition',
                ativo ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600',
              )}
            >
              <Icone className="size-[18px]" />
            </span>
            <span className="font-display text-base font-bold leading-tight text-neutral-900">
              {titulo}
            </span>
            <span className="mt-1 text-xs leading-snug text-neutral-500">{apoio}</span>
            {aPartirDe && (
              <span className="mt-auto pt-2.5 text-[11px] font-medium text-brand-700">
                a partir de {aPartirDe}
              </span>
            )}
            {ativo && (
              <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-brand-600 text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------
// 2. Qual período
// ------------------------------------------------------------

/**
 * Mensal x Semestral, na mesma linguagem do catálogo da equipe
 * (produtos/SeletorCiclo): o Semestral é ameixa, o Mensal é neutro. Aqui
 * cada pastilha ganha uma legenda de três palavras — para quem compra, a
 * diferença precisa estar à vista, não só na cor.
 */
export function SeletorPeriodo({
  valor,
  onChange,
  legendas,
}: {
  valor: Recorrencia
  onChange: (r: Recorrencia) => void
  legendas: Record<Recorrencia, string>
}) {
  const itens: { r: Recorrencia; titulo: string; ativoCls: string; legendaAtiva: string }[] = [
    {
      r: 'mensal',
      titulo: 'Mensal',
      ativoCls: 'bg-white text-ink shadow-sm',
      legendaAtiva: 'text-neutral-500',
    },
    {
      r: 'semestral',
      titulo: 'Semestral',
      ativoCls: 'bg-brand-600 text-white shadow-sm',
      legendaAtiva: 'text-white/80',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">
      {itens.map(({ r, titulo, ativoCls, legendaAtiva }) => {
        const ativo = valor === r
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            aria-pressed={ativo}
            className={cn(
              'rounded-lg px-2 py-2 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-brand-300',
              ativo ? ativoCls : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            <span className="block text-sm font-semibold">{titulo}</span>
            <span
              className={cn('block text-[11px] leading-tight', ativo ? legendaAtiva : 'text-neutral-400')}
            >
              {legendas[r]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------
// 3. O plano
// ------------------------------------------------------------

/**
 * Um plano: quanto entrega (o número grande), quanto custa e uma linha
 * de apoio. Nada de regras nem cobrança aqui — isso aparece na folha de
 * confirmação, antes do botão final. O cartão inteiro é clicável; o
 * "Escolher" é o sinal visual de que é.
 *
 * O título não repete a navegação: dentro de "Por créditos → Semestral"
 * o cartão diz "8 aulas", não "Semestral · 8 créditos".
 */
export function CartaoPlano({
  produto: p,
  semestral,
  economia,
  mostrarNome,
  onEscolher,
}: {
  produto: Produto
  semestral: boolean
  /** Economia no compromisso inteiro, em centavos — só no semestral. */
  economia: number | null
  /** Desempate quando dois produtos da aba têm o mesmo número (ex.: plano antigo). */
  mostrarNome: boolean
  onEscolher: () => void
}) {
  const { numero, unidade } = destaqueDoPlano(p)
  return (
    <button
      type="button"
      onClick={onEscolher}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-3 text-left shadow-sm transition sm:gap-3.5 sm:p-3.5',
        'outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-300',
        semestral
          ? 'border-brand-200 bg-brand-50/60 hover:border-brand-300'
          : 'border-neutral-200 bg-white hover:border-neutral-300',
      )}
    >
      <span
        className={cn(
          'flex size-14 shrink-0 flex-col items-center justify-center rounded-lg',
          semestral ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700',
        )}
      >
        <span className="font-display text-2xl font-bold leading-none">{numero}</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">{unidade}</span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-0.5">
          <span className="font-display text-xl font-bold leading-tight text-neutral-900">
            {fmtPreco(p.preco_centavos)}
          </span>
          <span className="text-xs font-medium text-neutral-500">{sufixoPreco(p)}</span>
        </span>
        <span className="block text-xs leading-snug text-neutral-500">{entregaDoPlano(p)}</span>
        {economia !== null && economia > 0 && (
          <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-success-700">
            Economia de {fmtPreco(economia)} no semestre
          </span>
        )}
        {mostrarNome && (
          <span className="mt-0.5 block truncate text-[11px] text-neutral-400">{p.nome}</span>
        )}
      </span>

      <span className="shrink-0 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
        Escolher
      </span>
    </button>
  )
}

// ------------------------------------------------------------
// 4. Avulsos
// ------------------------------------------------------------

/**
 * Uma linha da vitrine de avulsos. Propositalmente mais leve que o cartão
 * de plano — sem bloco colorido nem botão cheio — para não disputar a
 * atenção com a decisão principal da tela.
 */
export function LinhaAvulso({
  produto: p,
  selos,
  onAbrir,
}: {
  produto: Produto
  selos: string[]
  onAbrir: () => void
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-neutral-900">{p.nome}</span>
          {selos.map((s) => (
            <span
              key={s}
              className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600"
            >
              {s}
            </span>
          ))}
        </span>
        <span className="mt-0.5 block text-xs text-neutral-500">{resumoAvulso(p)}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-neutral-900">
        {p.preco_centavos === 0 ? 'Grátis' : fmtPreco(p.preco_centavos)}
      </span>
      <ChevronRight className="size-4 shrink-0 text-neutral-300" />
    </button>
  )
}
