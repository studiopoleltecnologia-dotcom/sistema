import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelarConvidado,
  confirmarConvidado,
  listarConvidados,
  recusarConvidado,
} from '../api/convidados'

export function useConvidadosEmAberto() {
  return useQuery({ queryKey: ['convidados', 'abertos'], queryFn: () => listarConvidados() })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['convidados'] })
    // Confirmar cria uma reserva na turma: a agenda e a ocupação mudam,
    // e o convidado entra na chamada daquela aula.
    qc.invalidateQueries({ queryKey: ['agenda'] })
    // E o convidado passa a 'fez_experimental' no funil.
    qc.invalidateQueries({ queryKey: ['clientes'] })
  }
}

export function useConfirmarConvidado() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: confirmarConvidado, onSuccess: invalidar })
}

export function useRecusarConvidado() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: string; motivo: string }) => recusarConvidado(a.id, a.motivo),
    onSuccess: invalidar,
  })
}

export function useCancelarConvidado() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: cancelarConvidado, onSuccess: invalidar })
}
