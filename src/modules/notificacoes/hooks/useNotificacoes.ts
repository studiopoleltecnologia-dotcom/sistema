import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  contarNaoLidas,
  listarNotificacoes,
  listarPreferencias,
  marcarLida,
  marcarTodasLidas,
  salvarPreferencia,
} from '../api/notificacoes'

/**
 * O contador do sino.
 *
 * Revalida a cada 2 minutos e ao voltar para a aba: as filas que ele
 * conta nascem de coisas que acontecem fora do navegador de quem está
 * olhando — um aluno pedindo pausa às 22h, o cron do quórum cancelando
 * uma aula. Sem isso, o sino só mudaria com F5.
 */
export function useNaoLidas() {
  return useQuery({
    queryKey: ['notificacoes', 'nao-lidas'],
    queryFn: contarNaoLidas,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  })
}

/** A lista, só quando o painel está aberto. */
export function useNotificacoes(aberto: boolean) {
  return useQuery({
    queryKey: ['notificacoes', 'lista'],
    queryFn: () => listarNotificacoes(30),
    enabled: aberto,
  })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['notificacoes'] })
}

export function useMarcarLida() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: marcarLida, onSuccess: invalidar })
}

export function useMarcarTodasLidas() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: marcarTodasLidas, onSuccess: invalidar })
}

export function usePreferenciasNotificacao(aberto: boolean) {
  return useQuery({
    queryKey: ['notificacoes', 'preferencias'],
    queryFn: listarPreferencias,
    enabled: aberto,
  })
}

export function useSalvarPreferencia() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: salvarPreferencia, onSuccess: invalidar })
}
