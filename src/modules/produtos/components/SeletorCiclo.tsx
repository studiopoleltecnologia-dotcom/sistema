import type { Recorrencia } from '../types'

/**
 * Mensal x Semestral.
 *
 * Não usa o `Tabs` compartilhado de propósito: lá a pastilha ativa tem
 * uma cor só, e aqui a cor É a informação. O Semestral se identifica com
 * a ameixa da marca em toda a tela — pastilha e cartões — para que dê
 * para saber em que aba se está pelo canto do olho, sem reler o rótulo.
 * O Mensal fica neutro porque é o padrão, o "sem compromisso".
 *
 * Sem legenda embaixo: o que o Semestral tem de diferente (compromisso,
 * valor congelado, acúmulo, convidado, desconto em aulões) é atributo de
 * cada produto e já está no painel de detalhes. Repetir aqui era um
 * parágrafo fixo que ninguém releria depois da primeira vez.
 */
export function SeletorCiclo({
  valor,
  onChange,
}: {
  valor: Recorrencia
  onChange: (v: Recorrencia) => void
}) {
  const semestral = valor === 'semestral'

  return (
    <div className="mb-5 inline-flex gap-1 rounded-lg bg-neutral-100 p-1">
      <Pastilha
        ativo={!semestral}
        onClick={() => onChange('mensal')}
        className="bg-white text-ink shadow-sm"
      >
        Mensal
      </Pastilha>
      <Pastilha
        ativo={semestral}
        onClick={() => onChange('semestral')}
        className="bg-brand-600 text-white shadow-sm"
      >
        Semestral
      </Pastilha>
    </div>
  )
}

function Pastilha({
  ativo,
  onClick,
  className,
  children,
}: {
  ativo: boolean
  onClick: () => void
  /** Como a pastilha fica quando é a ativa — é aqui que a cor difere. */
  className: string
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-md px-5 py-1.5 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-300 ${
        ativo ? className : 'text-neutral-500 hover:text-neutral-900'
      }`}
    >
      {children}
    </button>
  )
}
