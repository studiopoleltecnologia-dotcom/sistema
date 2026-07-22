import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { CompletarCadastro } from './components/CompletarCadastro'
import { PortalLogin } from './components/PortalLogin'
import { useContaAluna, useSouEquipe } from './hooks/usePortalAluna'
import { PortalClienteProvider } from './PortalClienteContext'

function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">
      Carregando…
    </div>
  )
}

/**
 * Porteiro do Portal: sessão + vínculo com um cliente (contas_aluna).
 * Conta da equipe (sócia) não tem acesso ao Portal — é outra jornada.
 */
export function PortalAuthGate({ children }: { children: ReactNode }) {
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
      // Papel e vínculo são consultados por react-query e ficam em cache.
      // Sem limpar no login/logout, a resposta de "quem sou eu" feita antes
      // de logar (= ninguém) persiste e a tela de cadastro aparece mesmo com
      // a conta já vinculada. Recarrega tudo sob a nova identidade.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') qc.clear()
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  const equipe = useSouEquipe()
  const conta = useContaAluna()

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
  if (!session) return <PortalLogin />
  if (equipe.isLoading || conta.isLoading) return <Carregando />

  if (equipe.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
        <div className="max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm">
          <p className="mb-4 text-neutral-600">
            Esta conta é da equipe do estúdio — o Portal é só para alunos.
          </p>
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

  if (!conta.data) return <CompletarCadastro />

  return (
    <PortalClienteProvider value={conta.data.cliente_id}>{children}</PortalClienteProvider>
  )
}
