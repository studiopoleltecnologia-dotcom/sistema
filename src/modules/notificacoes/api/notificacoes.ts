import { requireSupabase } from '../../../lib/supabase'
import type { Database } from '../../../lib/database.types'

export type Notificacao =
  Database['public']['Functions']['minhas_notificacoes']['Returns'][number]
export type PreferenciaNotificacao =
  Database['public']['Functions']['minhas_preferencias_notificacao']['Returns'][number]

export async function listarNotificacoes(limite = 30) {
  const { data, error } = await requireSupabase().rpc('minhas_notificacoes', {
    p_limite: limite,
  })
  if (error) throw error
  return data ?? []
}

/**
 * Só o número, para o badge.
 *
 * Consulta separada da lista de propósito: o contador roda em intervalo
 * curto e no app inteiro; a lista só é buscada quando alguém abre o
 * sino.
 */
export async function contarNaoLidas() {
  const { data, error } = await requireSupabase().rpc('notificacoes_nao_lidas')
  if (error) throw error
  return data ?? 0
}

export async function marcarLida(id: string) {
  const { error } = await requireSupabase().rpc('marcar_notificacao_lida', { p_id: id })
  if (error) throw error
}

export async function marcarTodasLidas() {
  const { data, error } = await requireSupabase().rpc('marcar_notificacoes_lidas')
  if (error) throw error
  return data ?? 0
}

export async function listarPreferencias() {
  const { data, error } = await requireSupabase().rpc('minhas_preferencias_notificacao')
  if (error) throw error
  return data ?? []
}

export async function salvarPreferencia(args: {
  tipo: string
  noSistema: boolean
  porEmail: boolean
}) {
  const { error } = await requireSupabase().rpc('salvar_preferencia_notificacao', {
    p_tipo: args.tipo,
    p_no_sistema: args.noSistema,
    p_por_email: args.porEmail,
  })
  if (error) throw error
}
