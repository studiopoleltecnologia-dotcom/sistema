import { useQuery } from '@tanstack/react-query'
import {
  aniversariantesDoMes,
  contarFollowupsPendentes,
  contarFunil,
  contarInadimplentes,
  folhaPrevistaMes,
  ocupacaoProximosDias,
} from '../api/dashboard'

export function useFunil() {
  return useQuery({ queryKey: ['dash-funil'], queryFn: contarFunil })
}

export function useFollowupsPendentes() {
  return useQuery({ queryKey: ['dash-followups'], queryFn: contarFollowupsPendentes })
}

export function useInadimplentes() {
  return useQuery({ queryKey: ['dash-inadimplentes'], queryFn: contarInadimplentes })
}

export function useOcupacao(dias = 7) {
  return useQuery({ queryKey: ['dash-ocupacao', dias], queryFn: () => ocupacaoProximosDias(dias) })
}

export function useAniversariantes() {
  return useQuery({ queryKey: ['dash-aniversariantes'], queryFn: aniversariantesDoMes })
}

/** Só a gestão vê valor de pagamento — `enabled` evita a consulta às demais. */
export function useFolhaPrevista(enabled: boolean) {
  return useQuery({ queryKey: ['dash-folha'], queryFn: folhaPrevistaMes, enabled })
}
