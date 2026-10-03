import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { aprovarPausa, encerrarPausa, listarPausas, recusarPausa } from '../api/pausas'

export function usePausasEmAberto() {
  return useQuery({ queryKey: ['pausas', 'abertas'], queryFn: () => listarPausas() })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['pausas'] })
    // Pausar muda o status da matrícula e, ao retomar, a vigência e o dia
    // de renovação dela. As três telas que leem isso ficam velhas se só a
    // fila de pausas for revalidada.
    qc.invalidateQueries({ queryKey: ['matriculas'] })
    qc.invalidateQueries({ queryKey: ['clientes'] })
  }
}

export function useAprovarPausa() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: string; motivo?: string }) => aprovarPausa(a.id, a.motivo),
    onSuccess: invalidar,
  })
}

export function useRecusarPausa() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: string; motivo: string }) => recusarPausa(a.id, a.motivo),
    onSuccess: invalidar,
  })
}

export function useEncerrarPausa() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: string; em?: string }) => encerrarPausa(a.id, a.em),
    onSuccess: invalidar,
  })
}
