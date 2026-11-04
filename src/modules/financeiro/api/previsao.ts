import { requireSupabase } from '../../../lib/supabase'
import type { Periodo } from '../periodo'
import { limitesDoPeriodo } from '../periodo'

/**
 * A previsão de receita de mensalidade, lida do Asaas.
 *
 * Desde 04/11/2026 a previsão sai do GATEWAY, não das matrículas: é ele
 * que cobra, então é a conta dele que vale. Quem conversa com o Asaas é
 * a Edge Function `asaas-previsao` (a chave não pode vir ao front — repo
 * público, §3); aqui só se lê o espelho `previsoes_asaas` e se edita por
 * RPC.
 *
 * As linhas NÃO são entradas financeiras: não entram no caixa, no teto
 * MEI nem na fila de cobranças a emitir. Quando o dinheiro cai de
 * verdade, o webhook do Asaas cria a entrada e a linha de previsão
 * desaparece na sincronização seguinte.
 */

export type LinhaPrevisao = {
  id: string
  ref: string
  tipo: 'cobranca' | 'assinatura'
  cliente_id: string | null
  asaas_customer_id: string
  nome: string | null
  sem_vinculo: boolean
  vencimento: string
  mes: string
  valor_centavos: number
  descricao: string | null
  editada: boolean
  oculto: boolean
  fora_do_gateway: boolean
  sincronizado_em: string
}

export type SyncPrevisao = {
  ultima_em: string | null
  resultado: Record<string, number> | null
}

/** Tudo o que o gateway prevê, da data mais próxima para a mais distante. */
export async function listarPrevisao() {
  const { data, error } = await requireSupabase()
    .from('vw_previsao_asaas')
    .select('*')
    .order('vencimento')
  if (error) throw error
  return (data ?? []) as unknown as LinhaPrevisao[]
}

/**
 * Só o pedaço do período que a tela de Entradas mostra.
 *
 * Entradas recorta por mês; a previsão precisa obedecer ao mesmo recorte,
 * senão dezembro mostraria a previsão de março.
 */
export async function listarPrevisaoDoPeriodo(periodo: Periodo) {
  const { inicio, fim } = limitesDoPeriodo(periodo)
  const { data, error } = await requireSupabase()
    .from('vw_previsao_asaas')
    .select('*')
    .gte('vencimento', inicio)
    .lte('vencimento', fim)
    .order('vencimento')
  if (error) throw error
  return (data ?? []) as unknown as LinhaPrevisao[]
}

export async function lerSyncPrevisao(): Promise<SyncPrevisao> {
  const { data, error } = await requireSupabase()
    .from('previsoes_asaas_sync')
    .select('ultima_em, resultado')
    .maybeSingle()
  if (error) throw error
  return (data ?? { ultima_em: null, resultado: null }) as SyncPrevisao
}

/**
 * Editar uma linha. Campo ausente = não mexer nele.
 *
 * Toda edição passa pela RPC porque é ela que marca `editado_em` — a
 * marca que impede o cron da noite de desfazer a correção da manhã.
 */
export async function editarPrevisao(
  id: string,
  patch: {
    valor_centavos?: number
    vencimento?: string
    descricao?: string | null
    oculto?: boolean
  },
) {
  const { error } = await requireSupabase().rpc('editar_previsao_asaas', {
    p_id: id,
    p_valor_centavos: patch.valor_centavos ?? null,
    p_vencimento: patch.vencimento ?? null,
    p_descricao: patch.descricao ?? null,
    p_oculto: patch.oculto ?? null,
  })
  if (error) throw error
}

/** Desfaz a edição: a linha volta a seguir o Asaas. */
export async function redefinirPrevisao(id: string) {
  const { error } = await requireSupabase().rpc('redefinir_previsao_asaas', { p_id: id })
  if (error) throw error
}

/** Liga a linha a um aluno do cadastro (e grava o id do gateway nele). */
export async function vincularPrevisao(id: string, clienteId: string) {
  const { error } = await requireSupabase().rpc('vincular_previsao_cliente', {
    p_id: id,
    p_cliente: clienteId,
  })
  if (error) throw error
}

/**
 * Pede ao Asaas a previsão agora, sem esperar o cron das 8h.
 *
 * A função devolve 503 quando o ambiente não tem a chave (o DEV, de
 * propósito) e 502 quando o gateway está fora do ar — nos dois casos a
 * tabela fica como estava, e a mensagem precisa chegar à tela em vez de
 * virar "previsão vazia".
 */
export async function sincronizarPrevisao() {
  const { data, error } = await requireSupabase().functions.invoke('asaas-previsao', {
    body: { modo: 'manual' },
  })
  if (error) {
    // `FunctionsHttpError` guarda o corpo da resposta, e é ali que está
    // a mensagem útil ("ASAAS_API_KEY ausente neste ambiente").
    const resposta = (error as { context?: Response }).context
    if (resposta) {
      try {
        const corpo = await resposta.json()
        if (corpo?.erro) throw new Error(String(corpo.erro))
      } catch {
        /* corpo ilegível: fica a mensagem genérica abaixo */
      }
    }
    throw error
  }
  return data as { ok?: boolean; linhas_enviadas?: number; resultado?: Record<string, number> }
}
