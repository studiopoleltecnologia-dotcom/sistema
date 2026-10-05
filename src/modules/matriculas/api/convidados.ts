import { requireSupabase } from '../../../lib/supabase'
import type { Tables } from '../../../lib/database.types'

export type Convidado = Tables<'vw_convidados'>
export type StatusConvidado = NonNullable<Convidado['status']>

/**
 * Convites que ainda pedem algo da equipe.
 *
 * `confirmado` continua na fila: a vaga está tomada e a aula ainda vai
 * acontecer — é a lista que a recepção usa para saber quem é aquela
 * pessoa que vai chegar sem estar na lista de alunos.
 */
const EM_ABERTO: StatusConvidado[] = ['solicitado', 'confirmado']

export async function listarConvidados(status: StatusConvidado[] = EM_ABERTO) {
  const { data, error } = await requireSupabase()
    .from('vw_convidados')
    .select('*')
    .in('status', status)
    .order('data')
  if (error) throw error
  return data ?? []
}

/**
 * Confirmar é o que toma a vaga.
 *
 * Devolve o id do agendamento criado. O banco revalida a elegibilidade
 * aqui, e não só na indicação: entre os dois momentos a pessoa pode ter
 * contratado um plano, e aí ela não é mais convidada.
 */
export async function confirmarConvidado(id: string) {
  const { data, error } = await requireSupabase().rpc('confirmar_convidado', {
    p_convite: id,
  })
  if (error) throw error
  return data
}

export async function recusarConvidado(id: string, motivo: string) {
  const { error } = await requireSupabase().rpc('recusar_convidado', {
    p_convite: id,
    p_motivo: motivo,
  })
  if (error) throw error
}

/** Desistência registrada pela equipe (o aluno avisou por fora do app). */
export async function cancelarConvidado(id: string) {
  const { data, error } = await requireSupabase().rpc('cancelar_convidado', {
    p_convite: id,
  })
  if (error) throw error
  return data
}
