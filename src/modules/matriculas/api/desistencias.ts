import { requireSupabase } from '../../../lib/supabase'

/**
 * A conta da desistência de 7 dias (regulamento 9.7 / CDC art. 49).
 *
 * Devolve sempre uma linha: quando não dá, `motivo` diz por quê e os
 * números vêm junto assim mesmo — a gestão quer ver a conta antes de
 * responder ao aluno, mesmo que a resposta seja "fora do prazo".
 */
export async function desistenciaPossivel(matriculaId: string) {
  const { data, error } = await requireSupabase().rpc('desistencia_possivel', {
    p_matricula: matriculaId,
  })
  if (error) throw error
  return data?.[0] ?? null
}

/**
 * Desfaz a contratação e devolve quanto tem de ser devolvido.
 *
 * O Pix de volta é manual, de propósito: não existe caminho automático
 * para o sistema mandar dinheiro, e não deve existir sem decisão.
 */
export async function desistirDaContratacao(matriculaId: string, motivo?: string) {
  const { data, error } = await requireSupabase().rpc('desistir_da_contratacao', {
    p_matricula: matriculaId,
    p_motivo: motivo,
  })
  if (error) throw error
  return data as number
}

