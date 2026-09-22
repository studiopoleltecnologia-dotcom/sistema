import type { Enums, Tables, TablesInsert, TablesUpdate } from '../../lib/database.types'
import type { Cliente } from '../clientes/types'

export type Turma = Tables<'turmas'>
export type TurmaInsert = TablesInsert<'turmas'>
export type TurmaUpdate = TablesUpdate<'turmas'>
export type Professora = Tables<'professoras'>
export type Sala = Tables<'salas'>
export type Modalidade = Tables<'modalidades'>
export type CategoriaModalidade = Tables<'categorias_modalidade'>
export type CategoriaModalidadeInsert = TablesInsert<'categorias_modalidade'>
export type CategoriaModalidadeUpdate = TablesUpdate<'categorias_modalidade'>
/** Modalidade com a categoria já resolvida, como o formulário de turma usa. */
export type ModalidadeComCategoria = Modalidade & { categoria: CategoriaModalidade | null }
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
  /**
   * Categoria da modalidade da turma — é ela que dá a cor do cartão.
   * Nula quando a turma é antiga (sem `modalidade_id`) ou quando a
   * modalidade ainda não foi agrupada: nesse caso o cartão fica neutro.
   */
  categoria: CategoriaModalidade | null
}
export type AgendamentoComCliente = Agendamento & { cliente: Cliente }

/** Uma ocorrência (turma + data) que o estúdio cancelou. */
export type AulaCancelada = Tables<'aulas_canceladas'>
export type MotivoCancelamentoAula = Enums<'motivo_cancelamento_aula'>

/**
 * Os motivos reais de o estúdio cancelar uma aula. O rótulo é o que o
 * aluno lê no portal; no e-mail o texto vem do banco
 * (`rotulo_motivo_cancelamento_aula`), com as mesmas palavras.
 */
export const MOTIVOS_CANCELAMENTO_AULA: {
  valor: MotivoCancelamentoAula
  rotulo: string
  exemplo: string
}[] = [
  { valor: 'professora', rotulo: 'Imprevisto da professora', exemplo: 'doença, emergência, atraso' },
  { valor: 'estudio', rotulo: 'Imprevisto no estúdio', exemplo: 'manutenção, falta de luz na sala' },
  { valor: 'cidade', rotulo: 'Imprevisto na cidade', exemplo: 'chuva forte, alagamento, greve' },
  { valor: 'feriado', rotulo: 'Feriado', exemplo: 'o estúdio não abre' },
  { valor: 'quorum', rotulo: 'Mínimo de alunos não atingido', exemplo: 'turma com poucas reservas' },
  { valor: 'outro', rotulo: 'Outro motivo', exemplo: 'descreva no recado' },
]

export const ROTULO_MOTIVO_AULA = Object.fromEntries(
  MOTIVOS_CANCELAMENTO_AULA.map((m) => [m.valor, m.rotulo]),
) as Record<MotivoCancelamentoAula, string>

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
