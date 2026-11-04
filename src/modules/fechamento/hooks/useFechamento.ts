import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adicionarAjuste,
  gerarPrevisaoFolha,
  listarPrevisaoFolha,
  aprovarFechamento,
  listarFechamentosMes,
  listarHistorico,
  listarPagamentoMes,
  reabrirFechamento,
  removerAjuste,
  salvarResumoFolha,
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

/**
 * Digitar um número da folha não mexe no Financeiro — o fechamento segue
 * aberto e a saída só nasce na aprovação. Invalida só as queries da folha.
 */
export function useSalvarResumoFolha() {
  const invalidar = useInvalidarFechamento()
  return useMutation({ mutationFn: salvarResumoFolha, onSuccess: invalidar })
}

export function useHistorico(filtros: { professoraId?: string; ano?: string }) {
  return useQuery({
    queryKey: ['fech-historico', filtros.professoraId ?? '', filtros.ano ?? ''],
    queryFn: () => listarHistorico(filtros),
  })
}

/** A previsão de cada professora, com a base da conta à mostra. */
export function usePrevisaoFolha() {
  return useQuery({ queryKey: ['fech-previsao'], queryFn: listarPrevisaoFolha })
}

/**
 * Recalcular relança as saídas previstas no Financeiro, então invalida
 * também as queries de saídas e de contas a pagar — senão a tela de Saídas
 * segue mostrando os valores antigos até alguém recarregar a página.
 */
export function useGerarPrevisaoFolha() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (meses?: number) => gerarPrevisaoFolha(meses),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fech-previsao'] })
      qc.invalidateQueries({ queryKey: ['fech-mes'] })
      qc.invalidateQueries({ queryKey: ['saidas'] })
      qc.invalidateQueries({ queryKey: ['contas-a-pagar'] })
      qc.invalidateQueries({ queryKey: ['saldo-caixa'] })
    },
  })
}
