import { useState, type FormEvent } from 'react'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { useAtualizarConfig } from '../hooks/useFinanceiro'
import type { ConfigFinanceiro } from '../types'

const inputCls =
  'w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500'
const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

export function ConfigModal({
  config,
  onFechar,
}: {
  config: ConfigFinanceiro
  onFechar: () => void
}) {
  const atualizar = useAtualizarConfig()
  const [limite, setLimite] = useState(String(config.limite_mei_centavos / 100))
  const [percentual, setPercentual] = useState(String(config.percentual_reserva))
  const [metaMeses, setMetaMeses] = useState(String(config.meta_reserva_meses))
  const [saldoInicial, setSaldoInicial] = useState(String(config.saldo_inicial_centavos / 100))
  const [saldoData, setSaldoData] = useState(config.saldo_inicial_data)

  function salvar(e: FormEvent) {
    e.preventDefault()
    const limiteCentavos = parseCentavos(limite)
    const saldoCentavos = saldoInicial.trim() === '0' ? 0 : parseCentavos(saldoInicial)
    const pct = Number(percentual.replace(',', '.'))
    const meses = Number(metaMeses)
    if (!limiteCentavos || saldoCentavos === null || !Number.isFinite(pct) || !meses) return
    atualizar.mutate(
      {
        limite_mei_centavos: limiteCentavos,
        percentual_reserva: pct,
        meta_reserva_meses: meses,
        saldo_inicial_centavos: saldoCentavos,
        saldo_inicial_data: saldoData,
      },
      { onSuccess: onFechar },
    )
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/20 p-4"
      onClick={onFechar}
    >
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg"
      >
        <h2 className="mb-4 text-base font-semibold text-neutral-900">
          Configurações financeiras
        </h2>

        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>
              Limite anual MEI (hoje {fmtCentavos(config.limite_mei_centavos)})
            </label>
            <input value={limite} onChange={(e) => setLimite(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>% de reserva sobre a receita</label>
            <input
              value={percentual}
              onChange={(e) => setPercentual(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Meta da reserva (meses de despesa fixa)</label>
            <input
              value={metaMeses}
              onChange={(e) => setMetaMeses(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Saldo inicial de caixa (R$)</label>
              <input
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Na data</label>
              <input
                type="date"
                value={saldoData}
                onChange={(e) => setSaldoData(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={atualizar.isPending}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {atualizar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
