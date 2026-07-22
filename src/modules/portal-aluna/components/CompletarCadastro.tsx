import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../../lib/supabase'
import { useCriarContaAluna } from '../hooks/usePortalAluna'

const inputCls =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

export function CompletarCadastro() {
  const criar = useCriarContaAluna()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [aceite, setAceite] = useState(false)

  // O e-mail já é o do login: preenche sozinho para ela não redigitar,
  // mas segue editável (pode querer outro para contato).
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail((atual) => atual || data.user!.email!)
    })
  }, [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!aceite) return
    criar.mutate({
      nome: nome.trim(),
      telefone: telefone.trim(),
      email: email.trim(),
      dataNascimento: nascimento || null,
      aceiteLgpd: aceite,
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8"
      >
        <h1 className="mb-1 text-lg font-semibold text-neutral-900">Quase lá</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Só mais alguns dados para liberar sua conta.
        </p>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Nome</span>
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={inputCls}
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Telefone</span>
          <input
            required
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(11) 91234-5678"
            className={inputCls}
          />
        </label>

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

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Data de nascimento
          </span>
          <input
            type="date"
            required
            value={nascimento}
            onChange={(e) => setNascimento(e.target.value)}
            className={inputCls}
          />
        </label>

        <label className="mb-6 flex items-start gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-0.5 accent-brand-600"
          />
          Li e aceito os termos de uso e a política de privacidade.
        </label>

        {criar.isError && (
          <p className="mb-4 text-sm text-red-600">Não foi possível criar sua conta. Tente novamente.</p>
        )}

        <button
          type="submit"
          disabled={!aceite || criar.isPending}
          className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {criar.isPending ? 'Criando…' : 'Concluir cadastro'}
        </button>
      </form>
    </div>
  )
}
