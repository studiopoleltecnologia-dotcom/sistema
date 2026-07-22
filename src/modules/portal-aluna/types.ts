import type { Tables } from '../../lib/database.types'
import type { Agendamento, CanalAula } from '../agenda/types'

export type ContaAluna = Tables<'contas_aluna'>
export type Cliente = Tables<'clientes'>
export type GradePublica = Tables<'vw_grade_publica'>
export type VagasTurma = Tables<'vw_vagas_turma'>
export type SaldoCredito = Tables<'vw_saldo_creditos'>
export type ConfigAgendamento = Tables<'config_agendamento'>

export type AgendamentoComTurma = Agendamento & { turma: GradePublica | undefined }

export type { Agendamento, CanalAula }

export const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

/** "19:00:00" → "19:00" */
export function fmtHora(horario: string): string {
  return horario.slice(0, 5)
}
