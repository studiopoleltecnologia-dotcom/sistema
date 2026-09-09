import { Infinity as InfinityIcon, Lock } from 'lucide-react'
import type { Recorrencia } from '../types'

/**
 * Mensal x Semestral.
 *
 * Não usa o `Tabs` compartilhado de propósito: lá a pastilha ativa tem
 * uma cor só, e aqui a cor É a informação. O Semestral se identifica com
 * a ameixa da marca em toda a tela — pastilha, faixa e cartões — para
 * que dê para saber em que aba se está pelo canto do olho, sem reler o
 * rótulo. O Mensal fica neutro porque é o padrão, o "sem compromisso".
 *
 * A faixa abaixo carrega os benefícios do ciclo uma vez, em vez de
 * repeti-los como selo em cada cartão: eles são iguais para todos os
 * produtos daquela aba (regulamento 2.4), então no cartão seriam quatro
 * selos idênticos por linha.
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
    <div className="mb-5 flex flex-col gap-2">
      <div className="inline-flex self-start gap-1 rounded-lg bg-neutral-100 p-1">
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

      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border-l-4 px-3.5 py-2 text-xs ${
          semestral
            ? 'border-l-brand-500 bg-brand-50 text-brand-800'
            : 'border-l-neutral-300 bg-neutral-50 text-neutral-600'
        }`}
      >
        {semestral ? (
          <>
            <span className="flex items-center gap-1.5 font-semibold">
              <Lock className="size-3.5" />
              6 ciclos de compromisso
            </span>
            <span className="text-brand-700/80">
              Valor congelado · crédito acumula · 1 convidado por ciclo · 10% em aulões
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5 font-semibold text-neutral-700">
              <InfinityIcon className="size-3.5" />
              Sem compromisso
            </span>
            <span>Cancela quando quiser · crédito que sobra expira no fim do ciclo</span>
          </>
        )}
      </div>
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
