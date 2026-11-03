import { useQuery } from '@tanstack/react-query'
import { listarAtestadosPendentes } from '../../clientes/api/documentosCliente'
import {
  aniversariantesDoMes,
  aulasDeHoje,
  contarCancelamentosPendentes,
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

export function useCancelamentosPendentes() {
  return useQuery({ queryKey: ['dash-cancelamentos'], queryFn: contarCancelamentosPendentes })
}

/**
 * Atestados médicos esperando a gestão.
 *
 * Sem este alerta, um atestado enviado na sexta à noite só é descoberto
 * quando alguém abre a ficha daquele aluno por outro motivo — e até lá ele
 * não consegue agendar aula.
 *
 * `enabled` em vez de esconder na tela: a consulta lê documento de saúde, e
 * a policy é de gestão. Para a secretária ela falharia, e um erro no
 * console a cada abertura do painel é ruído que esconde problema real.
 */
export function useAtestadosPendentes(gestao: boolean) {
  return useQuery({
    queryKey: ['atestados-pendentes'],
    queryFn: listarAtestadosPendentes,
    enabled: gestao,
  })
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
