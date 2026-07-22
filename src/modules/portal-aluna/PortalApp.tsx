import { HashRouter, Route, Routes } from 'react-router-dom'
import { AgendaPage } from './AgendaPage'
import { DashboardPage } from './DashboardPage'
import { PerfilPage } from './PerfilPage'
import { PlanosPage } from './PlanosPage'
import { PortalAuthGate } from './PortalAuthGate'
import { PortalLayout } from './PortalLayout'
import { ReservasPage } from './ReservasPage'

export function PortalApp() {
  return (
    <PortalAuthGate>
      <HashRouter basename="/portal">
        <Routes>
          <Route element={<PortalLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="agenda" element={<AgendaPage />} />
            <Route path="planos" element={<PlanosPage />} />
            <Route path="reservas" element={<ReservasPage />} />
            <Route path="perfil" element={<PerfilPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </PortalAuthGate>
  )
}
