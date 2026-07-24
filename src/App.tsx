import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthGate } from './modules/auth/AuthGate'
import { Layout } from './components/Layout'
import { Placeholder } from './components/Placeholder'
import { ClientesPage } from './modules/clientes/ClientesPage'
import { FinanceiroLayout } from './modules/financeiro/FinanceiroLayout'
import { DashboardFinanceiro } from './modules/financeiro/pages/DashboardFinanceiro'
import { EntradasPage } from './modules/financeiro/pages/EntradasPage'
import { SaidasPage } from './modules/financeiro/pages/SaidasPage'
import { RecorrenciasPage } from './modules/financeiro/pages/RecorrenciasPage'
import { ContasPage } from './modules/financeiro/pages/ContasPage'
import { FluxoPage } from './modules/financeiro/pages/FluxoPage'
import { FiscalPage } from './modules/financeiro/pages/FiscalPage'
import { ReservaPage } from './modules/financeiro/pages/ReservaPage'
import { WellhubPage } from './modules/financeiro/pages/WellhubPage'
import { FollowupPage } from './modules/followup/FollowupPage'
import { AgendaPage } from './modules/agenda/AgendaPage'
import { ProfessorasPage } from './modules/professoras/ProfessorasPage'
import { FechamentoPage } from './modules/fechamento/FechamentoPage'
import { PlanosPage } from './modules/planos/PlanosPage'
import { PortalApp } from './modules/portal-aluna/PortalApp'
import { ProfessoraApp } from './modules/portal-professora/ProfessoraApp'
import { DashboardPage } from './modules/dashboard/DashboardPage'
import { RotaFuncao } from './components/RotaFuncao'
import { EquipePage } from './modules/equipe/EquipePage'

// HashRouter: evita 404 em SPA no GitHub Pages (sem servidor para rewrite).
const queryClient = new QueryClient()

type Jornada = 'admin' | 'aluna' | 'professora'

// #/prof (e não #/professoras) porque o admin já usa /professoras para o
// módulo de gestão. Pelo mesmo motivo o teste é por segmento exato: um
// startsWith('#/prof') sequestraria justamente a rota #/professoras do admin.
function jornadaAtual(): Jornada {
  const hash = window.location.hash
  if (hash === '#/portal' || hash.startsWith('#/portal/')) return 'aluna'
  if (hash === '#/prof' || hash.startsWith('#/prof/')) return 'professora'
  return 'admin'
}

export default function App() {
  // As três jornadas são apps separados (routers e porteiros próprios) —
  // decidido uma vez por carregamento de página, como já era com o Portal
  // da Aluna (docs/04-PORTAL-ALUNA.md seção 1.2).
  const [jornada] = useState(jornadaAtual)

  useEffect(() => {
    function onHashChange() {
      if (jornadaAtual() !== jornada) window.location.reload()
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [jornada])

  return (
    <QueryClientProvider client={queryClient}>
      {jornada === 'aluna' ? (
        <PortalApp />
      ) : jornada === 'professora' ? (
        <ProfessoraApp />
      ) : (
        <AuthGate>
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<DashboardPage />} />
                <Route path="clientes" element={<ClientesPage />} />
                <Route
                  path="financeiro"
                  element={
                    <RotaFuncao permitido={['gestao']}>
                      <FinanceiroLayout />
                    </RotaFuncao>
                  }
                >
                  <Route index element={<DashboardFinanceiro />} />
                  <Route path="entradas" element={<EntradasPage />} />
                  <Route path="saidas" element={<SaidasPage />} />
                  <Route path="recorrencias" element={<RecorrenciasPage />} />
                  <Route path="contas" element={<ContasPage />} />
                  <Route path="fluxo" element={<FluxoPage />} />
                  <Route path="fiscal" element={<FiscalPage />} />
                  <Route path="reserva" element={<ReservaPage />} />
                  <Route path="wellhub" element={<WellhubPage />} />
                </Route>
                <Route path="followup" element={<FollowupPage />} />
                <Route path="agenda" element={<AgendaPage />} />
                <Route
                  path="professoras"
                  element={
                    <RotaFuncao permitido={['gestao']}>
                      <ProfessorasPage />
                    </RotaFuncao>
                  }
                />
                <Route
                  path="fechamento"
                  element={
                    <RotaFuncao permitido={['gestao']}>
                      <FechamentoPage />
                    </RotaFuncao>
                  }
                />
                <Route path="planos" element={<PlanosPage />} />
                <Route
                  path="equipe"
                  element={
                    <RotaFuncao permitido={['gestao']}>
                      <EquipePage />
                    </RotaFuncao>
                  }
                />
                <Route path="conteudo" element={<Placeholder title="Conteúdo" fase="Fase 6" />} />
                <Route path="tarefas" element={<Placeholder title="Tarefas" fase="Fase 6" />} />
                <Route
                  path="investimentos"
                  element={
                    <RotaFuncao permitido={['gestao']}>
                      <Placeholder title="Investimentos" fase="Fase 6" />
                    </RotaFuncao>
                  }
                />
              </Route>
            </Routes>
          </HashRouter>
        </AuthGate>
      )}
    </QueryClientProvider>
  )
}
