import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adicionarAjuste,
  aprovarFechamento,
  listarFechamentosMes,
  listarHistorico,
  listarPagamentoMes,
  reabrirFechamento,
  removerAjuste,
} from '../api/fechamento'

export function usePagamentoMes(competencia: string) {
  return useQuery({
    queryKey: ['fech-pagamento', competencia],
    queryFn: () => listarPagamentoMes(competencia),
  })
}

export function useFechamentosMes(competencia: string) {
  return useQuery({
    queryKey: ['fech-mes', competencia],
    queryFn: () => listarFechamentosMes(competencia),
  })
}

function useInvalidarFechamento() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['fech-mes'] })
    qc.invalidateQueries({ queryKey: ['fech-historico'] })
  }
}

export function useAdicionarAjuste() {
  const invalidar = useInvalidarFechamento()
  return useMutation({ mutationFn: adicionarAjuste, onSuccess: invalidar })
}

export function useRemoverAjuste() {
  const invalidar = useInvalidarFechamento()
  return useMutation({ mutationFn: removerAjuste, onSuccess: invalidar })
}

export function useAprovarFechamento() {
  const invalidar = useInvalidarFechamento()
  return useMutation({ mutationFn: aprovarFechamento, onSuccess: invalidar })
}

export function useReabrirFechamento() {
  const invalidar = useInvalidarFechamento()
  return useMutation({ mutationFn: reabrirFechamento, onSuccess: invalidar })
}

export function useHistorico(filtros: { professoraId?: string; ano?: string }) {
  return useQuery({
    queryKey: ['fech-historico', filtros.professoraId ?? '', filtros.ano ?? ''],
    queryFn: () => listarHistorico(filtros),
  })
}
