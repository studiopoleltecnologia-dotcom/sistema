import { requireSupabase } from '../../../lib/supabase'
import type { Tables } from '../../../lib/database.types'

/**
 * Contrato de Adesão e PAR-Q — os dois documentos da contratação.
 *
 * Ficam num arquivo próprio, e não em `portalAluna.ts`, porque não são
 * operação: são prova. Toda função aqui ou lê um documento congelado ou
 * registra um aceite, e nenhuma delas monta texto no front — o HTML vem
 * do banco, montado por `montar_contrato()`, para o que o aluno lê ser
 * exatamente o que fica gravado.
 */

export type PerguntaParq = Tables<'parq_perguntas'>
export type VersaoParq = Tables<'parq_versoes'>

/** Uma resposta do questionário, no formato que `responder_parq` espera. */
export type RespostaParq = {
  pergunta_id: string
  ordem: number
  texto: string
  resposta: boolean
}

// ------------------------------------------------------------
// Contrato
// ------------------------------------------------------------

/**
 * O contrato desta contratação, montado agora, com apenas as cláusulas
 * do produto escolhido.
 *
 * É a PRÉVIA: idêntica ao texto que o aceite congela, exceto a linha de
 * registro ("no momento do aceite" vira a data e hora reais). Por isso
 * não há montagem no front — duas montagens divergiriam no primeiro
 * ajuste de texto.
 */
export async function montarContrato(solicitacaoId: string) {
  const { data, error } = await requireSupabase()
    .rpc('montar_contrato', { p_solicitacao: solicitacaoId })
    .single()
  if (error) throw error
  return data
}

/**
 * Registra o aceite. `versaoId` é a versão que apareceu na tela: se a
 * gestão publicar outra enquanto o aluno lê, o banco recusa e pede para
 * reabrir — aceitar texto diferente do exibido é exatamente o que o
 * modelo existe para impedir.
 */
export async function aceitarContrato(args: {
  solicitacaoId: string
  versaoId: string
  formaPagamento?: string | null
}) {
  const { data, error } = await requireSupabase().rpc('aceitar_contrato', {
    p_solicitacao: args.solicitacaoId,
    p_versao: args.versaoId,
    p_forma_pagamento: args.formaPagamento ?? undefined,
  })
  if (error) throw error
  return data
}

/**
 * Pede ao gateway o link de pagamento desta contratação.
 *
 * É Edge Function e não RPC porque a chave do Asaas não pode chegar ao
 * navegador (CLAUDE.md §3). A função é idempotente: contratação que já
 * tem cobrança em aberto recebe o link que existe, em vez de uma segunda
 * cobrança — duas cobranças do mesmo plano é o erro que o aluno percebe.
 *
 * O aluno só consegue emitir a dele, e só de produto de política
 * automática; o banco ainda recusa emitir sem contrato aceito.
 */
export async function pedirLinkDePagamento(solicitacaoId: string) {
  const { data, error } = await requireSupabase().functions.invoke('asaas-cobranca', {
    body: { solicitacao_id: solicitacaoId },
  })
  if (error) {
    // `FunctionsHttpError` guarda o corpo da resposta, que é onde está a
    // mensagem útil. Sem isto o aluno leria "Edge Function returned a
    // non-2xx status code".
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
  return data as { url?: string; cobranca_id?: string; ja_existia?: boolean }
}

/** Histórico de contratos do aluno — sem o corpo, que é grande. */
export async function listarMeusContratos() {
  const { data, error } = await requireSupabase().rpc('meus_contratos')
  if (error) throw error
  return data
}

/** O texto congelado de um contrato aceito, para "Visualizar contrato". */
export async function obterContrato(id: string) {
  const { data, error } = await requireSupabase()
    .from('contratos')
    .select('id, versao, aceito_em, corpo_html, resumo, valor_centavos, forma_pagamento')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// PAR-Q
// ------------------------------------------------------------

/** A versão vigente do questionário, com o aviso e o Termo. */
export async function obterVersaoParq() {
  const { data, error } = await requireSupabase()
    .from('parq_versoes')
    .select('*')
    .eq('vigente', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listarPerguntasParq(versaoId: string) {
  const { data, error } = await requireSupabase()
    .from('parq_perguntas')
    .select('*')
    .eq('versao_id', versaoId)
    .order('ordem')
  if (error) throw error
  return data
}

/**
 * Em que pé está o PAR-Q deste aluno. Devolve só o veredito e a
 * mensagem — nenhuma resposta de saúde trafega por aqui, mesmo sendo o
 * próprio aluno, porque é a mesma função que o fluxo de reserva chama.
 */
export async function obterSituacaoParq(clienteId: string) {
  const { data, error } = await requireSupabase()
    .rpc('parq_situacao', { p_cliente: clienteId })
    .maybeSingle()
  if (error) throw error
  return data
}

export async function responderParq(args: {
  respostas: RespostaParq[]
  aceitaTermo: boolean
  observacoes?: string | null
  responsavel?: { nome: string; cpf: string; vinculo: string } | null
}) {
  const { data, error } = await requireSupabase().rpc('responder_parq', {
    p_respostas: args.respostas,
    p_aceita_termo: args.aceitaTermo,
    p_observacoes: args.observacoes ?? undefined,
    p_responsavel_nome: args.responsavel?.nome ?? undefined,
    p_responsavel_cpf: args.responsavel?.cpf ?? undefined,
    p_responsavel_vinculo: args.responsavel?.vinculo ?? undefined,
  })
  if (error) throw error
  return data
}

/**
 * Sobe o atestado para o bucket privado e registra.
 *
 * O arquivo NÃO vai para bucket público: é documento de saúde. O caminho
 * começa com o id do cliente para a policy do Storage poder recortar por
 * dono sem precisar consultar outra tabela.
 */
export async function enviarAtestado(args: {
  respostaId: string
  clienteId: string
  arquivo: File
  emitidoEm?: string | null
}) {
  const sb = requireSupabase()
  const ext = args.arquivo.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const path = `${args.clienteId}/${Date.now()}.${ext}`

  const { error: erroUpload } = await sb.storage
    .from('atestados')
    .upload(path, args.arquivo, { upsert: false, contentType: args.arquivo.type })
  if (erroUpload) throw erroUpload

  const { data, error } = await sb.rpc('enviar_atestado_parq', {
    p_resposta: args.respostaId,
    p_arquivo_path: path,
    p_arquivo_nome: args.arquivo.name,
    p_emitido_em: args.emitidoEm ?? undefined,
  })
  if (error) throw error
  return data
}

/** Atestados já enviados, para o aluno ver em que pé está cada um. */
export async function listarMeusAtestados(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('parq_documentos')
    .select('id, arquivo_nome, enviado_em, emitido_em, aprovado, avaliado_em, motivo, valido_ate')
    .eq('cliente_id', clienteId)
    .order('enviado_em', { ascending: false })
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// Autorização de imagem
// ------------------------------------------------------------

/**
 * Preferência separada do contrato, de propósito: consentimento embutido
 * em aceite obrigatório não é consentimento livre, e o regulamento 11.4
 * promete que é revogável a qualquer momento.
 */
export async function definirAutorizacaoImagem(autoriza: boolean) {
  const { error } = await requireSupabase().rpc('definir_autorizacao_imagem', {
    p_autoriza: autoriza,
  })
  if (error) throw error
}
