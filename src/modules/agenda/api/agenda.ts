import { requireSupabase } from '../../../lib/supabase'
import type { CanalAula, TurmaInsert } from '../types'

export async function listarTurmas() {
  const { data, error } = await requireSupabase()
    .from('turmas')
    .select('*, professora:professoras(*)')
    .eq('ativa', true)
    .order('dia_semana')
    .order('horario')
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
  max_reposicoes_por_matricula?: number
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
