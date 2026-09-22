import type { Database, Tables } from '../../lib/database.types'
import type { Agendamento, CanalAula } from '../agenda/types'

export type ContaAluna = Tables<'contas_aluna'>
export type Cliente = Tables<'clientes'>
export type GradePublica = Tables<'vw_grade_publica'>
export type VagasTurma = Tables<'vw_vagas_turma'>
export type SaldoCredito = Tables<'vw_saldo_creditos'>
export type ConfigAgendamento = Tables<'config_agendamento'>
export type PosicaoFila = Tables<'vw_posicao_fila'>
/** Um lote de créditos com validade própria (o que responde "vencem quando?"). */
export type LoteCredito = Tables<'vw_creditos_lotes'>
/** Um assento de turma fixa, com a turma resolvida (modalidade, dia, professora, sala). */
export type TurmaFixa = Tables<'vw_matricula_turmas'>
/**
 * Uma linha de `meus_planos()`: a matrícula com saldo, pagamento e as regras
 * de renovação/cancelamento JÁ CALCULADAS pelo banco. A tela só exibe — a
 * conta do prazo mora em `regras_cancelamento_plano()`, a mesma que grava
 * a solicitação.
 */
export type MeuPlano = Database['public']['Functions']['meus_planos']['Returns'][number]

/** Uma aula (turma + data) que o estúdio cancelou. */
export type AulaCancelada = Tables<'aulas_canceladas'>

export type AgendamentoComTurma = Agendamento & { turma: GradePublica | undefined }

export type { Agendamento, CanalAula }

export const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

/** "19:00:00" → "19:00" */
export function fmtHora(horario: string): string {
  return horario.slice(0, 5)
}
