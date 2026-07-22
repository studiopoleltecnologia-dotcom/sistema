import { requireSupabase } from '../../../lib/supabase'

/**
 * Tudo aqui é filtrado pelo RLS de professora (migration
 * 20260721110000_portal_professora.sql): as queries não precisam
 * repetir "onde professora_id = eu" — o banco já recusa o resto.
 */

export async function obterContaProfessora() {
  const { data, error } = await requireSupabase()
    .from('contas_professora')
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

/** O próprio cadastro (inclui valor_por_aluna_centavos, que é o dela). */
export async function obterMinhaProfessora() {
  const { data, error } = await requireSupabase()
    .from('professoras')
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listarMinhasTurmas() {
  const { data, error } = await requireSupabase()
    .from('turmas')
    .select('*')
    .eq('ativa', true)
    .order('dia_semana')
    .order('horario')
  if (error) throw error
  return data
}

/** Lista de chamada: só nome da aluna, sem telefone nem CRM (view definer). */
export async function listarAlunasDaAula(turmaId: string, data: string) {
  const res = await requireSupabase()
    .from('vw_alunas_da_aula')
    .select('*')
    .eq('turma_id', turmaId)
    .eq('data', data)
    .order('aluna')
  if (res.error) throw res.error
  return res.data
}

export async function registrarPresenca(args: {
  turmaId: string
  data: string
  clienteId: string
  presente: boolean
}) {
  const { data, error } = await requireSupabase().rpc('registrar_presenca', {
    p_turma: args.turmaId,
    p_data: args.data,
    p_cliente: args.clienteId,
    p_presente: args.presente,
  })
  if (error) throw error
  return data
}

/** Busca por nome para incluir quem chegou sem agendar (regra 9.6). */
export async function buscarAluna(termo: string) {
  const { data, error } = await requireSupabase().rpc('buscar_aluna', { p_termo: termo })
  if (error) throw error
  return data ?? []
}

/** Aulas dadas e valor previsto por mês — a própria linha, via RLS. */
export async function listarMeusPagamentos() {
  const { data, error } = await requireSupabase()
    .from('vw_pagamento_professoras')
    .select('*')
    .order('mes', { ascending: false })
  if (error) throw error
  return data
}
