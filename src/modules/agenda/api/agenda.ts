import { requireSupabase } from '../../../lib/supabase'
import type { CanalAula, TurmaInsert, TurmaUpdate } from '../types'

export async function listarTurmas() {
  const sb = requireSupabase()
  // O nome da professora vem de vw_professoras_nomes (id/nome/ativa) e
  // não da tabela professoras, que virou gestão-only para não expor o
  // valor_por_aluna. A secretária opera a Agenda vendo só os nomes.
  const [turmasRes, nomesRes, salasRes] = await Promise.all([
    sb.from('turmas').select('*').eq('ativa', true).order('dia_semana').order('horario'),
    sb.from('vw_professoras_nomes').select('id, nome, ativa'),
    sb.from('salas').select('id, nome').eq('ativa', true),
  ])
  if (turmasRes.error) throw turmasRes.error
  if (nomesRes.error) throw nomesRes.error
  if (salasRes.error) throw salasRes.error

  const nomes = new Map((nomesRes.data ?? []).map((p) => [p.id, p]))
  const salas = new Map((salasRes.data ?? []).map((s) => [s.id, s]))
  return (turmasRes.data ?? []).map((t) => ({
    ...t,
    professora: nomes.get(t.professora_id) ?? { id: t.professora_id, nome: '—', ativa: true },
    sala: t.sala_id ? salas.get(t.sala_id) ?? null : null,
  }))
}

export async function listarSalas() {
  const { data, error } = await requireSupabase()
    .from('salas')
    .select('*')
    .eq('ativa', true)
    .order('ordem')
  if (error) throw error
  return data
}

export async function listarModalidades() {
  const { data, error } = await requireSupabase()
    .from('modalidades')
    .select('*')
    .eq('ativa', true)
    .order('ordem')
    .order('nome')
  if (error) throw error
  return data
}

/** "+ criar nova" no formulário de turma — cadastra e devolve para já selecionar. */
export async function criarModalidade(nome: string) {
  const { data, error } = await requireSupabase()
    .from('modalidades')
    .insert({ nome: nome.trim(), ordem: 99 })
    .select('id, nome')
    .single()
  if (error) throw error
  return data
}

/** Nomes de professoras para o seletor de turma (sem dado financeiro). */
export async function listarNomesProfessoras() {
  const { data, error } = await requireSupabase()
    .from('vw_professoras_nomes')
    .select('id, nome, ativa')
    .eq('ativa', true)
    .order('nome')
  if (error) throw error
  return data
}

export async function criarTurma(input: TurmaInsert) {
  const { data, error } = await requireSupabase()
    .from('turmas')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarTurma(id: string, patch: TurmaUpdate) {
  const { data, error } = await requireSupabase()
    .from('turmas')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function desativarTurma(id: string) {
  const { error } = await requireSupabase()
    .from('turmas')
    .update({ ativa: false })
    .eq('id', id)
  if (error) throw error
}

/** Agendamentos ativos + presenças de uma data (para a visão do dia). */
export async function listarDia(data: string) {
  const sb = requireSupabase()
  const [ags, prs] = await Promise.all([
    sb
      .from('agendamentos')
      .select('*, cliente:clientes(*)')
      .eq('data', data)
      .eq('status', 'agendado'),
    sb.from('presencas').select('*').eq('data_aula', data),
  ])
  if (ags.error) throw ags.error
  if (prs.error) throw prs.error
  return { agendamentos: ags.data, presencas: prs.data }
}

export async function agendarAula(args: {
  cliente_id: string
  turma_id: string
  data: string
  canal: CanalAula
}) {
  const { data, error } = await requireSupabase().rpc('agendar_aula', {
    p_cliente: args.cliente_id,
    p_turma: args.turma_id,
    p_data: args.data,
    p_canal: args.canal,
  })
  if (error) throw error
  return data
}

export async function cancelarAgendamento(id: string) {
  const { data, error } = await requireSupabase().rpc('cancelar_agendamento', {
    p_agendamento: id,
    p_origem: 'socia',
  })
  if (error) throw error
  return data // true = crédito devolvido
}

export async function registrarPresenca(args: {
  turma_id: string
  data: string
  cliente_id: string
  presente: boolean
  canal?: CanalAula
}) {
  const { data, error } = await requireSupabase().rpc('registrar_presenca', {
    p_turma: args.turma_id,
    p_data: args.data,
    p_cliente: args.cliente_id,
    p_presente: args.presente,
    ...(args.canal ? { p_canal: args.canal } : {}),
  })
  if (error) throw error
  return data
}

export async function obterConfigAgendamento() {
  const { data, error } = await requireSupabase()
    .from('config_agendamento')
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function atualizarConfigAgendamento(patch: {
  horas_cancelamento?: number
  valor_checkin_wellhub_centavos?: number
}) {
  const { data, error } = await requireSupabase()
    .from('config_agendamento')
    .update(patch)
    .eq('id', true)
    .select()
    .single()
  if (error) throw error
  return data
}
