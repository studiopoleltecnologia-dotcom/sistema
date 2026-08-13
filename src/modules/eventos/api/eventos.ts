import { requireSupabase } from '../../../lib/supabase'
import { EVENTO_PICNIC } from '../types'

/**
 * Inscrições da edição, pendentes primeiro — a tela existe para conferir
 * pagamento, então quem falta é o que precisa aparecer no topo.
 */
export async function listarInscricoes(evento: string = EVENTO_PICNIC) {
  const { data, error } = await requireSupabase()
    .from('inscricoes_evento')
    .select('*')
    .eq('evento', evento)
    .order('pago', { ascending: true })
    .order('criado_em', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Único caminho de escrita: o UPDATE direto foi revogado de `authenticated`
 * na migration 20260813120000. Quem confirmou e quando é carimbado pelo
 * banco a partir de auth.uid() — não é enviado daqui, justamente para não
 * poder ser escolhido por quem chama.
 */
export async function confirmarPagamento(args: {
  id: string
  confirmado: boolean
  observacao?: string | null
}) {
  const { error } = await requireSupabase().rpc('confirmar_pagamento_inscricao', {
    p_inscricao: args.id,
    p_confirmado: args.confirmado,
    ...(args.observacao ? { p_observacao: args.observacao } : {}),
  })
  if (error) throw error
}
