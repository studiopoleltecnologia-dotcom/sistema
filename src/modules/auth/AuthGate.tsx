import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase, requireSupabase } from '../../lib/supabase'
import { useMinhaFuncao } from '../../lib/funcao'
import { URL_PORTAL_ALUNO, URL_PORTAL_PROFESSORA } from '../../lib/portais'
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
  if (!funcao.data) return <SemFuncaoInterna />

  return <>{children}</>
}

type Dono = 'aluno' | 'professora' | 'ambos' | 'nenhum'

/**
 * Conta logada sem função interna.
 *
 * Isto era um beco sem saída: a tela mandava "peça para a gestão liberar o
 * seu e-mail", inclusive para o ALUNO que só errou o endereço. E errar é
 * fácil — o portal dele é um caminho dentro do mesmo domínio da gestão, e
 * basta apagar o fim da URL para cair aqui. A pessoa conclui que o acesso
 * dela quebrou e liga para o estúdio.
 *
 * Então, antes da mensagem, pergunta ao banco de quem é a conta e leva para
 * o portal certo. Quem não é nem aluno nem professora continua vendo a
 * mensagem — aí ela está certa: é gente sem convite.
 *
 * **Conta dos dois papéis não é adivinhada.** Desde 20260921150000 a
 * professora pode ser aluna com o mesmo login (CLAUDE.md 5.1), e escolher
 * por ela mandaria metade das vezes para o lugar errado — então mostra os
 * dois caminhos.
 *
 * `replace` e não `href`: o endereço errado não fica no histórico, senão o
 * botão "voltar" do navegador traz a pessoa para cá de novo.
 */
function SemFuncaoInterna() {
  const dono = useQuery({
    queryKey: ['dono-da-conta'],
    queryFn: async (): Promise<Dono> => {
      const sb = requireSupabase()
      // Sem `throw`: se a RPC falhar, o desfecho é a mensagem de sempre —
      // pior que redirecionar, melhor que uma tela de erro sem saída.
      const [aluno, professora] = await Promise.all([
        sb.rpc('cliente_atual'),
        sb.rpc('professora_atual'),
      ])
      if (aluno.data && professora.data) return 'ambos'
      if (aluno.data) return 'aluno'
      if (professora.data) return 'professora'
      return 'nenhum'
    },
  })

  useEffect(() => {
    if (dono.data === 'aluno') window.location.replace(URL_PORTAL_ALUNO)
    if (dono.data === 'professora') window.location.replace(URL_PORTAL_PROFESSORA)
  }, [dono.data])

  if (dono.isLoading || dono.data === 'aluno' || dono.data === 'professora') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">
        Levando você para o seu portal…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm">
        {dono.data === 'ambos' ? (
          <>
            <p className="mb-5 text-neutral-600">
              Esta área é a da gestão. Onde você quer entrar?
            </p>
            <div className="flex flex-col gap-2">
              <a
                href={URL_PORTAL_ALUNO}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Agendar aula
              </a>
              <a
                href={URL_PORTAL_PROFESSORA}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-brand-500"
              >
                Minhas aulas (professora)
              </a>
            </div>
          </>
        ) : (
          <p className="mb-4 text-neutral-600">
            Esta conta ainda não tem acesso ao sistema. Peça para a gestão liberar o seu
            e-mail em Equipe &amp; Acessos.
          </p>
        )}
        <button
          onClick={() => supabase?.auth.signOut()}
          className="mt-4 text-xs text-neutral-400 hover:text-brand-700"
        >
          Sair
        </button>
      </div>
    </div>
  )
}
