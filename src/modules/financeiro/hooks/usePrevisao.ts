import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  editarPrevisao,
  lerSyncPrevisao,
  listarPrevisao,
  listarPrevisaoDoPeriodo,
  redefinirPrevisao,
  sincronizarPrevisao,
  vincularPrevisao,
} from '../api/previsao'
import type { Periodo } from '../periodo'

/**
 * A previsão do Asaas, para as duas telas que a mostram (Previsão e
 * Entradas). Em arquivo próprio, e não em `useFinanceiro`, porque ela
 * não é caixa: misturar as invalidações faria uma edição de previsão
 * recalcular MEI e saldo, que ela não afeta.
 */

function useInvalidarPrevisao() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['previsao-asaas'] })
    qc.invalidateQueries({ queryKey: ['previsao-asaas-sync'] })
    // A linha de previsão carrega vínculo com `clientes` (o
    // asaas_customer_id gravado no cadastro), então a lista de alunos
    // pode ter mudado junto.
    qc.invalidateQueries({ queryKey: ['clientes'] })
  }
}

export function usePrevisaoAsaas() {
  return useQuery({ queryKey: ['previsao-asaas'], queryFn: listarPrevisao })
}

export function usePrevisaoDoPeriodo(periodo: Periodo) {
  return useQuery({
    queryKey: ['previsao-asaas', periodo.inicio, periodo.fim],
    queryFn: () => listarPrevisaoDoPeriodo(periodo),
  })
}

export function useSyncPrevisao() {
  return useQuery({ queryKey: ['previsao-asaas-sync'], queryFn: lerSyncPrevisao })
}

export function useEditarPrevisao() {
  const invalidar = useInvalidarPrevisao()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: { valor_centavos?: number; vencimento?: string; descricao?: string | null; oculto?: boolean }
    }) => editarPrevisao(id, patch),
    onSuccess: invalidar,
  })
}

export function useRedefinirPrevisao() {
  const invalidar = useInvalidarPrevisao()
  return useMutation({ mutationFn: redefinirPrevisao, onSuccess: invalidar })
}

export function useVincularPrevisao() {
  const invalidar = useInvalidarPrevisao()
  return useMutation({
    mutationFn: ({ id, clienteId }: { id: string; clienteId: string }) =>
      vincularPrevisao(id, clienteId),
    onSuccess: invalidar,
  })
}

export function useSincronizarPrevisao() {
  const invalidar = useInvalidarPrevisao()
  return useMutation({ mutationFn: sincronizarPrevisao, onSuccess: invalidar })
}
