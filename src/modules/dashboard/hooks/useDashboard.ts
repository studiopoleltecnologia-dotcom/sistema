import { useQuery } from '@tanstack/react-query'
import {
  aniversariantesDoMes,
  aulasDeHoje,
  contarFollowupsPendentes,
  contarFunil,
  contarInadimplentes,
  folhaPrevistaMes,
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

/** Grade de hoje — inclui a aula sem ninguém agendado (é o ponto). */
export function useAulasDeHoje() {
  return useQuery({ queryKey: ['dash-aulas-hoje'], queryFn: aulasDeHoje })
}

export function useAniversariantes() {
  return useQuery({ queryKey: ['dash-aniversariantes'], queryFn: aniversariantesDoMes })
}

/** Só a gestão vê valor de pagamento — `enabled` evita a consulta às demais. */
export function useFolhaPrevista(enabled: boolean) {
  return useQuery({ queryKey: ['dash-folha'], queryFn: folhaPrevistaMes, enabled })
}
