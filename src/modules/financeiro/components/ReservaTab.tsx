import { useState, type FormEvent } from 'react'
import { PiggyBank, Sparkles } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { useConfigFinanceiro, useCriarReservaMovimento, useReserva } from '../hooks/useFinanceiro'

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
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <PiggyBank className="size-3.5" />
            Reserva acumulada
          </div>
          <div className="font-display text-xl font-bold text-neutral-900">
            {fmtCentavos(saldo)}
          </div>
          <div className="text-[11px] text-neutral-400">
            meta: {config?.meta_reserva_meses ?? 3} meses de despesas fixas
          </div>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="text-xs text-neutral-400">
            Aporte sugerido ({percentual}% do recebido no mês)
          </div>
          <div className="font-display text-xl font-bold text-brand-600">
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
              className="flex w-fit items-center gap-1 text-xs font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              <Sparkles className="size-3" />
              Registrar este aporte
            </button>
          )}
        </Card>
      </div>

      <form onSubmit={registrar} className="mb-4 flex flex-wrap items-end gap-2">
        <Select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as 'aporte' | 'retirada')}
          className="w-36"
        >
          <option value="aporte">Aporte</option>
          <option value="retirada">Retirada</option>
        </Select>
        <Input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="R$ 0,00"
          required
          className="w-24"
        />
        <Input
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Observação (opcional)"
          className="w-52"
        />
        <Button type="submit" loading={criar.isPending}>
          Registrar
        </Button>
      </form>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}
      {!isLoading && (movimentos ?? []).length === 0 ? (
        <div className="lg:w-2/3">
          <EmptyState title="Nenhum movimento na reserva ainda." />
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5 lg:w-2/3">
          {(movimentos ?? []).map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-md border border-neutral-100 bg-white px-3 py-2.5 text-sm"
            >
              <span
                className={`w-24 font-medium ${
                  m.tipo === 'aporte' ? 'text-neutral-900' : 'text-danger-600'
                }`}
              >
                {m.tipo === 'aporte' ? '+' : '−'} {fmtCentavos(m.valor_centavos)}
              </span>
              <span className="flex-1 truncate text-neutral-500">{m.observacao}</span>
              <span className="text-xs text-neutral-400">{fmtData(m.data)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
