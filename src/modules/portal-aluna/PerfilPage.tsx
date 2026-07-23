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
  const [emergNome, setEmergNome] = useState('')
  const [emergTelefone, setEmergTelefone] = useState('')

  useEffect(() => {
    if (cliente) {
      setNome(cliente.nome ?? '')
      setTelefone(cliente.telefone ?? '')
      setEmergNome(cliente.contato_emergencia_nome ?? '')
      setEmergTelefone(cliente.contato_emergencia_telefone ?? '')
    }
  }, [cliente])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!cliente) return
    atualizar.mutate([
      cliente.id,
      {
        nome: nome.trim(),
        telefone: telefone.trim(),
        contato_emergencia_nome: emergNome.trim() || null,
        contato_emergencia_telefone: emergTelefone.trim() || null,
      },
    ])
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

        <div className="mb-4 mt-1 border-t border-neutral-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Contato de emergência
          </p>
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Nome</span>
            <input
              value={emergNome}
              onChange={(e) => setEmergNome(e.target.value)}
              placeholder="Quem acionar se precisar"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Telefone</span>
            <input
              value={emergTelefone}
              onChange={(e) => setEmergTelefone(e.target.value)}
              placeholder="(11) 91234-5678"
              className={inputCls}
            />
          </label>
        </div>

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
