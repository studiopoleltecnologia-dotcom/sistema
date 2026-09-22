import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AgendaPage } from './AgendaPage'
import { AulasPage } from './AulasPage'
import { DashboardPage } from './DashboardPage'
import { MeuPlanoPage } from './MeuPlanoPage'
import { PerfilPage } from './PerfilPage'
import { PlanosPage } from './PlanosPage'
import { PortalAuthGate } from './PortalAuthGate'
import { PortalLayout } from './PortalLayout'

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
            <Route path="aulas" element={<AulasPage />} />
            <Route path="meu-plano" element={<MeuPlanoPage />} />
            <Route path="planos" element={<PlanosPage />} />
            <Route path="perfil" element={<PerfilPage />} />
            {/* "Reservas" virou "Aulas agendadas" (21/09/2026). O endereço
                antigo continua funcionando para quem salvou o link. */}
            <Route path="reservas" element={<Navigate to="../aulas" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </PortalAuthGate>
  )
}
