import { useState } from 'react'
import { cn } from '../../../components/ui/cn'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'

/**
 * O valor de uma linha de Saídas, editável no lugar.
 *
 * Existe porque previsão não é fato: a conta fixa de um mês vem mais cara,
 * a variável fecha diferente do que se esperava, a parcela é renegociada.
 * Antes, corrigir qualquer um desses valores exigia excluir o lançamento e
 * refazê-lo — e excluir é justamente o que não se quer fazer com uma linha
 * que já está conciliada.
 *
 * Clica, digita, sai do campo. Grava no blur e no Enter; `Esc` desiste.
 *
 * Duas recusas deliberadas, iguais às da folha: valor que não é número
 * **não** grava nada (volta ao anterior), e zero ou negativo é recusado —
 * `parseCentavos` já devolve null nesses casos. Apagar silenciosamente um
 * valor financeiro por erro de digitação é pior do que não deixar editar.
 */
export function ValorEditavel({
  valor,
  onSalvar,
  className,
  dica,
  salvando = false,
}: {
  valor: number
  onSalvar: (centavos: number) => void
  /** Cor/peso do número, para a linha continuar falando o status. */
  className?: string
  /** Vira o `title`: onde o valor vai parar, quando não é óbvio. */
  dica?: string
  salvando?: boolean
}) {
  const [texto, setTexto] = useState<string | null>(null)

  function confirmar() {
    const t = texto
    setTexto(null)
    if (t == null) return
    const centavos = parseCentavos(t)
    if (centavos == null || centavos === valor) return // invalido ou igual: nada a fazer
    onSalvar(centavos)
  }

  if (texto == null) {
    return (
      <button
        type="button"
        onClick={() => setTexto((valor / 100).toFixed(2).replace('.', ','))}
        title={dica ?? 'Clique para editar o valor'}
        className={cn(
          'w-24 shrink-0 rounded px-1 text-left font-semibold tabular-nums transition',
          'hover:bg-white hover:ring-1 hover:ring-neutral-300',
          salvando && 'opacity-50',
          className,
        )}
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
