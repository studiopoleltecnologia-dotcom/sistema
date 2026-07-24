import { requireSupabase } from '../../../lib/supabase'
import type { RotinaChecklist } from '../types'

/** Itens ativos das rotinas + quais já foram marcados na data. */
export async function listarChecklist(data: string) {
  const sb = requireSupabase()
  const [itensRes, execRes] = await Promise.all([
    sb.from('checklist_itens').select('*').eq('ativo', true).order('rotina').order('ordem'),
    sb.from('checklist_execucoes').select('item_id').eq('data', data),
  ])
  if (itensRes.error) throw itensRes.error
  if (execRes.error) throw execRes.error
  return {
    itens: itensRes.data ?? [],
    feitos: new Set((execRes.data ?? []).map((e) => e.item_id)),
  }
}

export async function marcarItem(args: { itemId: string; data: string }) {
  const { error } = await requireSupabase()
    .from('checklist_execucoes')
    .insert({ item_id: args.itemId, data: args.data })
  // 23505 = já marcado nessa data (clique duplo) — não é erro para o usuário.
  if (error && error.code !== '23505') throw error
}

export async function desmarcarItem(args: { itemId: string; data: string }) {
  const { error } = await requireSupabase()
    .from('checklist_execucoes')
    .delete()
    .eq('item_id', args.itemId)
    .eq('data', args.data)
  if (error) throw error
}

export async function criarItemChecklist(args: {
  rotina: RotinaChecklist
  titulo: string
  ordem: number
}) {
  const { error } = await requireSupabase().from('checklist_itens').insert(args)
  if (error) throw error
}

/** Remove do template sem apagar histórico (soft): ativo = false. */
export async function removerItemChecklist(id: string) {
  const { error } = await requireSupabase().from('checklist_itens').update({ ativo: false }).eq('id', id)
  if (error) throw error
}

export async function listarTarefas() {
  const { data, error } = await requireSupabase()
    .from('tarefas')
    .select('*, responsavel:socias(nome)')
    .order('concluida')
    .order('prazo', { ascending: true, nullsFirst: false })
    .order('criada_em', { ascending: false })
  if (error) throw error
  return data
}

export async function criarTarefa(args: {
  titulo: string
  responsavel_id: string | null
  prazo: string | null
}) {
  const { error } = await requireSupabase().from('tarefas').insert(args)
  if (error) throw error
}

export async function alternarTarefa(args: { id: string; concluida: boolean }) {
  const { error } = await requireSupabase()
    .from('tarefas')
    .update({
      concluida: args.concluida,
      concluida_em: args.concluida ? new Date().toISOString() : null,
    })
    .eq('id', args.id)
  if (error) throw error
}

export async function excluirTarefa(id: string) {
  const { error } = await requireSupabase().from('tarefas').delete().eq('id', id)
  if (error) throw error
}
