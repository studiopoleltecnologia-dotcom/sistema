import { useEffect, useState, type FormEvent } from 'react'
import {
  formatarCpf,
  temErros,
  useConfigCadastro,
  validarCadastro,
  type ErrosCadastro,
} from '../../lib/cadastro'
import { supabase } from '../../lib/supabase'
import { Cabecalho } from './components/Basicos'
import { useAtualizarMeuCliente, useMeuCliente } from './hooks/usePortalAluna'

const inputCls =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500'
const erroCls = 'mt-1 text-xs text-red-600'

export function PerfilPage() {
  const { data: cliente } = useMeuCliente()
  const atualizar = useAtualizarMeuCliente()
  const cfg = useConfigCadastro()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [emergNome, setEmergNome] = useState('')
  const [emergTelefone, setEmergTelefone] = useState('')
  const [erros, setErros] = useState<ErrosCadastro>({})

  useEffect(() => {
    if (cliente) {
      setNome(cliente.nome ?? '')
      setTelefone(cliente.telefone ?? '')
      setCpf(cliente.cpf ? formatarCpf(cliente.cpf) : '')
      setEmergNome(cliente.contato_emergencia_nome ?? '')
      setEmergTelefone(cliente.contato_emergencia_telefone ?? '')
    }
  }, [cliente])

  // O aluno preenche o CPF quando está vazio; trocar passa pelo estúdio
  // (é o documento da cobrança — o banco também recusa).
  const cpfTravado = !!cliente?.cpf

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!cliente) return
    const patch = {
      nome: nome.trim(),
      telefone: telefone.trim(),
      contato_emergencia_nome: emergNome.trim() || null,
      contato_emergencia_telefone: emergTelefone.trim() || null,
      ...(cpfTravado ? {} : { cpf: cpf.trim() || null }),
    }
    // Só o que mudou é validado — igual ao banco. Cadastro antigo com
    // telefone sem DDD continua conseguindo trocar o contato de emergência.
    const encontrados = validarCadastro({ ...cliente, ...patch }, cfg, { original: cliente })
    setErros(encontrados)
    if (temErros(encontrados)) return
    atualizar.mutate([cliente.id, patch])
  }

  return (
    <div className="lg:max-w-xl">
      <Cabecalho titulo="Meu perfil" subtitulo={cliente?.email ?? undefined} />

      <form onSubmit={handleSubmit} className="rounded-lg border border-neutral-200 bg-white p-4">
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Nome completo</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
          {erros.nome && <p className={erroCls}>Informe seu nome e sobrenome.</p>}
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Telefone</span>
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className={inputCls}
          />
          {erros.telefone && (
            <p className={erroCls}>Telefone inválido — informe com DDD, ex.: (21) 98765-4321.</p>
          )}
        </label>

        {!cliente?.estrangeiro && (
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">CPF</span>
            <input
              inputMode="numeric"
              value={cpf}
              disabled={cpfTravado}
              onChange={(e) => setCpf(formatarCpf(e.target.value))}
              placeholder="000.000.000-00"
              className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500`}
            />
            {erros.cpf ? (
              <p className={erroCls}>{erros.cpf}</p>
            ) : (
              <p className="mt-1 text-xs text-neutral-400">
                {cpfTravado
                  ? 'Para corrigir o CPF, fale com o estúdio.'
                  : 'Usado para emitir a cobrança do plano.'}
              </p>
            )}
          </label>
        )}

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
            {erros.contato_emergencia_telefone && (
              <p className={erroCls}>Telefone inválido — informe com DDD, ex.: (21) 98765-4321.</p>
            )}
          </label>
        </div>

        {atualizar.isSuccess && (
          <p className="mb-3 text-sm text-brand-700">Dados atualizados.</p>
        )}
        {/* Sem isto, uma recusa do banco parecia um clique que não pegou. */}
        {atualizar.isError && (
          <p className="mb-3 text-sm text-red-600">
            {(atualizar.error as { message?: string })?.message ??
              'Não foi possível salvar. Tente novamente.'}
          </p>
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
        className="mt-4 w-full rounded-md border border-neutral-200 py-2.5 text-sm text-neutral-500 hover:bg-neutral-50 lg:hidden"
      >
        Sair
      </button>
    </div>
  )
}
