/**
 * Vocabulário visual de status do Financeiro.
 *
 * A tela era legível mas monocromática: pago, pendente e vencido tinham o
 * mesmo peso, então só dava para distinguir lendo. Aqui a cor carrega o
 * status — verde saiu, âmbar vai sair, vermelho atrasou, cinza é futuro.
 *
 * Centralizado num arquivo só porque a mesma escala precisa valer em
 * Entradas, Saídas e Dívidas: se cada tela escolher seu vermelho, a cor
 * deixa de significar coisa alguma. As classes são literais de propósito
 * (o JIT do Tailwind não enxerga string montada em runtime).
 */
export type StatusFin = 'pago' | 'aberto' | 'atrasado' | 'futuro' | 'cancelado'

type Tokens = {
  /** Faixa colorida na borda esquerda da linha — o sinal de "bater o olho". */
  barra: string
  /** Chip de cabeçalho de agrupamento. */
  chip: string
  /** Variante do Badge para o rótulo textual. */
  badge: 'success' | 'warning' | 'danger' | 'brand' | 'neutral'
  /** Cor do valor em dinheiro, quando vale destacar. */
  valor: string
}

export const STATUS_FIN: Record<StatusFin, Tokens> = {
  pago: {
    barra: 'border-l-success-500',
    chip: 'bg-success-50 text-success-700',
    badge: 'success',
    valor: 'text-success-700',
  },
  aberto: {
    barra: 'border-l-warning-500',
    chip: 'bg-warning-50 text-warning-700',
    badge: 'warning',
    valor: 'text-neutral-900',
  },
  atrasado: {
    barra: 'border-l-danger-500',
    chip: 'bg-danger-50 text-danger-700',
    badge: 'danger',
    valor: 'text-danger-700',
  },
  futuro: {
    barra: 'border-l-brand-400',
    chip: 'bg-brand-50 text-brand-700',
    badge: 'brand',
    valor: 'text-neutral-900',
  },
  cancelado: {
    barra: 'border-l-neutral-300',
    chip: 'bg-neutral-100 text-neutral-600',
    badge: 'neutral',
    valor: 'text-neutral-400 line-through',
  },
}

/** Classe base de linha: a faixa só aparece porque a borda é grossa à esquerda. */
export const LINHA_BASE =
  'flex items-center gap-3 rounded-lg border border-l-4 border-neutral-200/80 bg-white px-3.5 py-2.5 text-sm'

/** Bucket de vencimento (vw_contas_a_pagar) → status visual. */
export function statusDoBucket(bucket: string): StatusFin {
  if (bucket === 'atrasada') return 'atrasado'
  if (bucket === 'hoje' || bucket === 'semana') return 'aberto'
  return 'futuro'
}
