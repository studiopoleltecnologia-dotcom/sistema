import { useState, type FormEvent } from 'react'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import {
  useConfigFinanceiro,
  useCriarReservaMovimento,
  useReserva,
} from '../hooks/useFinanceiro'

const inputCls =
  'rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500'

export function ReservaTab({ recebidoMes }: { recebidoMes: number }) {
  const { data: movimentos, isLoading } = useReserva()
  const { data: config } = useConfigFinanceiro()
  const criar = useCriarReservaMovimento()

  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState<'aporte' | 'retirada'>('aporte')
  const [observacao, setObservacao] = useState('')

  const saldo = (movimentos ?? []).reduce(
    (s, m) => s + (m.tipo === 'aporte' ? m.valor_centavos : -m.valor_centavos),
    0,
  )
  const percentual = config?.percentual_reserva ?? 12
  const sugestaoMes = Math.round((recebidoMes * percentual) / 100)

  function registrar(e: FormEvent) {
    e.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos) return
    criar.mutate(
      { tipo, valor_centavos: centavos, observacao: observacao.trim() || null },
      {
        onSuccess: () => {
          setValor('')
          setObservacao('')
        },
      },
    )
  }

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:w-2/3">
        <div className="rounded-lg border border-neutral-100 p-4">
          <div className="text-xs text-neutral-400">Reserva acumulada</div>
          <div className="mt-1 text-lg font-semibold text-neutral-900">
            {fmtCentavos(saldo)}
          </div>
          <div className="mt-0.5 text-[11px] text-neutral-400">
            meta: {config?.meta_reserva_meses ?? 3} meses de despesas fixas
          </div>
        </div>
        <div className="rounded-lg border border-neutral-100 p-4">
          <div className="text-xs text-neutral-400">
            Aporte sugerido ({percentual}% do recebido no mês)
          </div>
          <div className="mt-1 text-lg font-semibold text-brand-600">
            {fmtCentavos(sugestaoMes)}
          </div>
          {sugestaoMes > 0 && (
            <button
              onClick={() =>
                criar.mutate({
                  tipo: 'aporte',
                  valor_centavos: sugestaoMes,
                  observacao: `Aporte sugerido (${percentual}%)`,
                })
              }
              disabled={criar.isPending}
              className="mt-1 text-xs font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              Registrar este aporte
            </button>
          )}
        </div>
      </div>

      <form onSubmit={registrar} className="mb-4 flex flex-wrap items-end gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as 'aporte' | 'retirada')}
          className={inputCls}
        >
          <option value="aporte">Aporte</option>
          <option value="retirada">Retirada</option>
        </select>
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="R$ 0,00"
          required
          className={`${inputCls} w-24`}
        />
        <input
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Observação (opcional)"
          className={`${inputCls} w-52`}
        />
        <button
          type="submit"
          disabled={criar.isPending}
          className="rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          Registrar
        </button>
      </form>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}
      <ul className="flex flex-col gap-1.5 lg:w-2/3">
        {(movimentos ?? []).map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
          >
            <span
              className={`w-24 font-medium ${
                m.tipo === 'aporte' ? 'text-neutral-900' : 'text-red-600'
              }`}
            >
              {m.tipo === 'aporte' ? '+' : '−'} {fmtCentavos(m.valor_centavos)}
            </span>
            <span className="flex-1 truncate text-neutral-500">{m.observacao}</span>
            <span className="text-xs text-neutral-400">{fmtData(m.data)}</span>
          </li>
        ))}
        {!isLoading && (movimentos ?? []).length === 0 && (
          <li className="py-2 text-sm text-neutral-300">
            Nenhum movimento na reserva ainda.
          </li>
        )}
      </ul>
    </div>
  )
}
