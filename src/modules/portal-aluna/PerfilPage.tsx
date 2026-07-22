import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAtualizarMeuCliente, useMeuCliente } from './hooks/usePortalAluna'

const inputCls =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

export function PerfilPage() {
  const { data: cliente } = useMeuCliente()
  const atualizar = useAtualizarMeuCliente()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')

  useEffect(() => {
    if (cliente) {
      setNome(cliente.nome ?? '')
      setTelefone(cliente.telefone ?? '')
    }
  }, [cliente])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!cliente) return
    atualizar.mutate([cliente.id, { nome: nome.trim(), telefone: telefone.trim() }])
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-neutral-900">Meu Perfil</h1>

      <form onSubmit={handleSubmit} className="rounded-lg border border-neutral-200 bg-white p-4">
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Telefone</span>
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className={inputCls}
          />
        </label>

        {atualizar.isSuccess && (
          <p className="mb-3 text-sm text-brand-700">Dados atualizados.</p>
        )}

        <button
          type="submit"
          disabled={atualizar.isPending}
          className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          Salvar alterações
        </button>
      </form>

      <button
        onClick={() => supabase?.auth.signOut()}
        className="mt-4 w-full rounded-md border border-neutral-200 py-2.5 text-sm text-neutral-500 hover:bg-neutral-50"
      >
        Sair
      </button>
    </div>
  )
}
