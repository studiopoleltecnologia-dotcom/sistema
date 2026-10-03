import { requireSupabase } from '../../../lib/supabase'
import type { Tables } from '../../../lib/database.types'

export type Pausa = Tables<'vw_pausas'>
export type StatusPausa = NonNullable<Pausa['status']>

/** Pausas que ainda pedem algo da equipe: decidir, ou acompanhar em curso. */
const EM_ABERTO: StatusPausa[] = ['solicitada', 'aprovada', 'ativa']

export async function listarPausas(status: StatusPausa[] = EM_ABERTO) {
  const { data, error } = await requireSupabase()
    .from('vw_pausas')
    .select('*')
    .in('status', status)
    .order('solicitada_em', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Aprovar é o que para a cobrança.
 *
 * Se o início já chegou, o banco ativa na mesma transação e devolve
 * `'ativa'` em vez de `'aprovada'` — quem aprova na recepção espera que o
 * plano pare na hora, não na madrugada seguinte.
 */
export async function aprovarPausa(id: string, motivo?: string) {
  const { data, error } = await requireSupabase().rpc('aprovar_pausa', {
    p_pausa: id,
    p_motivo: motivo,
  })
  if (error) throw error
  return data
}

export async function recusarPausa(id: string, motivo: string) {
  const { error } = await requireSupabase().rpc('recusar_pausa', {
    p_pausa: id,
    p_motivo: motivo,
  })
  if (error) throw error
}

/**
 * Retorno antecipado: o aluno voltou antes do prazo.
 *
 * Devolve quantos dias a pausa durou de fato — é esse número que entra na
 * vigência, e não o período que havia sido pedido.
 */
export async function encerrarPausa(id: string, em?: string) {
  const { data, error } = await requireSupabase().rpc('encerrar_pausa', {
    p_pausa: id,
    p_em: em,
  })
  if (error) throw error
  return data
}
