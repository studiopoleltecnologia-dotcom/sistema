import { useState } from 'react'
import { cn } from '../../../components/ui/cn'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'

/**
 * Os campos de uma linha de Saídas, editáveis no lugar.
 *
 * Existem porque previsão não é fato: a conta fixa de um mês vem mais cara,
 * o vencimento combinado não é o que foi cadastrado, a descrição saiu
 * genérica. Antes, corrigir qualquer um desses exigia excluir o lançamento
 * e refazê-lo — e excluir é justamente o que não se quer fazer com uma
 * linha que já está conciliada.
 *
 * Clica, muda, sai do campo. `Esc` desiste em todos.
 *
 * A recusa é a mesma nos três: entrada inválida **não grava nada**, volta
 * ao valor anterior. Apagar em silêncio um dado financeiro por erro de
 * digitação é pior do que não deixar editar.
 */

/*
  O campo editável precisa PARECER editável antes do clique.

  Só havia realce no hover do próprio campo — quem não passasse o mouse
  exatamente em cima do número não tinha como saber que ele abre. A queixa
  que chegou foi literalmente "não dá para editar valor e data", numa tela
  em que os dois já eram editáveis.

  Agora o sublinhado tracejado acende quando o mouse entra na LINHA (o
  `group` vem de LINHA_BASE), mostrando de uma vez todos os campos que
  aquela linha aceita mudar. Em repouso a tela continua limpa.
*/
const BOTAO_BASE =
  'shrink-0 rounded px-1 text-left transition border-b border-dashed border-transparent ' +
  'group-hover:border-neutral-300 hover:border-transparent hover:bg-white hover:ring-1 hover:ring-neutral-300'

export function ValorEditavel({
  valor,
  onSalvar,
  className,
  dica,
}: {
  valor: number
  onSalvar: (centavos: number) => void
  /** Cor/peso do número, para a linha continuar falando o status. */
  className?: string
  /** Vira o `title`: onde o valor vai parar, quando não é óbvio. */
  dica?: string
}) {
  const [texto, setTexto] = useState<string | null>(null)

  function confirmar() {
    const t = texto
    setTexto(null)
    if (t == null) return
    const centavos = parseCentavos(t)
    // parseCentavos já devolve null para texto inválido, zero e negativo.
    if (centavos == null || centavos === valor) return
    onSalvar(centavos)
  }

  if (texto == null) {
    return (
      <button
        type="button"
        onClick={() => setTexto((valor / 100).toFixed(2).replace('.', ','))}
        title={dica ?? 'Clique para editar o valor'}
        className={cn(BOTAO_BASE, 'w-24 font-semibold tabular-nums', className)}
      >
        {fmtCentavos(valor)}
      </button>
    )
  }

  return (
    <input
      autoFocus
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setTexto(null)
      }}
      onFocus={(e) => e.currentTarget.select()}
      inputMode="decimal"
      aria-label="Valor"
      className={cn(
        'w-24 shrink-0 rounded border border-brand-500 px-1 py-0.5 text-left font-semibold tabular-nums',
        'outline-none ring-2 ring-brand-100',
        className,
      )}
    />
  )
}

/** A descrição da linha. Vazio é aceito — nem toda saída precisa de texto. */
export function TextoEditavel({
  valor,
  onSalvar,
  className,
  dica,
  placeholder = 'sem descrição',
}: {
  valor: string
  onSalvar: (texto: string) => void
  className?: string
  dica?: string
  placeholder?: string
}) {
  const [texto, setTexto] = useState<string | null>(null)

  function confirmar() {
    const t = texto
    setTexto(null)
    if (t == null) return
    const limpo = t.trim()
    if (limpo === valor.trim()) return
    onSalvar(limpo)
  }

  if (texto == null) {
    return (
      <button
        type="button"
        onClick={() => setTexto(valor === '—' ? '' : valor)}
        title={dica ?? 'Clique para editar a descrição'}
        className={cn(BOTAO_BASE, 'min-w-0 flex-1 truncate', className)}
      >
        {valor || <span className="text-neutral-300">{placeholder}</span>}
      </button>
    )
  }

  return (
    <input
      autoFocus
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setTexto(null)
      }}
      onFocus={(e) => e.currentTarget.select()}
      placeholder={placeholder}
      aria-label="Descrição"
      className={cn(
        'min-w-0 flex-1 rounded border border-brand-500 px-1 py-0.5 outline-none ring-2 ring-brand-100',
        className,
      )}
    />
  )
}

/**
 * Uma data da linha (vencimento ou data de pagamento).
 *
 * Grava na escolha, e não no blur como os outros: o seletor nativo de data
 * rouba e devolve o foco enquanto a pessoa navega pelos meses, então
 * "gravar ao sair do campo" dispararia no meio da escolha.
 */
export function DataEditavel({
  valor,
  onSalvar,
  className,
  dica,
  rotulo,
}: {
  /** ISO 'YYYY-MM-DD'. */
  valor: string
  onSalvar: (iso: string) => void
  className?: string
  dica?: string
  /** Prefixo mostrado antes da data, ex.: "vence". */
  rotulo?: string
}) {
  const [editando, setEditando] = useState(false)

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        title={dica ?? 'Clique para editar a data'}
        className={cn(BOTAO_BASE, 'text-xs text-neutral-400', className)}
      >
        {rotulo ? `${rotulo} ` : ''}
        {valor.split('-').reverse().join('/')}
      </button>
    )
  }

  return (
    <input
      autoFocus
      type="date"
      defaultValue={valor}
      onChange={(e) => {
        const novo = e.target.value
        setEditando(false)
        if (novo && novo !== valor) onSalvar(novo)
      }}
      onBlur={() => setEditando(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setEditando(false)
      }}
      aria-label="Data"
      className={cn(
        'shrink-0 rounded border border-brand-500 px-1 py-0.5 text-xs outline-none ring-2 ring-brand-100',
        className,
      )}
    />
  )
}
