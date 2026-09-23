import { requireSupabase } from '../../../lib/supabase'

/**
 * Assinaturas que a equipe precisa ver: ativas e inadimplentes.
 *
 * Inadimplente aparece de propósito — é justamente quem a equipe precisa
 * cobrar e depois renovar. Cancelada não: ela some da operação do dia e
 * continua no histórico do aluno.
 */
export async function listarMatriculas() {
  const { data, error } = await requireSupabase()
    .from('vw_saldo_creditos')
    .select('*')
    .in('status', ['ativa', 'inadimplente'])
    .order('data_fim')
  if (error) throw error
  return data
}

/**
 * Todos os assentos de turma fixa — vigentes, futuros e encerrados.
 *
 * Sem filtro de vigência porque as três categorias aparecem na tela:
 * o assento de hoje, o que já está agendado para a próxima renovação
 * (troca do 6.5) e o histórico de "onde essa pessoa treinava antes".
 * São poucas linhas por matrícula; filtrar aqui só obrigaria a uma
 * segunda consulta para o histórico.
 */
export async function listarMatriculaTurmas() {
  const { data, error } = await requireSupabase()
    .from('vw_matricula_turmas')
    .select('*')
    .order('inicio', { ascending: false })
  if (error) throw error
  return data
}

export async function listarTurmasDoCliente(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('vw_matricula_turmas')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('inicio', { ascending: false })
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// Contratação
//
// Duas RPCs distintas de propósito: `matricular` recusa produto de
// turma fixa e `matricular_turma_fixa` exige as turmas no mesmo ato.
// Não existe caminho que crie uma mensalidade de turma fixa sem
// assento — a trava é do banco, não desta camada.
// ------------------------------------------------------------

/**
 * `justificativa` só é aceita pelo banco quando quem chama é gestão e a
 * elegibilidade do produto recusou (§8 e §10 do regulamento). A venda
 * passa e a autorização fica gravada em `auditoria`.
 */
export async function matricular(
  clienteId: string,
  produtoId: string,
  justificativa?: string,
) {
  const { data, error } = await requireSupabase().rpc('matricular', {
    p_cliente: clienteId,
    p_plano: produtoId,
    p_justificativa: justificativa,
  })
  if (error) throw error
  return data
}

export async function matricularTurmaFixa(
  clienteId: string,
  produtoId: string,
  turmaIds: string[],
  justificativa?: string,
) {
  const { data, error } = await requireSupabase().rpc('matricular_turma_fixa', {
    p_cliente: clienteId,
    p_produto: produtoId,
    p_turmas: turmaIds,
    p_justificativa: justificativa,
  })
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// Ciclo de vida da assinatura
// ------------------------------------------------------------

export async function renovarCiclo(matriculaId: string) {
  const { error } = await requireSupabase().rpc('renovar_ciclo', { p_matricula: matriculaId })
  if (error) throw error
}

export async function marcarInadimplente(matriculaId: string) {
  const { error } = await requireSupabase().rpc('marcar_inadimplente', {
    p_matricula: matriculaId,
  })
  if (error) throw error
}

// ------------------------------------------------------------
// Pedidos de cancelamento vindos do portal (regulamento 7.1)
// ------------------------------------------------------------

/**
 * Pedidos em aberto, do mais antigo para o mais novo — o mais antigo é o
 * que está mais perto do prazo. O contato vem junto porque a equipe
 * costuma responder pelo WhatsApp antes de confirmar.
 */
export async function listarSolicitacoesPendentes() {
  const { data, error } = await requireSupabase()
    .from('solicitacoes_cancelamento')
    .select('*, clientes(nome, telefone, email)')
    .eq('status', 'pendente')
    .order('solicitada_em')
  if (error) throw error
  return data
}

/** Encerra a assinatura na data que as regras deram ao pedido. Só gestão. */
export async function confirmarCancelamentoPlano(solicitacaoId: string, observacao?: string) {
  const { data, error } = await requireSupabase().rpc('confirmar_cancelamento_plano', {
    p_solicitacao: solicitacaoId,
    ...(observacao?.trim() ? { p_observacao: observacao.trim() } : {}),
  })
  if (error) throw error
  return data
}

/** Arquiva sem cancelar (o aluno desistiu, ou foi resolvido por fora). */
export async function arquivarSolicitacaoCancelamento(solicitacaoId: string, observacao?: string) {
  const { error } = await requireSupabase().rpc('retirar_solicitacao_cancelamento', {
    p_solicitacao: solicitacaoId,
    ...(observacao?.trim() ? { p_observacao: observacao.trim() } : {}),
  })
  if (error) throw error
}

export async function cancelarAssinatura(matriculaId: string, motivo?: string) {
  const { data, error } = await requireSupabase().rpc('cancelar_assinatura', {
    p_matricula: matriculaId,
    ...(motivo ? { p_motivo: motivo } : {}),
  })
  if (error) throw error
  return data
}

/**
 * Bonificar a aluna com créditos — cortesia ou reposição.
 *
 * O motivo é obrigatório no BANCO, não só aqui: ele vai para o extrato
 * que a aluna enxerga, e "+2 créditos" sem explicação é o lançamento
 * que ninguém consegue justificar depois.
 *
 * `validade` é opcional e, omitida, o banco usa o fim do ciclo. Só que
 * ele **recusa** a omissão quando o ciclo já venceu — caso real (bônus
 * para quem sumiu), em que o padrão nasceria morto. A tela manda a data
 * sempre preenchida para que esse erro não chegue à equipe.
 */
export async function concederCreditos(a: {
  matriculaId: string
  quantidade: number
  motivo: string
  validade?: string
  origem?: 'ajuste' | 'reposicao'
}) {
  const { data, error } = await requireSupabase().rpc('conceder_creditos', {
    p_matricula: a.matriculaId,
    p_quantidade: a.quantidade,
    p_motivo: a.motivo,
    ...(a.validade ? { p_validade: a.validade } : {}),
    ...(a.origem ? { p_origem: a.origem } : {}),
  })
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// Assentos de turma fixa
// ------------------------------------------------------------

/** Regulamento 6.3: a segunda turma entra valendo na hora. */
export async function adicionarTurmaFixa(matriculaId: string, turmaId: string) {
  const { data, error } = await requireSupabase().rpc('adicionar_turma_fixa', {
    p_matricula: matriculaId,
    p_turma: turmaId,
  })
  if (error) throw error
  return data
}

/**
 * Regulamento 6.5/6.6: a troca vale a partir da próxima renovação.
 * `imediato` existe para o caso de a turma acabar ou de erro de
 * cadastro — é escolha consciente de quem clica, não o padrão.
 */
export async function trocarTurmaFixa(
  vinculoId: string,
  turmaNovaId: string,
  imediato = false,
) {
  const { data, error } = await requireSupabase().rpc('trocar_turma_fixa', {
    p_vinculo: vinculoId,
    p_turma_nova: turmaNovaId,
    p_imediato: imediato,
  })
  if (error) throw error
  return data
}

/** Regulamento 6.4: reduzir de 2 turmas para 1 vale na próxima renovação. */
export async function encerrarTurmaFixa(
  vinculoId: string,
  opcoes: { imediato?: boolean; motivo?: string } = {},
) {
  const { data, error } = await requireSupabase().rpc('encerrar_turma_fixa', {
    p_vinculo: vinculoId,
    p_imediato: opcoes.imediato ?? false,
    ...(opcoes.motivo ? { p_motivo: opcoes.motivo } : {}),
  })
  if (error) throw error
  return data
}

/**
 * Quantos assentos fixos cada turma já tem tomados na próxima
 * ocorrência dela. É o que permite o seletor de turma dizer "3/10
 * ocupadas" e desabilitar a turma cheia ANTES do clique — a recusa
 * definitiva continua sendo do banco.
 */
export async function listarOcupacaoAssentos() {
  const { data, error } = await requireSupabase()
    .from('vw_matricula_turmas')
    .select('turma_id, capacidade, vigente, futuro')
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// Histórico da matrícula
// ------------------------------------------------------------

export type EventoHistorico = {
  id: string
  quando: string
  tipo: 'credito' | 'financeiro'
  titulo: string
  detalhe: string | null
  valor: number | null
}

/**
 * A linha do tempo da matrícula: o que aconteceu com os créditos e o que
 * aconteceu com o dinheiro, numa lista só.
 *
 * São duas tabelas porque são dois assuntos (`creditos_eventos` e
 * `entradas_financeiras`), mas para quem atende no balcão é uma pergunta
 * só — "o que houve com essa aluna?". Juntar no cliente evita criar uma
 * view só para ordenar duas listas pequenas por data.
 */
export async function listarHistoricoMatricula(matriculaId: string) {
  const sb = requireSupabase()
  const [creditos, financeiro] = await Promise.all([
    sb
      .from('creditos_eventos')
      .select('id, criado_em, delta, motivo, detalhe')
      .eq('matricula_id', matriculaId)
      .order('criado_em', { ascending: false })
      .limit(50),
    sb
      .from('entradas_financeiras')
      .select('id, criada_em, descricao, valor_centavos, status, data_caixa')
      .eq('matricula_id', matriculaId)
      .order('criada_em', { ascending: false })
      .limit(50),
  ])
  if (creditos.error) throw creditos.error
  // Secretária não enxerga entradas_financeiras (RLS de gestão): a lista
  // volta vazia em vez de estourar, e o histórico mostra só os créditos.
  const linhas: EventoHistorico[] = [
    ...(creditos.data ?? []).map((c) => ({
      id: c.id,
      quando: c.criado_em,
      tipo: 'credito' as const,
      titulo: `${c.delta > 0 ? '+' : ''}${c.delta} crédito${Math.abs(c.delta) === 1 ? '' : 's'} · ${c.motivo}`,
      detalhe: c.detalhe,
      valor: null,
    })),
    ...(financeiro.error ? [] : (financeiro.data ?? [])).map((e) => ({
      id: e.id,
      quando: e.criada_em,
      tipo: 'financeiro' as const,
      titulo: e.descricao ?? 'Cobrança',
      detalhe: e.status === 'recebida' ? `recebida${e.data_caixa ? ` em ${e.data_caixa}` : ''}` : e.status,
      valor: e.valor_centavos,
    })),
  ]
  return linhas.sort((a, b) => b.quando.localeCompare(a.quando))
}
