import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  alternarTarefa,
  criarItemChecklist,
  criarTarefa,
  desmarcarItem,
  excluirTarefa,
  listarChecklist,
  listarTarefas,
  marcarItem,
  removerItemChecklist,
} from '../api/tarefas'

export function useChecklist(data: string) {
  return useQuery({ queryKey: ['checklist', data], queryFn: () => listarChecklist(data) })
}

export function useTarefas() {
  return useQuery({ queryKey: ['tarefas'], queryFn: listarTarefas })
}

function useInvalidarChecklist() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['checklist'] })
}

export function useMarcarItem() {
  const invalidar = useInvalidarChecklist()
  return useMutation({ mutationFn: marcarItem, onSuccess: invalidar })
}

export function useDesmarcarItem() {
  const invalidar = useInvalidarChecklist()
  return useMutation({ mutationFn: desmarcarItem, onSuccess: invalidar })
}

export function useCriarItemChecklist() {
  const invalidar = useInvalidarChecklist()
  return useMutation({ mutationFn: criarItemChecklist, onSuccess: invalidar })
}

export function useRemoverItemChecklist() {
  const invalidar = useInvalidarChecklist()
  return useMutation({ mutationFn: removerItemChecklist, onSuccess: invalidar })
}

function useInvalidarTarefas() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['tarefas'] })
}

export function useCriarTarefa() {
  const invalidar = useInvalidarTarefas()
  return useMutation({ mutationFn: criarTarefa, onSuccess: invalidar })
}

export function useAlternarTarefa() {
  const invalidar = useInvalidarTarefas()
  return useMutation({ mutationFn: alternarTarefa, onSuccess: invalidar })
}

export function useExcluirTarefa() {
  const invalidar = useInvalidarTarefas()
  return useMutation({ mutationFn: excluirTarefa, onSuccess: invalidar })
}
