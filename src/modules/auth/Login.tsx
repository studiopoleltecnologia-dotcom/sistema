import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

const inputCls =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

/**
 * Entrada da equipe interna. O acesso não é aberto: criar conta só dá
 * acesso a quem a gestão convidou (o e-mail vira função em Equipe &
 * Acessos). Signup com e-mail sem convite gera login sem acesso.
 */
export function Login() {
  const [modo, setModo] = useState<'entrar' | 'cadastro'>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setSubmitting(true)
    setError(null)
    setAviso(null)

    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(
          error.message === 'Email not confirmed'
            ? 'Seu e-mail ainda não foi confirmado. Procure o link na caixa de entrada (ou spam).'
            : 'E-mail ou senha inválidos.',
        )
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(
          error.message === 'User already registered'
            ? 'Este e-mail já tem conta — use "Entrar".'
            : error.message,
        )
      } else if (!data.session) {
        setAviso('Conta criada! Confirme seu e-mail e depois entre.')
        setModo('entrar')
      }
    }

    setSubmitting(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8"
      >
        <h1 className="mb-1 text-lg font-semibold text-neutral-900">Studio Pole L</h1>
        <p className="mb-6 text-sm text-neutral-500">
          {modo === 'entrar' ? 'Acesso da equipe' : 'Criar seu acesso'}
        </p>

        {modo === 'cadastro' && (
          <p className="mb-4 rounded-md bg-neutral-50 p-3 text-xs text-neutral-500">
            Use o mesmo e-mail que a gestão cadastrou para você.
          </p>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">E-mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Senha</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
        </label>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {aviso && <p className="mb-4 text-sm text-brand-700">{aviso}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar acesso'}
        </button>

        <button
          type="button"
          onClick={() => {
            setModo(modo === 'entrar' ? 'cadastro' : 'entrar')
            setError(null)
            setAviso(null)
          }}
          className="mt-4 w-full text-center text-sm text-neutral-500 hover:text-brand-700"
        >
          {modo === 'entrar' ? 'Primeiro acesso? Criar conta' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  )
}
