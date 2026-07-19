import { useState } from 'react'
import { ConfigModal } from './components/ConfigModal'
import { EntradasTab } from './components/EntradasTab'
import { ResumoCards } from './components/ResumoCards'
import { ReservaTab } from './components/ReservaTab'
import { SaidasTab } from './components/SaidasTab'
import { WellhubTab } from './components/WellhubTab'
import {
  useConfigFinanceiro,
  useEntradas,
  useMei,
  useSaidas,
  useSaldoCaixa,
} from './hooks/useFinanceiro'

type Aba = 'entradas' | 'saidas' | 'reserva' | 'wellhub'

export function FinanceiroPage() {
  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const [mes, setMes] = useState(mesAtual)
  const [aba, setAba] = useState<Aba>('entradas')
  const [configAberta, setConfigAberta] = useState(false)

  const { data: entradas } = useEntradas(mes)
  const { data: saidas } = useSaidas(mes)
  const { data: mei } = useMei()
  const { data: saldo } = useSaldoCaixa()
  const { data: config } = useConfigFinanceiro()

  const recebidoMes = (entradas ?? [])
    .filter((e) => e.status === 'recebida')
    .reduce((s, e) => s + e.valor_centavos, 0)
  const saidasMes = (saidas ?? []).reduce((s, x) => s + x.valor_centavos, 0)

  const abaCls = (ativa: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition ${
      ativa ? 'bg-brand-50 text-brand-700' : 'text-neutral-400 hover:text-neutral-700'
    }`

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-neutral-900">Financeiro</h1>
          <div className="flex gap-1">
            <button className={abaCls(aba === 'entradas')} onClick={() => setAba('entradas')}>
              Entradas
            </button>
            <button className={abaCls(aba === 'saidas')} onClick={() => setAba('saidas')}>
              Saídas
            </button>
            <button className={abaCls(aba === 'reserva')} onClick={() => setAba('reserva')}>
              Reserva
            </button>
            <button className={abaCls(aba === 'wellhub')} onClick={() => setAba('wellhub')}>
              Wellhub
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
          />
          <button
            onClick={() => setConfigAberta(true)}
            className="rounded-md px-2.5 py-1.5 text-sm text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
            title="Configurações financeiras"
          >
            Config
          </button>
        </div>
      </div>

      <ResumoCards
        recebidoMes={recebidoMes}
        saidasMes={saidasMes}
        mei={mei}
        saldoAtual={saldo?.saldo_atual_centavos}
        previstoAberto={saldo?.previsto_em_aberto_centavos}
      />

      {aba === 'entradas' && <EntradasTab mes={mes} />}
      {aba === 'saidas' && <SaidasTab mes={mes} />}
      {aba === 'reserva' && <ReservaTab recebidoMes={recebidoMes} />}
      {aba === 'wellhub' && <WellhubTab />}

      {configAberta && config && (
        <ConfigModal config={config} onFechar={() => setConfigAberta(false)} />
      )}
    </div>
  )
}
