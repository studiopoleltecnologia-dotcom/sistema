import { requireSupabase } from '../../../lib/supabase'
import { adicionarInteracao } from '../../clientes/api/clientes'
import { TIPO_FOLLOWUP_LABEL, type FollowupComCliente, type TipoFollowup } from '../types'

export async function listarPendencias() {
  const { data, error } = await requireSupabase()
    .from('followups')
    .select('*, cliente:clientes(*)')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true })
  if (error) throw error
  // VIPs primeiro (cadência personalizada, docs/01-NEGOCIO.md seção 6)
  return (data as FollowupComCliente[]).sort(
    (a, b) => Number(b.cliente.vip) - Number(a.cliente.vip),
  )
}

/** Roda o gerador no banco (mesma função do cron diário). */
export async function gerarAgora() {
  const { data, error } = await requireSupabase().rpc('gerar_followups')
  if (error) throw error
  return data
}

async function resolver(id: string, status: 'concluido' | 'dispensado') {
  const sb = requireSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('followups')
    .update({
      status,
      resolvido_em: new Date().toISOString(),
      resolvido_por: auth.user?.id ?? null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * "Feito": conclui a pendência e registra a interação no CRM —
 * que por sua vez atualiza a "última conversa" da cliente.
 */
export async function concluirPendencia(pendencia: {
  id: string
  cliente_id: string
  tipo: TipoFollowup
}) {
  const resolvido = await resolver(pendencia.id, 'concluido')
  await adicionarInteracao({
    cliente_id: pendencia.cliente_id,
    tipo: 'whatsapp',
    descricao: `Follow-up feito: ${TIPO_FOLLOWUP_LABEL[pendencia.tipo]}`,
  })
  return resolvido
}

export async function dispensarPendencia(id: string) {
  return resolver(id, 'dispensado')
}

export async function listarRegras() {
  const { data, error } = await requireSupabase()
    .from('followup_regras')
    .select('*')
    .order('tipo')
  if (error) throw error
  return data
}

export async function atualizarRegra(
  tipo: TipoFollowup,
  patch: { dias?: number; ativa?: boolean },
) {
  const { data, error } = await requireSupabase()
    .from('followup_regras')
    .update(patch)
    .eq('tipo', tipo)
    .select()
    .single()
  if (error) throw error
  return data
}
