import type { Enums, Tables, TablesInsert, TablesUpdate } from '../../lib/database.types'
import type { Cliente } from '../clientes/types'

export type Turma = Tables<'turmas'>
export type TurmaInsert = TablesInsert<'turmas'>
export type TurmaUpdate = TablesUpdate<'turmas'>
export type Professora = Tables<'professoras'>
export type Sala = Tables<'salas'>
export type Modalidade = Tables<'modalidades'>
export type Agendamento = Tables<'agendamentos'>
export type Presenca = Tables<'presencas'>
export type CanalAula = Enums<'canal_aula'>
export type ConfigAgendamento = Tables<'config_agendamento'>

/** Recorte de sala exibido na grade (id + nome), como vem de listarTurmas. */
export type SalaNome = { id: string; nome: string }

/**
 * A professora aqui é só o recorte de nome (vw_professoras_nomes), não a
 * linha inteira — o valor pago a ela é gestão-only e não passa pela Agenda.
 */
export type ProfessoraNome = { id: string | null; nome: string | null; ativa: boolean | null }
export type TurmaComProfessora = Turma & {
  professora: ProfessoraNome
  sala: SalaNome | null
}
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
