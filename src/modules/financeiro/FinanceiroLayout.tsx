import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  LayoutDashboard,
  Landmark,
  PiggyBank,
  Repeat,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { ConfigModal } from './components/ConfigModal'
import { useConfigFinanceiro } from './hooks/useFinanceiro'

type Item = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }

// Sub-navegação do módulo. Telas menores em vez de uma página gigante:
// cada aba é uma rota própria (docs do pedido: "prefiro navegar por telas
// menores"). A trava de acesso (gestão) fica no App/RLS, não aqui.
const ITENS: Item[] = [
  { to: '.', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: 'entradas', label: 'Entradas', icon: ArrowDownToLine },
  { to: 'saidas', label: 'Saídas', icon: ArrowUpFromLine },
  { to: 'recorrencias', label: 'Recorrências', icon: Repeat },
  { to: 'contas', label: 'Contas', icon: CalendarClock },
  { to: 'fluxo', label: 'Fluxo de caixa', icon: Activity },
  { to: 'fiscal', label: 'Fiscal', icon: Landmark },
  { to: 'reserva', label: 'Reserva', icon: PiggyBank },
  { to: 'wellhub', label: 'Wellhub', icon: Sparkles },
]

export function FinanceiroLayout() {
  const { data: config } = useConfigFinanceiro()
  const [configAberta, setConfigAberta] = useState(false)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-xl border border-neutral-200/80 bg-white p-1 shadow-sm">
          {ITENS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800',
                )
              }
            >
              <Icon className="size-4" strokeWidth={2} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
        <Button variant="ghost" size="sm" onClick={() => setConfigAberta(true)}>
          <Settings2 className="size-4" />
          Config
        </Button>
      </div>

      <Outlet />

      {configAberta && config && (
        <ConfigModal config={config} onFechar={() => setConfigAberta(false)} />
      )}
    </div>
  )
}
