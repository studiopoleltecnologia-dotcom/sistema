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
  cpf: string | null
  estrangeiro: boolean
}) {
  const { data, error } = await requireSupabase().rpc('criar_conta_aluna', {
    p_nome: args.nome,
    p_telefone: args.telefone,
    p_email: args.email,
    p_data_nascimento: args.dataNascimento as string,
    p_aceite_lgpd: args.aceiteLgpd,
    p_contato_emergencia_nome: args.emergenciaNome,
    p_contato_emergencia_telefone: args.emergenciaTelefone,
    p_cpf: args.cpf ?? undefined,
    p_estrangeiro: args.estrangeiro,
  })
  // CPF que já é de outro cadastro: a mensagem crua do índice fala em
  // "constraint", e o aluno não tem o que fazer com isso.
  if (error?.code === '23505' && error.message?.includes('clientes_cpf_unico')) {
    throw new Error('Este CPF já está em outro cadastro do estúdio. Fale com a gente para acertar.')
  }
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
    cpf?: string | null
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

/**
 * Por que cada produto do catálogo pode ou não ser contratado por ESTE
 * aluno — o mesmo veredito que trava `solicitar_contratacao()`.
 *
 * Existe porque a RLS não consegue filtrar elegibilidade: "já fez a
 * experimental" é histórico de presença, não dono de linha. Sem esta
 * chamada o catálogo oferece o que o banco vai recusar, e o aluno
 * descobre no clique.
 */
export async function listarRestricoesCatalogo() {
  const { data, error } = await requireSupabase().rpc('catalogo_do_aluno')
  if (error) throw error
  return data
}

/**
 * Contratar pelo portal cria um PEDIDO, não uma matrícula.
 *
 * Nada é liberado aqui: sem aprovação da gestão e sem pagamento
 * confirmado não existe matrícula, e portanto não existe crédito para
 * agendar. O aluno acompanha o pedido em “Meu plano”.
 */
export async function contratarPlano(args: {
  clienteId: string
  planoId: string
  /**
   * Turma fixa: as turmas escolhidas. O banco exige exatamente
   * `produtos.turmas_fixas` turmas distintas e confere a vaga de cada
   * uma ANTES de criar o pedido — não dá para pedir primeiro e escolher
   * depois, senão o pedido entraria na fila para ser recusado.
   */
  turmaIds?: string[]
}) {
  const { data, error } = await requireSupabase().rpc('solicitar_contratacao', {
    p_cliente: args.clienteId,
    p_produto: args.planoId,
    p_turmas: args.turmaIds ?? [],
  })
  if (error) throw error
  return data
}

/**
 * A grade como quem vai assinar um assento precisa vê-la.
 *
 * Não é `vw_grade_publica`: aqui vem a vaga calculada para a próxima
 * ocorrência de cada turma, somando assento fixo e reserva por crédito —
 * a MESMA conta que `validar_assento_fixo()` usa para aceitar ou recusar.
 * Era o furo da tela da equipe, que contava por conta própria e mostrava
 * vaga onde o banco ia recusar.
 */
export async function turmasParaAssentoFixo() {
  const { data, error } = await requireSupabase().rpc('turmas_para_assento_fixo', {})
  if (error) throw error
  return data ?? []
}

/**
 * A pausa do plano deste aluno, quando há uma em aberto.
 *
 * Em aberto = pedida, aprovada à espera da data, ou em curso. Pausa
 * encerrada não interessa a esta tela: o plano já voltou, e o histórico
 * quem lê é a equipe.
 */
export async function minhaPausa() {
  const { data, error } = await requireSupabase()
    .from('vw_pausas')
    .select('*')
    .in('status', ['solicitada', 'aprovada', 'ativa'])
    .order('inicio', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Pode pausar este plano, e por quantos dias.
 *
 * A conta é do banco (`direito_a_pausa`) e não da tela: o limite muda com
 * o formato do plano (15 dias no mensal, 30 no semestral, 90 com
 * atestado), com o intervalo desde a última pausa e com a situação da
 * matrícula. Replicar isso no front seria a segunda versão da regra.
 */
export async function direitoAPausa(matriculaId: string, atestado = false) {
  const { data, error } = await requireSupabase().rpc('direito_a_pausa', {
    p_matricula: matriculaId,
    p_tipo: atestado ? 'atestado' : 'regular',
  })
  if (error) throw error
  return data?.[0] ?? null
}

export async function solicitarPausa(args: {
  matriculaId: string
  inicio: string
  fim: string
  atestado?: boolean
  observacao?: string
}) {
  const { data, error } = await requireSupabase().rpc('solicitar_pausa', {
    p_matricula: args.matriculaId,
    p_inicio: args.inicio,
    p_fim: args.fim,
    p_tipo: args.atestado ? 'atestado' : 'regular',
    p_observacao: args.observacao,
  })
  if (error) throw error
  return data
}

/** Desistir da pausa, enquanto ela não começou. */
export async function desistirDaPausa(id: string) {
  const { error } = await requireSupabase().rpc('cancelar_pausa', { p_pausa: id })
  if (error) throw error
}

/**
 * Desistir do pedido.
 *
 * Existe porque a espera é longa: quem pede turma fixa fica dias
 * aguardando a confirmação da vaga, e sem esta saída a única forma de
 * mudar de ideia seria pedir à equipe. `cancelar_solicitacao()` já
 * aceitava o próprio aluno desde 24/09 — faltava o botão.
 */
export async function desistirDaSolicitacao(id: string) {
  const { error } = await requireSupabase().rpc('cancelar_solicitacao', {
    p_solicitacao: id,
  })
  if (error) throw error
}

/** O pedido em aberto do aluno, se houver — para “Meu plano” mostrar em que pé está. */
export async function minhaSolicitacaoAberta() {
  const { data, error } = await requireSupabase()
    .from('vw_solicitacoes')
    .select('*')
    .in('status', ['aguardando_aprovacao', 'aguardando_pagamento'])
    .order('solicitada_em', { ascending: false })
    .limit(1)
    .maybeSingle()
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

// ------------------------------------------------------------
// O convidado do semestral (regulamento 11.1)
// ------------------------------------------------------------

/**
 * Os convites deste aluno — abertos e encerrados.
 *
 * Por RPC e não por `vw_convidados`: a view faz join no cadastro do
 * convidado, que a RLS do portal esconde do titular (e com razão). Sob
 * `security_invoker` ela devolveria zero linhas aqui.
 */
export async function meusConvidados() {
  const { data, error } = await requireSupabase().rpc('meus_convidados')
  if (error) throw error
  return data ?? []
}

/** Este plano tem convidado disponível no ciclo corrente? */
export async function beneficioConvidado(matriculaId: string) {
  const { data, error } = await requireSupabase().rpc('beneficio_convidado', {
    p_matricula: matriculaId,
  })
  if (error) throw error
  return data?.[0] ?? null
}

/**
 * Indicar o convidado do ciclo.
 *
 * O banco é que recusa: plano ativo do convidado, carência de 6 meses,
 * benefício já usado, turma errada no dia e titular que não está naquela
 * aula. A tela não repete nenhuma dessas contas — mostra a mensagem.
 */
export async function indicarConvidado(args: {
  matriculaId: string
  nome: string
  telefone: string
  turmaId: string
  data: string
  email?: string
  observacao?: string
}) {
  const { data, error } = await requireSupabase().rpc('indicar_convidado', {
    p_matricula: args.matriculaId,
    p_nome: args.nome,
    p_telefone: args.telefone,
    p_turma: args.turmaId,
    p_data: args.data,
    p_email: args.email,
    p_observacao: args.observacao,
  })
  if (error) throw error
  return data
}

/**
 * Desistir do convite.
 *
 * Devolve `'beneficio_devolvido'` ou `'beneficio_consumido'` — a tela
 * avisa qual dos dois ANTES do clique, lendo `devolve_beneficio`.
 */
export async function desistirDoConvidado(id: string) {
  const { data, error } = await requireSupabase().rpc('cancelar_convidado', {
    p_convite: id,
  })
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// O abatimento da experimental (regulamento 10.1)
// ------------------------------------------------------------

/**
 * Quanto a experimental deste aluno abate do plano, e até quando.
 *
 * A conta é do banco (`abatimento_disponivel`): o valor é o que ele
 * efetivamente PAGOU pela experimental, e o prazo conta da experiência.
 * Quando não tem, vem o motivo — é esse texto que a tela mostra, para a
 * ausência do desconto não parecer defeito.
 */
export async function abatimentoDisponivel(clienteId: string) {
  const { data, error } = await requireSupabase().rpc('abatimento_disponivel', {
    p_cliente: clienteId,
  })
  if (error) throw error
  return data?.[0] ?? null
}
