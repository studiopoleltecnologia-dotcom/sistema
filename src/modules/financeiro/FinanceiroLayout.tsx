import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Settings2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConfigModal } from './components/ConfigModal'
import { NavFinanceiro } from './components/NavFinanceiro'
import { useConfigFinanceiro } from './hooks/useFinanceiro'

export function FinanceiroLayout() {
  const { data: config } = useConfigFinanceiro()
  const [configAberta, setConfigAberta] = useState(false)

  return (
    <div>
      <NavFinanceiro
        acoes={
          <Button variant="ghost" size="sm" onClick={() => setConfigAberta(true)}>
            <Settings2 className="size-4" />
            <span className="hidden sm:inline">Config</span>
          </Button>
        }
      />

      <Outlet />

      {configAberta && config && (
        <ConfigModal config={config} onFechar={() => setConfigAberta(false)} />
      )}
    </div>
  )
}
