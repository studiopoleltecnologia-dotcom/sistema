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

// Aprovar/reabrir mexem no Financeiro: o trigger sync_folha_financeiro cria
// (ou apaga) a saída da folha. Invalida também as queries financeiras.
function useInvalidarFechamentoEFinanceiro() {
  const qc = useQueryClient()
  const invalidarFech = useInvalidarFechamento()
  return () => {
    invalidarFech()
    qc.invalidateQueries({ queryKey: ['saidas'] })
    qc.invalidateQueries({ queryKey: ['saldo-caixa'] })
  }
}

export function useAprovarFechamento() {
  const invalidar = useInvalidarFechamentoEFinanceiro()
  return useMutation({ mutationFn: aprovarFechamento, onSuccess: invalidar })
}

export function useReabrirFechamento() {
  const invalidar = useInvalidarFechamentoEFinanceiro()
  return useMutation({ mutationFn: reabrirFechamento, onSuccess: invalidar })
}

export function useHistorico(filtros: { professoraId?: string; ano?: string }) {
  return useQuery({
    queryKey: ['fech-historico', filtros.professoraId ?? '', filtros.ano ?? ''],
    queryFn: () => listarHistorico(filtros),
  })
}
