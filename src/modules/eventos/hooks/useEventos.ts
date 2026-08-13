import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmarPagamento, listarInscricoes } from '../api/eventos'
import { EVENTO_PICNIC } from '../types'

export function useInscricoes(evento: string = EVENTO_PICNIC) {
  return useQuery({
    queryKey: ['inscricoes-evento', evento],
    queryFn: () => listarInscricoes(evento),
  })
}

export function useConfirmarPagamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: confirmarPagamento,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inscricoes-evento'] }),
  })
}
