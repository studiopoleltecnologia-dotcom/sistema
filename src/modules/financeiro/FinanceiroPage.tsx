import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Tabs } from '../../components/ui/Tabs'
import { ConfigModal } from './components/ConfigModal'
import { EntradasTab } from './components/EntradasTab'
import { GraficosFinanceiro } from './components/GraficosFinanceiro'
import { PainelFinanceiro } from './components/PainelFinanceiro'
import { ReservaTab } from './components/ReservaTab'
import { SaidasTab } from './components/SaidasTab'
import { WellhubTab } from './components/WellhubTab'
import {
  useConfigFinanceiro,
  useEntradas,
  useMei,
  useMixReceitaMensal,
  useSaidas,
  useSaidasMensal,
  useSaldoCaixa,
} from './hooks/useFinanceiro'

type Aba = 'entradas' | 'saidas' | 'reserva' | 'wellhub'

const ABAS: { value: Aba; label: string }[] = [
  { value: 'entradas', label: 'Entradas' },
  { value: 'saidas', label: 'Saídas' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'wellhub', label: 'Wellhub' },
]

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
  const { data: mixMensal } = useMixReceitaMensal(6)
  const { data: saidasMensal } = useSaidasMensal(6)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Tabs value={aba} onChange={setAba} items={ABAS} />
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <Button variant="ghost" size="sm" onClick={() => setConfigAberta(true)}>
            <Settings2 className="size-4" />
            Config
          </Button>
        </div>
      </div>

      <PainelFinanceiro
        entradas={entradas ?? []}
        saidas={saidas ?? []}
        mei={mei}
        saldo={saldo}
        mes={mes}
      />

      <GraficosFinanceiro
        entradas={entradas ?? []}
        saidas={saidas ?? []}
        mes={mes}
        mixMensal={mixMensal ?? []}
        saidasMensal={saidasMensal ?? []}
      />

      {aba === 'entradas' && <EntradasTab mes={mes} />}
      {aba === 'saidas' && <SaidasTab mes={mes} />}
      {aba === 'reserva' && <ReservaTab recebidoMes={(entradas ?? []).filter((e) => e.status === 'recebida').reduce((s, e) => s + e.valor_centavos, 0)} />}
      {aba === 'wellhub' && <WellhubTab />}

      {configAberta && config && (
        <ConfigModal config={config} onFechar={() => setConfigAberta(false)} />
      )}
    </div>
  )
}
