import { requireSupabase } from '../../../lib/supabase'

export async function obterContaAluna() {
  const { data, error } = await requireSupabase()
    .from('contas_aluna')
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function souEquipe() {
  const { data, error } = await requireSupabase().rpc('is_socia')
  if (error) throw error
  return data
}

export async function criarContaAluna(args: {
  nome: string
  telefone: string
  email: string
  dataNascimento: string | null
  aceiteLgpd: boolean
}) {
  const { data, error } = await requireSupabase().rpc('criar_conta_aluna', {
    p_nome: args.nome,
    p_telefone: args.telefone,
    p_email: args.email,
    p_data_nascimento: args.dataNascimento as string,
    p_aceite_lgpd: args.aceiteLgpd,
  })
  if (error) throw error
  return data
}

export async function obterMeuCliente() {
  const { data, error } = await requireSupabase().from('clientes').select('*').maybeSingle()
  if (error) throw error
  return data
}

export async function atualizarMeuCliente(
  clienteId: string,
  patch: {
    nome?: string
    telefone?: string
    data_nascimento?: string | null
    contato_emergencia_nome?: string | null
    contato_emergencia_telefone?: string | null
  },
) {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .update(patch)
    .eq('id', clienteId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listarGradePublica() {
  const { data, error } = await requireSupabase()
    .from('vw_grade_publica')
    .select('*')
    .order('dia_semana')
    .order('horario')
  if (error) throw error
  return data
}

export async function listarVagas(dataInicio: string, dataFim: string) {
  const { data, error } = await requireSupabase()
    .from('vw_vagas_turma')
    .select('*')
    .gte('data', dataInicio)
    .lte('data', dataFim)
  if (error) throw error
  return data
}

export async function listarMinhasReservas() {
  const { data, error } = await requireSupabase()
    .from('agendamentos')
    .select('*')
    .eq('status', 'agendado')
    .order('data')
  if (error) throw error
  return data
}

export async function listarPlanos() {
  const { data, error } = await requireSupabase()
    .from('planos')
    .select('*')
    .eq('ativo', true)
    .order('preco_centavos')
  if (error) throw error
  return data
}

export async function contratarPlano(args: { clienteId: string; planoId: string }) {
  const { data, error } = await requireSupabase().rpc('matricular', {
    p_cliente: args.clienteId,
    p_plano: args.planoId,
  })
  if (error) throw error
  return data
}

export async function obterMeuSaldo() {
  const { data, error } = await requireSupabase()
    .from('vw_saldo_creditos')
    .select('*')
    .eq('status', 'ativa')
    .order('data_fim')
  if (error) throw error
  return data
}

export async function obterConfigAgendamento() {
  const { data, error } = await requireSupabase().from('config_agendamento').select('*').single()
  if (error) throw error
  return data
}

export async function agendarAula(args: { clienteId: string; turmaId: string; data: string }) {
  const { data, error } = await requireSupabase().rpc('agendar_aula', {
    p_cliente: args.clienteId,
    p_turma: args.turmaId,
    p_data: args.data,
    p_canal: 'mensalista',
  })
  if (error) throw error
  return data
}

/** Fila de aula lotada. A RPC recusa se ainda houver vaga. */
export async function entrarListaEspera(args: { turmaId: string; data: string }) {
  const { data, error } = await requireSupabase().rpc('entrar_lista_espera', {
    p_turma: args.turmaId,
    p_data: args.data,
  })
  if (error) throw error
  return data
}

export async function sairListaEspera(filaId: string) {
  const { data, error } = await requireSupabase().rpc('sair_lista_espera', {
    p_id: filaId,
  })
  if (error) throw error
  return data
}

/** Minhas inscrições vivas em fila, com a posição calculada. */
export async function listarMinhaFila() {
  const { data, error } = await requireSupabase()
    .from('vw_posicao_fila')
    .select('*')
    .order('data')
  if (error) throw error
  return data
}

export async function cancelarReserva(agendamentoId: string) {
  const { data, error } = await requireSupabase().rpc('cancelar_agendamento', {
    p_agendamento: agendamentoId,
    p_origem: 'aluna',
  })
  if (error) throw error
  return data // true = crédito devolvido
}
