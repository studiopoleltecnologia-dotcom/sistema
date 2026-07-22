import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { ProfessoraLogin } from './components/ProfessoraLogin'
import { useContaProfessora, useMinhaProfessora } from './hooks/usePortalProfessora'
import { ProfessoraProvider } from './ProfessoraContext'

function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">
      Carregando…
    </div>
  )
}

function Recado({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm">
        <div className="mb-4 text-neutral-600">{children}</div>
        <button
          onClick={() => supabase?.auth.signOut()}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Sair
        </button>
      </div>
    </div>
  )
}

/**
 * Porteiro do portal das professoras: sessão + vínculo em contas_professora.
 * Sem vínculo a conta existe mas não enxerga nada (é o comportamento novo do
 * handle_new_user), então a tela explica o que fazer em vez de mostrar um
 * portal vazio.
 */
export function ProfessoraAuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const qc = useQueryClient()

  useEffect(() => {
    if (!supabase) {
      setLoadingSession(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Ver PortalAuthGate: sem limpar o cache no login/logout, o vínculo
      // consultado antes de logar persiste e trava o porteiro.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') qc.clear()
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  const conta = useContaProfessora()
  const professora = useMinhaProfessora()

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-neutral-200 p-8 text-sm text-neutral-600">
          <h1 className="mb-3 text-base font-semibold text-neutral-900">Ambiente não configurado</h1>
          <p>Copie .env.example para .env e preencha a URL e a anon key do Supabase.</p>
        </div>
      </div>
    )
  }

  if (loadingSession) return <Carregando />
  if (!session) return <ProfessoraLogin />
  if (conta.isLoading || professora.isLoading) return <Carregando />

  if (!conta.data) {
    return (
      <Recado>
        Esta conta não está vinculada a nenhuma professora. Peça para a equipe cadastrar o seu
        e-mail no sistema e crie o acesso de novo com ele.
      </Recado>
    )
  }

  if (!professora.data) {
    return <Recado>Não foi possível carregar seu cadastro. Fale com a equipe.</Recado>
  }

  return <ProfessoraProvider value={professora.data}>{children}</ProfessoraProvider>
}
