import { useState } from 'react'
import { BarChart3, LayoutDashboard, Settings2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Tabs } from '../../components/ui/Tabs'
import { cn } from '../../components/ui/cn'
import { ConfigModal } from './components/ConfigModal'
import { EntradasTab } from './components/EntradasTab'
import { GraficosFinanceiro } from './components/GraficosFinanceiro'
import { PainelFinanceiro } from './components/PainelFinanceiro'
import { ReservaTab } from './components/ReservaTab'
import { SaidasTab } from './components/SaidasTab'
import { SeletorPeriodo } from './components/SeletorPeriodo'
import { WellhubTab } from './components/WellhubTab'
import { deslocarMes, mesAtual, periodoMes, qtdMeses, type Periodo } from './periodo'
import {
  useConfigFinanceiro,
  useEntradas,
  useMei,
  useMixReceitaPeriodo,
  useSaidas,
  useSaidasPeriodo,
  useSaldoCaixa,
} from './hooks/useFinanceiro'

type Vista = 'painel' | 'graficos'
type Aba = 'entradas' | 'saidas' | 'reserva' | 'wellhub'

const ABAS: { value: Aba; label: string }[] = [
  { value: 'entradas', label: 'Entradas' },
  { value: 'saidas', label: 'Saídas' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'wellhub', label: 'Wellhub' },
]

const VISTAS: { value: Vista; label: string; icon: typeof LayoutDashboard }[] = [
  { value: 'painel', label: 'Painel', icon: LayoutDashboard },
  { value: 'graficos', label: 'Gráficos', icon: BarChart3 },
]

/** Navegação principal do módulo: separa a operação (números + listas) da
 * análise visual (gráficos). Fica visualmente acima das sub-abas de lista. */
function TrocaVista({ vista, onChange }: { vista: Vista; onChange: (v: Vista) => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1">
      {VISTAS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition',
            vista === value
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-neutral-500 hover:text-neutral-800',
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

export function FinanceiroPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(mesAtual()))
  const [vista, setVista] = useState<Vista>('painel')
  const [aba, setAba] = useState<Aba>('entradas')
  const [configAberta, setConfigAberta] = useState(false)

  // O gráfico de evolução precisa de vários meses; num período de mês
  // único mostramos os 6 meses até ele para a linha ter sentido.
  const janela: Periodo =
    qtdMeses(periodo) >= 2
      ? periodo
      : { inicio: deslocarMes(periodo.fim, -5), fim: periodo.fim }

  const { data: entradas } = useEntradas(periodo)
  const { data: saidas } = useSaidas(periodo)
  const { data: mei } = useMei()
  const { data: saldo } = useSaldoCaixa()
  const { data: config } = useConfigFinanceiro()
  const { data: mixMensal } = useMixReceitaPeriodo(janela)
  const { data: saidasMensal } = useSaidasPeriodo(janela)

  const recebidoPeriodo = (entradas ?? [])
    .filter((e) => e.status === 'recebida')
    .reduce((s, e) => s + e.valor_centavos, 0)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <TrocaVista vista={vista} onChange={setVista} />
        <div className="flex flex-wrap items-center gap-2">
          <SeletorPeriodo periodo={periodo} onChange={setPeriodo} />
          <Button variant="ghost" size="sm" onClick={() => setConfigAberta(true)}>
            <Settings2 className="size-4" />
            Config
          </Button>
        </div>
      </div>

      {vista === 'painel' ? (
        <>
          <PainelFinanceiro
            entradas={entradas ?? []}
            saidas={saidas ?? []}
            mei={mei}
            saldo={saldo}
            periodo={periodo}
          />

          <div className="mb-4">
            <Tabs value={aba} onChange={setAba} items={ABAS} />
          </div>

          {aba === 'entradas' && <EntradasTab periodo={periodo} />}
          {aba === 'saidas' && <SaidasTab periodo={periodo} />}
          {aba === 'reserva' && (
            <ReservaTab recebidoMes={Math.round(recebidoPeriodo / qtdMeses(periodo))} />
          )}
          {aba === 'wellhub' && <WellhubTab />}
        </>
      ) : (
        <GraficosFinanceiro
          entradas={entradas ?? []}
          saidas={saidas ?? []}
          periodo={periodo}
          mixMensal={mixMensal ?? []}
          saidasMensal={saidasMensal ?? []}
        />
      )}

      {configAberta && config && (
        <ConfigModal config={config} onFechar={() => setConfigAberta(false)} />
      )}
    </div>
  )
}
