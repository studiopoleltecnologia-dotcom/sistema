import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  atualizarRegra,
  concluirPendencia,
  dispensarPendencia,
  gerarAgora,
  listarPendencias,
  listarRegras,
} from '../api/followup'
import type { TipoFollowup } from '../types'

export function usePendencias() {
  return useQuery({ queryKey: ['followups'], queryFn: listarPendencias })
}

export function useRegras() {
  return useQuery({ queryKey: ['followup-regras'], queryFn: listarRegras })
}

export function useGerarAgora() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: gerarAgora,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followups'] }),
  })
}

export function useConcluirPendencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: concluirPendencia,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followups'] })
      // interação registrada no CRM mexe em clientes/interações
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['interacoes'] })
    },
  })
}

export function useDispensarPendencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: dispensarPendencia,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followups'] }),
  })
}

export function useAtualizarRegra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tipo, patch }: { tipo: TipoFollowup; patch: { dias?: number; ativa?: boolean } }) =>
      atualizarRegra(tipo, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followup-regras'] }),
  })
}
