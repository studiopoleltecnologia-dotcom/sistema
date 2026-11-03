import { requireSupabase } from '../../../lib/supabase'

/**
 * Documentos de um aluno, para a ficha da gestão: contratos aceitos,
 * PAR-Q e atestados.
 *
 * Tudo aqui é **leitura de prova**, não operação — e por isso nada nesta
 * camada monta ou reescreve documento. O contrato vem do `corpo_html`
 * congelado na linha; o PAR-Q vem por `ler_parq()`, que registra o acesso
 * em `parq_acessos` (dado de saúde é categoria especial na LGPD, e o
 * apêndice do PAR-Q pede o registro).
 */

/** Contratos aceitos por este aluno, do mais recente para o mais antigo. */
export async function listarContratosDoCliente(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('contratos')
    // O nome do produto sai do `resumo` congelado, e não de um join com
    // `produtos`: é o nome que valia no aceite. Produto renomeado depois
    // não reescreve o que a pessoa assinou.
    // Numa linha só, e não concatenado: o cliente tipado infere a forma
    // da linha a partir do literal, e um `+` no meio faz o tipo virar
    // `GenericStringError` — todo acesso a coluna passa a não compilar.
    .select('id, versao, aceito_em, valor_centavos, forma_pagamento, tags, hash_corpo, matricula_id, provider_ref, resumo, produto_id')
    .eq('cliente_id', clienteId)
    .order('aceito_em', { ascending: false })
  if (error) throw error
  return data
}

/** O texto exato de um contrato aceito. */
export async function obterCorpoContrato(id: string) {
  const { data, error } = await requireSupabase()
    .from('contratos')
    .select('id, versao, aceito_em, corpo_html, hash_corpo, ip, user_agent')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/** Situação do PAR-Q — sem resposta nenhuma, para a lista. */
export async function obterSituacaoParqDoCliente(clienteId: string) {
  const { data, error } = await requireSupabase()
    .rpc('parq_situacao', { p_cliente: clienteId })
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * As respostas de saúde. Passa por `ler_parq()` de propósito: a função
 * grava quem abriu em `parq_acessos`. Um `select` direto na tabela
 * funcionaria (a policy de gestão permite) e não deixaria rastro.
 */
export async function lerParq(respostaId: string) {
  const { data, error } = await requireSupabase()
    .rpc('ler_parq', { p_resposta: respostaId })
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listarAtestadosDoCliente(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('parq_documentos')
    .select('id, resposta_id, arquivo_nome, arquivo_path, emitido_em, enviado_em, aprovado, avaliado_em, motivo, valido_ate')
    .eq('cliente_id', clienteId)
    .order('enviado_em', { ascending: false })
  if (error) throw error
  return data
}

/**
 * URL assinada para abrir o atestado.
 *
 * O bucket é privado: não existe link permanente. A assinatura vale
 * poucos minutos — o suficiente para a gestão olhar, não para o endereço
 * circular por WhatsApp.
 */
export async function urlDoAtestado(path: string) {
  const { data, error } = await requireSupabase()
    .storage.from('atestados')
    .createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

export async function avaliarAtestado(args: {
  documentoId: string
  aprovado: boolean
  motivo?: string | null
  validoAte?: string | null
}) {
  const { error } = await requireSupabase().rpc('avaliar_atestado_parq', {
    p_documento: args.documentoId,
    p_aprovado: args.aprovado,
    p_motivo: args.motivo ?? undefined,
    p_valido_ate: args.validoAte ?? undefined,
  })
  if (error) throw error
}

/**
 * Atestados esperando a gestão, de todos os alunos.
 *
 * É a fila de trabalho: sem ela, um atestado enviado numa sexta à noite
 * só é descoberto quando alguém abre a ficha daquele aluno por outro
 * motivo.
 */
export async function listarAtestadosPendentes() {
  const { data, error } = await requireSupabase()
    .from('parq_documentos')
    .select('id, cliente_id, arquivo_nome, arquivo_path, emitido_em, enviado_em')
    .is('aprovado', null)
    .order('enviado_em')
  if (error) throw error
  if (!data || data.length === 0) return []

  // O nome do aluno vem numa segunda consulta, e não por join embutido:
  // `parq_documentos` não declara relacionamento nos tipos gerados, e o
  // join tipado viria como erro em vez de linha.
  const sb = requireSupabase()
  const { data: nomes } = await sb
    .from('clientes')
    .select('id, nome')
    .in('id', data.map((d) => d.cliente_id))
  const porId = new Map((nomes ?? []).map((c) => [c.id, c.nome]))
  return data.map((d) => ({ ...d, cliente_nome: porId.get(d.cliente_id) ?? '—' }))
}
