import type { Enums, Tables } from '../../lib/database.types'
import type { Cliente } from '../clientes/types'

export type Followup = Tables<'followups'>
export type FollowupRegra = Tables<'followup_regras'>
export type TipoFollowup = Enums<'tipo_followup'>
export type StatusFollowup = Enums<'status_followup'>

/** Pendência com a cliente embutida (join do select). */
export type FollowupComCliente = Followup & { cliente: Cliente }

export const TIPO_FOLLOWUP_LABEL: Record<TipoFollowup, string> = {
  lead_sumido: 'Lead sumida',
  experimental_sem_retorno: 'Experimental sem retorno',
  cliente_inativa: 'Cliente inativa',
  aniversario: 'Aniversário',
  vencimento_plano: 'Vencimento de mensalidade',
}

/** Descrição de cada regra na tela de configuração. */
export const TIPO_FOLLOWUP_DESCRICAO: Record<TipoFollowup, string> = {
  lead_sumido: 'Lead/pediu informações sem conversa há X dias',
  experimental_sem_retorno: 'Fez experimental e não virou aluna em X dias',
  cliente_inativa: 'Aluna ativa sem aula registrada há X dias',
  aniversario: 'Data de nascimento é hoje (X não se aplica)',
  vencimento_plano: 'Mensalidade prevista vence em até X dias',
}

/**
 * Alunas vinculadas ao Wellhub não podem receber oferta, desconto,
 * aula grátis ou benefício de indicação em nenhuma mensagem —
 * inclusive reativação de sumidas (cláusula da parceria).
 */
export function ehWellhub(cliente: Cliente): boolean {
  return cliente.origem === 'wellhub' || cliente.gympass_id !== null
}
