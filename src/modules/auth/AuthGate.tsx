import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useMinhaFuncao } from '../../lib/funcao'
import { Login } from './Login'

/**
 * Porteiro do app interno: renderiza o sistema só para contas com uma
 * FUNÇÃO (gestao/secretaria/social). Quem se cadastrou sem convite tem
 * login mas nenhuma função → vê a tela de "sem acesso", não o sistema.
 * Sem sessão → tela de login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const qc = useQueryClient()
  const funcao = useMinhaFuncao()

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Troca de conta não pode deixar dados da anterior em cache.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') qc.clear()
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-neutral-200 p-8 text-sm text-neutral-600">
          <h1 className="mb-3 text-base font-semibold text-neutral-900">
            Ambiente não configurado
          </h1>
          <p>
            Copie <code className="rounded bg-neutral-100 px-1">.env.example</code>{' '}
            para <code className="rounded bg-neutral-100 px-1">.env</code> e preencha
            a URL e a anon key do projeto Supabase.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">
        Carregando…
      </div>
    )
  }

  if (!session) return <Login />

  if (funcao.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">
        Carregando…
      </div>
    )
  }

  // Logada mas sem função = cadastrou sem convite (ou é conta de
  // aluno/professora tentando o portal interno). Não vê o sistema.
  if (!funcao.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
        <div className="max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm">
          <p className="mb-4 text-neutral-600">
            Esta conta ainda não tem acesso ao sistema. Peça para a gestão liberar o seu
            e-mail em Equipe &amp; Acessos.
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

  return <>{children}</>
}
