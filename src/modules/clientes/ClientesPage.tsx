import { useMemo, useState } from 'react'
import { ClienteDetalhe } from './components/ClienteDetalhe'
import { ClienteForm } from './components/ClienteForm'
import { ClientesLista } from './components/ClientesLista'
import { FunilBoard } from './components/FunilBoard'
import { useAtualizarCliente, useClientes, useCriarCliente, useSocias } from './hooks/useClientes'
import type { Cliente, ClienteInsert } from './types'

type Visao = 'funil' | 'lista'

export function ClientesPage() {
  const { data: clientes, isLoading, error } = useClientes()
  const { data: socias } = useSocias()
  const criar = useCriarCliente()
  const atualizar = useAtualizarCliente()

  // Abre na Lista (roster do dia a dia): a maioria dos registros são alunos
  // ativos, não leads. O Funil fica a um clique para o trabalho de captação.
  const [visao, setVisao] = useState<Visao>('lista')
  const [busca, setBusca] = useState('')
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [formAberto, setFormAberto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)

  // deriva da lista viva do cache: painel reflete mutações na hora
  const selecionada = clientes?.find((c) => c.id === selecionadaId) ?? null

  const filtradas = useMemo(() => {
    if (!clientes) return []
    const termo = busca.trim().toLowerCase()
    if (!termo) return clientes
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        c.telefone?.includes(termo) ||
        c.instagram?.toLowerCase().includes(termo),
    )
  }, [clientes, busca])

  function salvar(dados: ClienteInsert) {
    if (editando) {
      atualizar.mutate(
        { id: editando.id, patch: dados },
        { onSuccess: () => fecharForm() },
      )
    } else {
      criar.mutate(dados, {
        onSuccess: (nova) => {
          fecharForm()
          setSelecionadaId(nova.id)
        },
      })
    }
  }

  function fecharForm() {
    setFormAberto(false)
    setEditando(null)
  }

  const abaCls = (ativa: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition ${
      ativa ? 'bg-brand-50 text-brand-700' : 'text-neutral-400 hover:text-neutral-700'
    }`

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Erro ao carregar clientes: {(error as Error).message}
      </p>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            <button className={abaCls(visao === 'funil')} onClick={() => setVisao('funil')}>
              Funil
            </button>
            <button className={abaCls(visao === 'lista')} onClick={() => setVisao('lista')}>
              Lista
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar…"
            className="w-48 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
          />
          <button
            onClick={() => setFormAberto(true)}
            className="rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Novo aluno
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : visao === 'funil' ? (
        <FunilBoard clientes={filtradas} onSelecionar={(c) => setSelecionadaId(c.id)} />
      ) : (
        <ClientesLista
          clientes={filtradas}
          socias={socias ?? []}
          onSelecionar={(c) => setSelecionadaId(c.id)}
        />
      )}

      {selecionada && !formAberto && (
        <ClienteDetalhe
          cliente={selecionada}
          socias={socias ?? []}
          onEditar={() => {
            setEditando(selecionada)
            setFormAberto(true)
          }}
          onFechar={() => setSelecionadaId(null)}
        />
      )}

      {formAberto && (
        <ClienteForm
          cliente={editando}
          socias={socias ?? []}
          onSalvar={salvar}
          onFechar={fecharForm}
          salvando={criar.isPending || atualizar.isPending}
        />
      )}
    </div>
  )
}
