import { useQuery } from '@tanstack/react-query'
import {
  listarAlertas,
  listarAnaliseModalidade,
  listarAnaliseProfessora,
  listarClientesRanking,
  listarClientesRisco,
  listarClientesSumidos,
  listarEvolucaoSemanal,
  listarOcupacaoTendencia,
  listarPlanosNomes,
  listarResumo,
} from '../api/analises'

export function useResumo() {
  return useQuery({ queryKey: ['analises-resumo'], queryFn: listarResumo })
}

export function useAlertas() {
  return useQuery({ queryKey: ['analises-alertas'], queryFn: listarAlertas })
}

export function useOcupacaoTendencia() {
  return useQuery({ queryKey: ['analises-ocupacao-tendencia'], queryFn: listarOcupacaoTendencia })
}

export function useAnaliseModalidade() {
  return useQuery({ queryKey: ['analises-modalidade'], queryFn: listarAnaliseModalidade })
}

export function useAnaliseProfessora() {
  return useQuery({ queryKey: ['analises-professora'], queryFn: listarAnaliseProfessora })
}

export function useEvolucaoSemanal(semanas: number) {
  return useQuery({
    queryKey: ['analises-evolucao', semanas],
    queryFn: () => listarEvolucaoSemanal(semanas),
  })
}

export function useClientesRisco() {
  return useQuery({ queryKey: ['analises-clientes-risco'], queryFn: listarClientesRisco })
}

export function useClientesSumidos(dias: number) {
  return useQuery({
    queryKey: ['analises-clientes-sumidos', dias],
    queryFn: () => listarClientesSumidos(dias),
  })
}

/** `habilitado=false` (não-gestão) evita pedir dado que a RLS sempre zera. */
export function useClientesRanking(habilitado: boolean) {
  return useQuery({
    queryKey: ['analises-clientes-ranking'],
    queryFn: listarClientesRanking,
    enabled: habilitado,
  })
}

export function usePlanosNomes() {
  return useQuery({ queryKey: ['analises-planos-nomes'], queryFn: listarPlanosNomes })
}
