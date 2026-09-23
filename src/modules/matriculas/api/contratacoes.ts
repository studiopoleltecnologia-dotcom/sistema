import { requireSupabase } from '../../../lib/supabase'
import type { Tables } from '../../../lib/database.types'

export type Solicitacao = Tables<'vw_solicitacoes'>
export type StatusSolicitacao = NonNullable<Solicitacao['status']>

/**
 * Contratar deixou de ser um clique que já matricula.
 *
 * `solicitar_contratacao()` cria o pedido e **não** cria matrícula nem
 * libera crédito — isso só acontece em `confirmar_pagamento_contratacao()`.
 * Entre um e outro o aluno aparece na fila de aprovações, não na lista de
 * matriculados.
 *
 * Quando quem chama já é gestão, o banco aprova no mesmo passo (um
 * clique na recepção), e mesmo assim grava quem autorizou.
 */
export async function solicitarContratacao(args: {
  clienteId: string
  produtoId: string
  turmaIds?: string[]
  justificativa?: string
}) {
  const { data, error } = await requireSupabase().rpc('solicitar_contratacao', {
    p_cliente: args.clienteId,
    p_produto: args.produtoId,
    p_turmas: args.turmaIds ?? [],
    p_justificativa: args.justificativa,
  })
  if (error) throw error
  return data
}

export async function listarSolicitacoes(status?: StatusSolicitacao[]) {
  let q = requireSupabase()
    .from('vw_solicitacoes')
    .select('*')
    .order('solicitada_em', { ascending: false })
  if (status?.length) q = q.in('status', status)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function aprovarContratacao(id: string, motivo?: string) {
  const { data, error } = await requireSupabase().rpc('aprovar_contratacao', {
    p_solicitacao: id,
    p_motivo: motivo,
  })
  if (error) throw error
  return data
}

export async function recusarContratacao(id: string, motivo: string) {
  const { error } = await requireSupabase().rpc('recusar_contratacao', {
    p_solicitacao: id,
    p_motivo: motivo,
  })
  if (error) throw error
}

/**
 * Baixa manual: dinheiro, Pix na chave, maquininha. É a mesma função que
 * o webhook do gateway vai chamar — o fluxo não fica esperando a
 * integração para funcionar.
 */
export async function confirmarPagamento(id: string, forma: string) {
  const { data, error } = await requireSupabase().rpc('confirmar_pagamento_contratacao', {
    p_solicitacao: id,
    p_forma: forma,
  })
  if (error) throw error
  return data
}

export async function cancelarSolicitacao(id: string) {
  const { error } = await requireSupabase().rpc('cancelar_solicitacao', {
    p_solicitacao: id,
  })
  if (error) throw error
}

/**
 * Emite a cobrança no gateway e devolve o link de pagamento.
 *
 * Primeiro uso de Edge Function pelo front. É função e não RPC porque a
 * chave do Asaas não pode chegar ao navegador (CLAUDE.md §3): quem fala
 * com a API deles é o servidor, e o front só pede e recebe a URL.
 *
 * A função é idempotente do lado de lá: se já existir cobrança em
 * aberto para a solicitação, ela devolve o link que já existe em vez de
 * emitir uma segunda — duas cobranças do mesmo plano é o erro que o
 * aluno percebe.
 */
export async function emitirCobranca(solicitacaoId: string) {
  const { data, error } = await requireSupabase().functions.invoke('asaas-cobranca', {
    body: { solicitacao_id: solicitacaoId },
  })
  if (error) {
    // `FunctionsHttpError` guarda o corpo da resposta, que é onde está a
    // mensagem útil ("aluno está sem CPF"). Sem isto, a tela mostraria
    // só "Edge Function returned a non-2xx status code".
    const resposta = (error as { context?: Response }).context
    if (resposta) {
      try {
        const corpo = await resposta.json()
        if (corpo?.erro) throw new Error(corpo.erro)
      } catch (e) {
        if (e instanceof Error && e.message) throw e
      }
    }
    throw error
  }
  return data as { cobranca_id: string; url: string; vencimento: string; ja_existia?: boolean }
}
