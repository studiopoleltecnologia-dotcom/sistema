import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

const inputCls =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

/**
 * Link de recuperação de senha chega com o token no fragmento da URL
 * (#access_token=...&type=recovery). O cliente Supabase detecta isso
 * sozinho e cria uma sessão — sem esta tela, o AuthGate trataria essa
 * sessão como login normal e a pessoa cairia direto no sistema sem
 * nunca definir a senha nova. Por isso App.tsx intercepta antes de
 * decidir a jornada (equipe/aluna/professora): aqui a sessão de
 * recuperação só serve para uma coisa — trocar a senha — e depois é
 * encerrada, para a pessoa entrar de novo pelo link do portal certo.
 */
export function DefinirNovaSenha() {
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError(null)

    if (senha !== confirmar) {
      setError('As senhas não coincidem.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setError(
        error.message === 'Auth session missing!'
          ? 'Este link de recuperação expirou ou já foi usado. Peça um novo.'
          : error.message,
      )
      setSubmitting(false)
      return
    }

    await supabase.auth.signOut()
    setOk(true)
    setSubmitting(false)
  }

  function voltarParaLogin() {
    window.location.hash = ''
    window.location.reload()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-8">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8">
        <h1 className="mb-1 text-lg font-semibold text-neutral-900">Studio Pole L</h1>
        <p className="mb-6 text-sm text-neutral-500">Definir nova senha</p>

        {ok ? (
          <>
            <p className="mb-6 text-sm text-brand-700">
              Senha atualizada! Entre novamente com a senha nova pelo link do seu portal.
            </p>
            <button
              onClick={voltarParaLogin}
              className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Ir para o login
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Nova senha</span>
              <input
                type="password"
                required
                minLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className={inputCls}
              />
            </label>

            <label className="mb-6 block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                Confirmar senha
              </span>
              <input
                type="password"
                required
                minLength={6}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className={inputCls}
              />
            </label>

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'Aguarde…' : 'Salvar senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
