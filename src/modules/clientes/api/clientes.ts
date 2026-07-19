import { requireSupabase } from '../../../lib/supabase'
import type { ClienteInsert, ClienteUpdate, TipoInteracao } from '../types'

export async function listarClientes() {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .select('*')
    .order('criada_em', { ascending: false })
  if (error) throw error
  return data
}

export async function criarCliente(input: ClienteInsert) {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarCliente(id: string, patch: ClienteUpdate) {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listarSocias() {
  const { data, error } = await requireSupabase()
    .from('socias')
    .select('*')
    .order('nome')
  if (error) throw error
  return data
}

export async function listarInteracoes(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('interacoes_crm')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('criada_em', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Registra uma interação e, se foi contato real (WhatsApp/conversa),
 * atualiza a "última conversa" da cliente automaticamente — default
 * inteligente, um clique a menos (CLAUDE.md seção 4).
 */
export async function adicionarInteracao(input: {
  cliente_id: string
  tipo: TipoInteracao
  descricao: string
}) {
  const sb = requireSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('interacoes_crm')
    .insert({ ...input, socia_id: auth.user?.id ?? null })
    .select()
    .single()
  if (error) throw error

  if (input.tipo === 'whatsapp' || input.tipo === 'conversa') {
    const hoje = new Date().toISOString().slice(0, 10)
    const { error: upErr } = await sb
      .from('clientes')
      .update({ ultima_conversa: hoje })
      .eq('id', input.cliente_id)
    if (upErr) throw upErr
  }
  return data
}
