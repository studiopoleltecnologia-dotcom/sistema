import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { Login } from './Login'

/**
 * Porteiro do app: só renderiza o sistema para sócias autenticadas.
 * Sem configuração de ambiente → instrui como configurar.
 * Sem sessão → tela de login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

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

  return <>{children}</>
}
