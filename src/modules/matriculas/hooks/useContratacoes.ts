import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  aprovarContratacao,
  cancelarSolicitacao,
  confirmarPagamento,
  emitirCobranca,
  listarSolicitacoes,
  recusarContratacao,
  solicitarContratacao,
  type StatusSolicitacao,
} from '../api/contratacoes'

const ABERTAS: StatusSolicitacao[] = ['aguardando_aprovacao', 'aguardando_pagamento']

export function useContratacoesAbertas() {
  return useQuery({
    queryKey: ['contratacoes', 'abertas'],
    queryFn: () => listarSolicitacoes(ABERTAS),
  })
}

export function useContratacoesDecididas() {
  return useQuery({
    queryKey: ['contratacoes', 'decididas'],
    queryFn: () => listarSolicitacoes(['concluida', 'recusada', 'cancelada']),
  })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['contratacoes'] })
    // Concluir uma contratação cria matrícula, crédito e baixa a entrada
    // financeira na mesma transação: as três telas que leem isso ficam
    // desatualizadas se só a fila for revalidada.
    qc.invalidateQueries({ queryKey: ['matriculas'] })
    qc.invalidateQueries({ queryKey: ['clientes'] })
    qc.invalidateQueries({ queryKey: ['entradas'] })
  }
}

export function useSolicitarContratacao() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: solicitarContratacao, onSuccess: invalidar })
}

export function useAprovarContratacao() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: string; motivo?: string }) => aprovarContratacao(a.id, a.motivo),
    onSuccess: invalidar,
  })
}

export function useRecusarContratacao() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: string; motivo: string }) => recusarContratacao(a.id, a.motivo),
    onSuccess: invalidar,
  })
}

export function useConfirmarPagamento() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: string; forma: string }) => confirmarPagamento(a.id, a.forma),
    onSuccess: invalidar,
  })
}

export function useEmitirCobranca() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: emitirCobranca, onSuccess: invalidar })
}

export function useCancelarSolicitacao() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: cancelarSolicitacao, onSuccess: invalidar })
}
