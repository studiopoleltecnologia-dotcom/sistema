import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthGate } from './modules/auth/AuthGate'
import { DefinirNovaSenha } from './modules/auth/DefinirNovaSenha'
import { Layout } from './components/Layout'
import { Placeholder } from './components/Placeholder'
import { ClientesPage } from './modules/clientes/ClientesPage'
import { FinanceiroLayout } from './modules/financeiro/FinanceiroLayout'
import { DashboardFinanceiro } from './modules/financeiro/pages/DashboardFinanceiro'
import { EntradasPage } from './modules/financeiro/pages/EntradasPage'
import { SaidasPage } from './modules/financeiro/pages/SaidasPage'
import { RecorrenciasPage } from './modules/financeiro/pages/RecorrenciasPage'
import { ContasPage } from './modules/financeiro/pages/ContasPage'
import { CalendarioPage } from './modules/financeiro/pages/CalendarioPage'
import { FluxoPage } from './modules/financeiro/pages/FluxoPage'
import { FiscalPage } from './modules/financeiro/pages/FiscalPage'
import { DrePage } from './modules/financeiro/pages/DrePage'
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
import { EventoShell } from './modules/eventos/EventoShell'
import { InscricoesEventoPage } from './modules/eventos/InscricoesEventoPage'
import { AnalisesPage } from './modules/analises/AnalisesPage'
import { TarefasPage } from './modules/tarefas/TarefasPage'
import { RotaFuncao } from './components/RotaFuncao'
import { EquipePage } from './modules/equipe/EquipePage'

// HashRouter: evita 404 em SPA no GitHub Pages (sem servidor para rewrite).
const queryClient = new QueryClient()

// Capturado no carregamento do módulo, antes do cliente Supabase limpar o
// fragmento da URL (ele detecta #access_token=...&type=recovery sozinho e
// já reescreve a URL). Link de recuperação de senha não tem #/portal nem
// #/prof — vale para as três jornadas, então é checado antes de decidir
// qual delas renderizar.
const ERA_LINK_RECUPERACAO = window.location.hash.includes('type=recovery')

type Jornada = 'admin' | 'aluna' | 'professora'

// Domínio próprio (sistema.studiopolel.com.br): a jornada é decidida pelo
// caminho da URL — /agendamentos (aluna) e /portalequipe (professora) têm
// cada um seu index.html físico no build (deploy.yml), já que o GitHub
// Pages não tem servidor para rewrite de SPA. Fora deles, cai no admin.
//
// O hash antigo (#/portal, #/prof — era o único mecanismo antes do domínio
// próprio, quando o site vivia em github.io/sistema/) continua reconhecido
// para não quebrar link/favorito salvo de antes.
function jornadaAtual(): Jornada {
  const path = window.location.pathname
  if (path === '/agendamentos' || path.startsWith('/agendamentos/')) return 'aluna'
  if (path === '/portalequipe' || path.startsWith('/portalequipe/')) return 'professora'

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
      {ERA_LINK_RECUPERACAO ? (
        <DefinirNovaSenha />
      ) : jornada === 'aluna' ? (
        <PortalApp />
      ) : jornada === 'professora' ? (
        <ProfessoraApp />
      ) : (
        <AuthGate>
          <HashRouter>
            <Routes>
              {/*
                Fora do <Layout> de propósito: esta página tem casca própria,
                sem o menu lateral. Quem confere as inscrições recebe o link
                direto e não tem o que fazer no resto do ERP.

                Vale o que já valia para a rota não estar no menu: isto é
                enquadramento, não permissão. A conta continua podendo digitar
                /clientes e entrar, porque a RLS daquelas tabelas responde a
                is_operacional() e is_socia(). Restringir de verdade exige um
                papel próprio em funcao_interna — e antes disso migrar as 25
                policies em 19 tabelas que ainda usam is_socia(), senão o papel
                novo herda tudo (a pendência do §5.2 do CLAUDE.md).
              */}
              <Route
                path="eventos/pcnc26"
                element={
                  <EventoShell>
                    <RotaFuncao permitido={['gestao', 'secretaria']}>
                      <InscricoesEventoPage />
                    </RotaFuncao>
                  </EventoShell>
                }
              />
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
                  <Route path="calendario" element={<CalendarioPage />} />
                  <Route path="fluxo" element={<FluxoPage />} />
                  <Route path="fiscal" element={<FiscalPage />} />
                  <Route path="dre" element={<DrePage />} />
                  <Route path="reserva" element={<ReservaPage />} />
                  <Route path="wellhub" element={<WellhubPage />} />
                </Route>
                <Route path="followup" element={<FollowupPage />} />
                <Route path="agenda" element={<AgendaPage />} />
                <Route path="analises" element={<AnalisesPage />} />
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
                <Route path="tarefas" element={<TarefasPage />} />
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
