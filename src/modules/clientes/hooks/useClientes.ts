import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adicionarInteracao,
  atualizarCliente,
  criarCliente,
  listarClientes,
  listarInteracoes,
  listarSocias,
} from '../api/clientes'
import type { ClienteInsert, ClienteUpdate } from '../types'

export function useClientes() {
  return useQuery({ queryKey: ['clientes'], queryFn: listarClientes })
}

export function useSocias() {
  return useQuery({ queryKey: ['socias'], queryFn: listarSocias })
}

export function useInteracoes(clienteId: string | null) {
  return useQuery({
    queryKey: ['interacoes', clienteId],
    queryFn: () => listarInteracoes(clienteId!),
    enabled: clienteId !== null,
  })
}

export function useCriarCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ClienteInsert) => criarCliente(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  })
}

export function useAtualizarCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ClienteUpdate }) =>
      atualizarCliente(id, patch),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      // mudança de estágio gera interação automática via trigger no banco
      qc.invalidateQueries({ queryKey: ['interacoes', id] })
    },
  })
}

export function useAdicionarInteracao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adicionarInteracao,
    onSuccess: (_data, { cliente_id }) => {
      qc.invalidateQueries({ queryKey: ['interacoes', cliente_id] })
      // ultima_conversa pode ter sido atualizada junto
      qc.invalidateQueries({ queryKey: ['clientes'] })
    },
  })
}
