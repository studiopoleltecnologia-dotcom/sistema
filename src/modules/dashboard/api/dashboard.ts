import { requireSupabase } from '../../../lib/supabase'
import type { EstagioFunil } from '../../clientes/types'

/**
 * O painel não tem tabela própria — ele agrega o que os módulos já
 * calculam. As consultas puramente financeiras vêm dos hooks do
 * Financeiro (reaproveitados). Aqui ficam só as leituras de operação
 * e relacionamento que ainda não tinham hook.
 */

const hoje = () => new Date().toISOString().slice(0, 10)
const emDias = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export type ContagemFunil = { estagio: EstagioFunil; total: number }

export async function contarFunil(): Promise<ContagemFunil[]> {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .select('estagio')
  if (error) throw error
  const mapa = new Map<EstagioFunil, number>()
  for (const c of data ?? []) {
    mapa.set(c.estagio, (mapa.get(c.estagio) ?? 0) + 1)
  }
  return [...mapa.entries()].map(([estagio, total]) => ({ estagio, total }))
}

export async function contarFollowupsPendentes(): Promise<number> {
  const { count, error } = await requireSupabase()
    .from('followups')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pendente')
  if (error) throw error
  return count ?? 0
}

/** Matrículas com o pagamento do ciclo em aberto (bloqueadas de agendar). */
export async function contarInadimplentes(): Promise<number> {
  const { count, error } = await requireSupabase()
    .from('matriculas')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'inadimplente')
  if (error) throw error
  return count ?? 0
}

export type OcupacaoDia = { data: string; agendados: number }

/** Agendamentos ativos de hoje até +N dias, agrupados por dia. */
export async function ocupacaoProximosDias(dias = 7): Promise<OcupacaoDia[]> {
  const { data, error } = await requireSupabase()
    .from('agendamentos')
    .select('data')
    .eq('status', 'agendado')
    .gte('data', hoje())
    .lte('data', emDias(dias))
  if (error) throw error
  const mapa = new Map<string, number>()
  for (const a of data ?? []) mapa.set(a.data, (mapa.get(a.data) ?? 0) + 1)
  return [...mapa.entries()]
    .map(([data, agendados]) => ({ data, agendados }))
    .sort((a, b) => a.data.localeCompare(b.data))
}

export type FolhaPrevista = { total_centavos: number; professoras: number; aulas: number }

/**
 * Folha das professoras prevista para o mês corrente — o bruto calculado
 * ao vivo pela mesma view do módulo Fechamento (antes de ajustes manuais
 * e da aprovação). É uma previsão de saída de caixa (pagamento dia 15),
 * não o valor congelado; o número exato fica no /fechamento.
 */
export async function folhaPrevistaMes(): Promise<FolhaPrevista> {
  const mes = new Date().toISOString().slice(0, 7)
  const { data, error } = await requireSupabase()
    .from('vw_pagamento_professoras')
    .select('professora_id, total_centavos, aulas')
    .eq('mes', `${mes}-01`)
  if (error) throw error
  const linhas = data ?? []
  return {
    total_centavos: linhas.reduce((s, l) => s + (l.total_centavos ?? 0), 0),
    professoras: new Set(linhas.map((l) => l.professora_id)).size,
    aulas: linhas.reduce((s, l) => s + (l.aulas ?? 0), 0),
  }
}

/** Aniversariantes do mês corrente (gatilho de relacionamento). */
export async function aniversariantesDoMes(): Promise<{ nome: string; dia: number }[]> {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .select('nome, data_nascimento')
    .not('data_nascimento', 'is', null)
  if (error) throw error
  const mes = new Date().getMonth() + 1
  return (data ?? [])
    .map((c) => {
      const [, m, d] = (c.data_nascimento as string).split('-').map(Number)
      return { nome: c.nome, mes: m, dia: d }
    })
    .filter((c) => c.mes === mes)
    .sort((a, b) => a.dia - b.dia)
    .map(({ nome, dia }) => ({ nome, dia }))
}
