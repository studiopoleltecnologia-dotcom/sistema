import { HashRouter, Route, Routes } from 'react-router-dom'
import { AgendaPage } from './AgendaPage'
import { DashboardPage } from './DashboardPage'
import { PerfilPage } from './PerfilPage'
import { PlanosPage } from './PlanosPage'
import { PortalAuthGate } from './PortalAuthGate'
import { PortalLayout } from './PortalLayout'
import { ReservasPage } from './ReservasPage'

/**
 * O basename do HashRouter depende de COMO a jornada foi aberta.
 *
 * Pelo hash (`#/portal`, o mecanismo antigo) o basename tem que ser
 * `/portal`, senão as rotas não casam. Mas pelo caminho
 * (`/agendamentos`, o mecanismo atual do domínio próprio) **não existe
 * hash nenhum** — o HashRouter enxerga `/`, o basename `/portal` nunca
 * casa, `<Routes>` não monta nada e a tela fica BRANCA.
 *
 * Ficou escondido porque o porteiro (PortalAuthGate) renderiza a tela de
 * login FORA do Router: deslogado tudo parecia certo, e a página só
 * apagava depois de entrar. Vale igual em produção, em
 * sistema.studiopolel.com.br/agendamentos.
 *
 * Decidido uma vez por carregamento, como a própria jornada em App.tsx.
 */
const BASENAME = window.location.hash.startsWith('#/portal') ? '/portal' : ''

export function PortalApp() {
  return (
    <PortalAuthGate>
      <HashRouter basename={BASENAME}>
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
