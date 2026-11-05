import { CalendarOff, CheckCircle2, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'

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
 *
 * ------------------------------------------------------------------
 * Três significados, três cores (revisão de 05/11/2026)
 * ------------------------------------------------------------------
 * A escala tinha QUATRO cores para TRÊS perguntas. Dentro de "A pagar"
 * conviviam âmbar (esta semana) e o roxo da marca (este mês e adiante),
 * e o roxo é a cor de todo o resto do app — ele não lê como status, lê
 * como "normal". Resultado prático relatado: a pessoa não distinguia o
 * que já tinha saído do que ainda vai sair.
 *
 * Agora a cor responde só "o dinheiro saiu?":
 *   teal     = saiu
 *   âmbar    = ainda não (mais forte perto do vencimento, mais claro longe)
 *   vermelho = ainda não, e o prazo passou
 *   cinza    = não vai sair (mês pulado)
 *
 * E a cor deixou de ser o ÚNICO sinal: cada linha ganhou ícone e fundo.
 * Faixa de 4px é pouco para quem não decora paleta — e some para quem não
 * distingue as duas cores.
 */
export type StatusFin = 'pago' | 'aberto' | 'atrasado' | 'futuro' | 'cancelado'

type Tokens = {
  /** Faixa colorida na borda esquerda da linha — o sinal de "bater o olho". */
  barra: string
  /**
   * Fundo e borda da linha inteira. É o que separa pago de a pagar a um
   * metro de distância, sem precisar ler o título da seção.
   */
  fundo: string
  /** Chip de cabeçalho de agrupamento. */
  chip: string
  /** Variante do Badge para o rótulo textual. */
  badge: 'success' | 'warning' | 'danger' | 'brand' | 'neutral'
  /** Cor do valor em dinheiro, quando vale destacar. */
  valor: string
  /** Ícone no começo da linha — o status sem depender de enxergar cor. */
  icone: LucideIcon
  /** Como o status se chama, para `title`/leitor de tela. */
  rotulo: string
  /** Cor do ícone. */
  tinta: string
}

export const STATUS_FIN: Record<StatusFin, Tokens> = {
  pago: {
    barra: 'border-l-success-500',
    fundo: 'border-success-100 bg-success-50/60',
    chip: 'bg-success-50 text-success-700',
    badge: 'success',
    valor: 'text-success-700',
    icone: CheckCircle2,
    rotulo: 'pago',
    tinta: 'text-success-600',
  },
  aberto: {
    barra: 'border-l-warning-500',
    fundo: 'border-neutral-200/80 bg-white',
    chip: 'bg-warning-50 text-warning-700',
    badge: 'warning',
    valor: 'text-neutral-900',
    icone: Clock,
    rotulo: 'a pagar',
    tinta: 'text-warning-500',
  },
  atrasado: {
    barra: 'border-l-danger-500',
    fundo: 'border-danger-100 bg-danger-50/50',
    chip: 'bg-danger-50 text-danger-700',
    badge: 'danger',
    valor: 'text-danger-700',
    icone: TriangleAlert,
    rotulo: 'em atraso',
    tinta: 'text-danger-500',
  },
  futuro: {
    /*
      Mesmo âmbar do `aberto`, só que mais claro: é a mesma pergunta ("ainda
      não saiu"), a um prazo maior. Era `brand-400` — roxo da marca —, que
      disputava com o teal do pago em vez de se opor a ele.
    */
    barra: 'border-l-warning-300',
    fundo: 'border-neutral-200/80 bg-white',
    chip: 'bg-neutral-100 text-neutral-600',
    badge: 'neutral',
    valor: 'text-neutral-900',
    icone: Clock,
    rotulo: 'a pagar',
    tinta: 'text-warning-300',
  },
  cancelado: {
    barra: 'border-l-neutral-300',
    fundo: 'border-neutral-200/80 bg-neutral-50',
    chip: 'bg-neutral-100 text-neutral-600',
    badge: 'neutral',
    valor: 'text-neutral-400 line-through',
    icone: CalendarOff,
    rotulo: 'pulado',
    tinta: 'text-neutral-300',
  },
}

/**
 * Classe base de linha: a faixa só aparece porque a borda é grossa à
 * esquerda. `group` existe para os campos editáveis se anunciarem quando o
 * mouse entra na linha — ver CamposEditaveis.
 */
export const LINHA_BASE =
  'group flex items-center gap-3 rounded-lg border border-l-4 px-3.5 py-2.5 text-sm'

/** Bucket de vencimento (vw_contas_a_pagar) → status visual. */
export function statusDoBucket(bucket: string): StatusFin {
  if (bucket === 'atrasada') return 'atrasado'
  if (bucket === 'hoje' || bucket === 'semana') return 'aberto'
  return 'futuro'
}
