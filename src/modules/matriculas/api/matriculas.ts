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

export async function matricular(clienteId: string, produtoId: string) {
  const { data, error } = await requireSupabase().rpc('matricular', {
    p_cliente: clienteId,
    p_plano: produtoId,
  })
  if (error) throw error
  return data
}

export async function matricularTurmaFixa(
  clienteId: string,
  produtoId: string,
  turmaIds: string[],
) {
  const { data, error } = await requireSupabase().rpc('matricular_turma_fixa', {
    p_cliente: clienteId,
    p_produto: produtoId,
    p_turmas: turmaIds,
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

export async function cancelarAssinatura(matriculaId: string, motivo?: string) {
  const { data, error } = await requireSupabase().rpc('cancelar_assinatura', {
    p_matricula: matriculaId,
    ...(motivo ? { p_motivo: motivo } : {}),
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
