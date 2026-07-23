import { requireSupabase } from '../../../lib/supabase'
import type { Enums } from '../../../lib/database.types'

export type TipoAjuste = Enums<'tipo_ajuste_folha'>

/** vw_pagamento_professoras filtrada pelo mês — o bruto calculado ao vivo. */
export async function listarPagamentoMes(competencia: string) {
  const { data, error } = await requireSupabase()
    .from('vw_pagamento_professoras')
    .select('*')
    .eq('mes', `${competencia}-01`)
  if (error) throw error
  return data
}

/** Fechamentos do mês, com os ajustes embutidos. */
export async function listarFechamentosMes(competencia: string) {
  const { data, error } = await requireSupabase()
    .from('fechamentos_professora')
    .select('*, ajustes:fechamento_ajustes(*)')
    .eq('competencia', competencia)
  if (error) throw error
  return data
}

/** Cria (ou devolve) o fechamento aberto de uma professora no mês. */
export async function garantirFechamento(professoraId: string, competencia: string) {
  const sb = requireSupabase()
  const { data: existe, error: e1 } = await sb
    .from('fechamentos_professora')
    .select('*')
    .eq('professora_id', professoraId)
    .eq('competencia', competencia)
    .maybeSingle()
  if (e1) throw e1
  if (existe) return existe
  const { data, error } = await sb
    .from('fechamentos_professora')
    .insert({ professora_id: professoraId, competencia })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function adicionarAjuste(args: {
  professoraId: string
  competencia: string
  tipo: TipoAjuste
  descricao: string | null
  valor_centavos: number
}) {
  const fech = await garantirFechamento(args.professoraId, args.competencia)
  const { error } = await requireSupabase().from('fechamento_ajustes').insert({
    fechamento_id: fech.id,
    tipo: args.tipo,
    descricao: args.descricao,
    valor_centavos: args.valor_centavos,
  })
  if (error) throw error
}

export async function removerAjuste(id: string) {
  const { error } = await requireSupabase().from('fechamento_ajustes').delete().eq('id', id)
  if (error) throw error
}

/** Congela o mês: grava o resumo calculado e marca como aprovado. */
export async function aprovarFechamento(args: {
  professoraId: string
  competencia: string
  aulas: number
  horas: number
  alunas: number
  bruto_centavos: number
}) {
  const sb = requireSupabase()
  const fech = await garantirFechamento(args.professoraId, args.competencia)
  const { data: auth } = await sb.auth.getUser()
  const { error } = await sb
    .from('fechamentos_professora')
    .update({
      status: 'aprovado',
      aulas: args.aulas,
      horas: args.horas,
      alunas: args.alunas,
      bruto_centavos: args.bruto_centavos,
      aprovado_em: new Date().toISOString(),
      aprovado_por: auth.user?.id ?? null,
    })
    .eq('id', fech.id)
  if (error) throw error
}

export async function reabrirFechamento(id: string) {
  const { error } = await requireSupabase()
    .from('fechamentos_professora')
    .update({ status: 'aberto', aprovado_em: null, aprovado_por: null })
    .eq('id', id)
  if (error) throw error
}

/** Histórico de fechamentos aprovados, filtrável por professora e ano. */
export async function listarHistorico(filtros: { professoraId?: string; ano?: string }) {
  let q = requireSupabase()
    .from('fechamentos_professora')
    .select('*, ajustes:fechamento_ajustes(valor_centavos), professora:professoras(nome)')
    .eq('status', 'aprovado')
    .order('competencia', { ascending: false })
  if (filtros.professoraId) q = q.eq('professora_id', filtros.professoraId)
  if (filtros.ano) q = q.like('competencia', `${filtros.ano}-%`)
  const { data, error } = await q
  if (error) throw error
  return data
}
