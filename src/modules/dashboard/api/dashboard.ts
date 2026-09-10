import { requireSupabase } from '../../../lib/supabase'
import { listarTurmas } from '../../agenda/api/agenda'
import { hojeISO } from '../../agenda/semana'
import type { CategoriaModalidade } from '../../agenda/types'
import type { EstagioFunil } from '../../clientes/types'

/**
 * O painel não tem tabela própria — ele agrega o que os módulos já
 * calculam. As consultas puramente financeiras vêm dos hooks do
 * Financeiro (reaproveitados). Aqui ficam só as leituras de operação
 * e relacionamento que ainda não tinham hook.
 */

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

export type AulaDoDia = {
  turma_id: string
  horario: string
  modalidade: string
  professora: string | null
  sala: string | null
  capacidade: number
  agendados: number
  /** Só o que `corDaTurma` precisa — a cor do cartão vem daqui. */
  categoria: CategoriaModalidade | null
}

/**
 * A grade de hoje, com quantos alunos cada aula já tem.
 *
 * Diferente de partir dos **agendamentos** (como fazia o card de barras que
 * isto substituiu): aula sem ninguém marcado simplesmente não existia ali, e o
 * painel respondia "nenhuma aula agendada" num dia com dez aulas na grade.
 * Para saber se dá para vender, o que importa é justamente a aula vazia —
 * então aqui a lista parte das **turmas** e os agendamentos entram só como
 * contagem.
 *
 * Um dia só, e não a semana: o painel resume, a Agenda detalha. Onze aulas já
 * é o tamanho do card inteiro.
 */
export async function aulasDeHoje(): Promise<AulaDoDia[]> {
  const data = hojeISO()
  const dow = new Date(data + 'T00:00:00').getDay()

  const [turmas, agendaRes] = await Promise.all([
    listarTurmas(),
    requireSupabase()
      .from('agendamentos')
      .select('turma_id')
      .eq('status', 'agendado')
      .eq('data', data),
  ])
  if (agendaRes.error) throw agendaRes.error

  const conta = new Map<string, number>()
  for (const a of agendaRes.data ?? []) {
    conta.set(a.turma_id, (conta.get(a.turma_id) ?? 0) + 1)
  }

  return turmas
    .filter((t) => t.dia_semana === dow)
    .map((t) => ({
      turma_id: t.id,
      horario: t.horario,
      modalidade: t.modalidade,
      professora: t.professora.nome,
      sala: t.sala?.nome ?? null,
      capacidade: t.capacidade,
      agendados: conta.get(t.id) ?? 0,
      categoria: t.categoria,
    }))
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
