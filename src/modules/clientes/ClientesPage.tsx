import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { useAbaUrl } from '../../lib/aba'
import { ClienteDetalhe } from './components/ClienteDetalhe'
import { ClienteForm } from './components/ClienteForm'
import { ClientesLista } from './components/ClientesLista'
import { FunilBoard } from './components/FunilBoard'
import { useAtualizarCliente, useClientes, useCriarCliente, useSocias } from './hooks/useClientes'
import type { Cliente, ClienteInsert } from './types'

/** Ordem = ordem do seletor e do menu lateral; o primeiro é o padrão. */
const VISOES = ['lista', 'funil'] as const

export function ClientesPage() {
  const { data: clientes, isLoading, error } = useClientes()
  const { data: socias } = useSocias()
  const criar = useCriarCliente()
  const atualizar = useAtualizarCliente()

  // Abre na Lista (roster do dia a dia): a maioria dos registros são alunos
  // ativos, não leads. O Funil fica a um clique para o trabalho de captação.
  // Na URL (?aba=funil), não em useState: o menu lateral lista as duas visões
  // e um link só chega numa aba se a aba tiver endereço.
  const [visao, setVisao] = useAbaUrl(VISOES, 'lista')
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

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Erro ao carregar clientes: {(error as Error).message}
      </p>
    )
  }

  return (
    <div>
      <PageHeader
        titulo="Clientes"
        subtitulo={`${filtradas.length} de ${clientes?.length ?? 0} no filtro atual`}
        acoes={
          <Button onClick={() => setFormAberto(true)}>
            <Plus className="size-4" />
            Novo aluno
          </Button>
        }
        filtros={
          <>
            <Tabs
              value={visao}
              onChange={setVisao}
              items={[
                { value: 'lista', label: 'Lista' },
                { value: 'funil', label: 'Funil' },
              ]}
            />
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, telefone ou @…"
                className="w-full min-w-0 rounded-md border border-neutral-300 bg-white py-2 pl-8 pr-3 text-sm outline-none transition hover:border-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </>
        }
      />

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
