import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  agendarAula,
  atualizarConfigAgendamento,
  cancelarAgendamento,
  criarTurma,
  desativarTurma,
  listarDia,
  listarNomesProfessoras,
  listarTurmas,
  obterConfigAgendamento,
  registrarPresenca,
} from '../api/agenda'

export function useTurmas() {
  return useQuery({ queryKey: ['turmas'], queryFn: listarTurmas })
}

export function useNomesProfessoras() {
  return useQuery({ queryKey: ['nomes-professoras'], queryFn: listarNomesProfessoras })
}

export function useDia(data: string) {
  return useQuery({ queryKey: ['agenda-dia', data], queryFn: () => listarDia(data) })
}

export function useConfigAgendamento() {
  return useQuery({ queryKey: ['config-agendamento'], queryFn: obterConfigAgendamento })
}

function useInvalidarAgenda() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['agenda-dia'] })
    // créditos, financeiro (wellhub) e clientes (ultima_aula) mudam junto
    qc.invalidateQueries({ queryKey: ['saldo-creditos'] })
    qc.invalidateQueries({ queryKey: ['entradas'] })
    qc.invalidateQueries({ queryKey: ['clientes'] })
    qc.invalidateQueries({ queryKey: ['pagamento-professoras'] })
  }
}

export function useCriarTurma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: criarTurma,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turmas'] }),
  })
}

export function useDesativarTurma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: desativarTurma,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turmas'] }),
  })
}

export function useAgendarAula() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: agendarAula, onSuccess: invalidar })
}

export function useCancelarAgendamento() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: cancelarAgendamento, onSuccess: invalidar })
}

export function useRegistrarPresenca() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: registrarPresenca, onSuccess: invalidar })
}

export function useAtualizarConfigAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: atualizarConfigAgendamento,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-agendamento'] }),
  })
}
