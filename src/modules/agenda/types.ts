import type { Enums, Tables, TablesInsert } from '../../lib/database.types'
import type { Cliente } from '../clientes/types'

export type Turma = Tables<'turmas'>
export type TurmaInsert = TablesInsert<'turmas'>
export type Professora = Tables<'professoras'>
export type Agendamento = Tables<'agendamentos'>
export type Presenca = Tables<'presencas'>
export type CanalAula = Enums<'canal_aula'>
export type ConfigAgendamento = Tables<'config_agendamento'>

export type TurmaComProfessora = Turma & { professora: Professora }
export type AgendamentoComCliente = Agendamento & { cliente: Cliente }

export const DIAS_SEMANA = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
] as const

export const CANAL_LABEL: Record<CanalAula, string> = {
  mensalista: 'Mensalista',
  wellhub: 'Wellhub',
  classpass: 'ClassPass',
  avulsa: 'Avulsa',
}

/** "19:00:00" → "19:00" */
export function fmtHora(horario: string): string {
  return horario.slice(0, 5)
}
