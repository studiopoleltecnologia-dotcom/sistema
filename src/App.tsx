import { HashRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthGate } from './modules/auth/AuthGate'
import { Layout } from './components/Layout'
import { Placeholder } from './components/Placeholder'
import { ClientesPage } from './modules/clientes/ClientesPage'
import { FinanceiroPage } from './modules/financeiro/FinanceiroPage'
import { FollowupPage } from './modules/followup/FollowupPage'

// HashRouter: evita 404 em SPA no GitHub Pages (sem servidor para rewrite).
const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Placeholder title="Dashboard" fase="Fase 5" />} />
              <Route path="clientes" element={<ClientesPage />} />
              <Route path="financeiro" element={<FinanceiroPage />} />
              <Route path="followup" element={<FollowupPage />} />
              <Route path="agenda" element={<Placeholder title="Agenda & Presença" fase="Fase 4" />} />
              <Route path="professoras" element={<Placeholder title="Professoras" fase="Fase 4" />} />
              <Route path="conteudo" element={<Placeholder title="Conteúdo" fase="Fase 6" />} />
              <Route path="tarefas" element={<Placeholder title="Tarefas" fase="Fase 6" />} />
              <Route path="investimentos" element={<Placeholder title="Investimentos" fase="Fase 6" />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthGate>
    </QueryClientProvider>
  )
}
