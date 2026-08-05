import type { Enums, Tables } from '../../lib/database.types'

export type ChecklistItem = Tables<'checklist_itens'>
export type Tarefa = Tables<'tarefas'>
export type RotinaChecklist = Enums<'rotina_checklist'>
export type TarefaComResponsavel = Tarefa & { responsavel: { nome: string } | null }

export const ROTINA_LABEL: Record<RotinaChecklist, string> = {
  abertura: 'Abertura',
  fechamento: 'Fechamento',
}

export const ROTINAS: RotinaChecklist[] = ['abertura', 'fechamento']
