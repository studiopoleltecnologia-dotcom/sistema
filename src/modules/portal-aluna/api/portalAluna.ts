import { requireSupabase } from '../../../lib/supabase'

/*
 * Todo SELECT de dado pessoal filtra por `cliente_id` explicitamente,
 * mesmo com a RLS já recortando. Desde 21/09/2026 aluna e professora podem
 * ser a mesma conta (CLAUDE.md §5.1), e em `agendamentos`, `lista_espera` e
 * `vw_matricula_turmas` a policy da professora SOMA as aulas que ela dá.
 * Sem o filtro, "minhas aulas" de uma professora-aluna listaria os
 * agendamentos das alunas dela.
 */

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

/**
 * O cadastro que a equipe já deixou pronto para este e-mail, se houver.
 *
 * Quem chega aqui pode ter sido cadastrado pela gestão semanas antes —
 * com telefone, nascimento e contato de emergência já preenchidos. Pedir
 * tudo de novo não só é retrabalho: é como o cadastro divergia, porque o
 * que ele redigitava passava a valer.
 *
 * Não tem parâmetro de propósito: o banco resolve pelo e-mail da própria
 * sessão, então não dá para perguntar pelo cadastro de outra pessoa.
 */
export async function meuCadastroPrevio() {
  const { data, error } = await requireSupabase().rpc('meu_cadastro_previo')
  if (error) throw error
  return data?.[0] ?? null
}

export async function criarContaAluna(args: {
  nome: string
  telefone: string
  email: string
  dataNascimento: string | null
  aceiteLgpd: boolean
  emergenciaNome: string
  emergenciaTelefone: string
}) {
  const { data, error } = await requireSupabase().rpc('criar_conta_aluna', {
    p_nome: args.nome,
    p_telefone: args.telefone,
    p_email: args.email,
    p_data_nascimento: args.dataNascimento as string,
    p_aceite_lgpd: args.aceiteLgpd,
    p_contato_emergencia_nome: args.emergenciaNome,
    p_contato_emergencia_telefone: args.emergenciaTelefone,
  })
  if (error) throw error
  return data
}

export async function obterMeuCliente(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .select('*')
    .eq('id', clienteId)
    .maybeSingle()
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

/** Aulas agendadas do aluno, de hoje em diante. */
export async function listarMeusAgendamentos(clienteId: string, desde: string) {
  const { data, error } = await requireSupabase()
    .from('agendamentos')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('status', 'agendado')
    .gte('data', desde)
    .order('data')
  if (error) throw error
  return data
}

/**
 * Agendamentos do aluno que O ESTÚDIO cancelou (aula cancelada), para a
 * tela dizer "sua aula de quinta foi cancelada, o crédito voltou" em vez
 * de a aula simplesmente sumir da lista.
 */
export async function listarMeusAgendamentosCanceladosPeloEstudio(clienteId: string, desde: string) {
  const { data, error } = await requireSupabase()
    .from('agendamentos')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('status', 'cancelado')
    .eq('origem_cancelamento', 'socia')
    .gte('data', desde)
  if (error) throw error
  return data
}

/** Aulas canceladas pelo estúdio daqui para frente (sem as reabertas). */
export async function listarAulasCanceladas(desde: string) {
  const { data, error } = await requireSupabase()
    .from('aulas_canceladas')
    .select('*')
    .is('reaberta_em', null)
    .gte('data', desde)
  if (error) throw error
  return data
}

/**
 * Catálogo que o aluno enxerga. O filtro de verdade não está aqui: a
 * policy `cliente ve produtos do catalogo` exige `visivel_no_catalogo`,
 * então plano personalizado e cortesia nem chegam nesta resposta. O
 * `.eq('ativo', true)` é só para a consulta não trazer arquivado.
 */
export async function listarPlanos() {
  const { data, error } = await requireSupabase()
    .from('produtos')
    .select('*')
    .eq('ativo', true)
    .order('ordem')
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

/**
 * Tudo o que "Meu plano" mostra, numa chamada: saldo, pagamento pendente,
 * próxima renovação, prazo do pedido de cancelamento e o pedido em
 * aberto. As datas vêm calculadas pelo banco — é a mesma conta que grava
 * a solicitação.
 */
export async function listarMeusPlanos() {
  const { data, error } = await requireSupabase().rpc('meus_planos')
  if (error) throw error
  return data ?? []
}

/** Lotes de crédito ainda com saldo — o que decide se há crédito numa data. */
export async function listarMeusLotes(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('vw_creditos_lotes')
    .select('*')
    .eq('cliente_id', clienteId)
    .gt('saldo', 0)
    .eq('vencido', false)
    .order('validade')
  if (error) throw error
  return data
}

/** Assentos de turma fixa do aluno: vigentes e os que começam na próxima renovação. */
export async function listarMinhasTurmasFixas(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('vw_matricula_turmas')
    .select('*')
    .eq('cliente_id', clienteId)
    .or('vigente.eq.true,futuro.eq.true')
    .order('dia_semana')
    .order('horario')
  if (error) throw error
  return data
}

export async function solicitarCancelamentoPlano(args: { matriculaId: string; motivo: string }) {
  const { data, error } = await requireSupabase().rpc('solicitar_cancelamento_plano', {
    p_matricula: args.matriculaId,
    ...(args.motivo.trim() ? { p_motivo: args.motivo.trim() } : {}),
  })
  if (error) throw error
  return data
}

export async function retirarSolicitacaoCancelamento(solicitacaoId: string) {
  const { error } = await requireSupabase().rpc('retirar_solicitacao_cancelamento', {
    p_solicitacao: solicitacaoId,
  })
  if (error) throw error
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
export async function listarMinhaFila(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('vw_posicao_fila')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('data')
  if (error) throw error
  return data
}

export async function cancelarAgendamento(agendamentoId: string) {
  const { data, error } = await requireSupabase().rpc('cancelar_agendamento', {
    p_agendamento: agendamentoId,
    p_origem: 'aluna',
  })
  if (error) throw error
  return data // true = crédito devolvido
}

/**
 * Suspensão vigente do agendamento antecipado (regulamento 4.11).
 * A policy `cliente ve a propria suspensao` já limita à própria aluna —
 * o filtro aqui é de vigência.
 */
export async function obterMinhaSuspensao(clienteId: string, hoje: string) {
  const { data, error } = await requireSupabase()
    .from('suspensoes_agendamento')
    .select('*')
    .eq('cliente_id', clienteId)
    .is('revogada_em', null)
    .lte('inicio', hoje)
    .gte('fim', hoje)
    .order('fim', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}
