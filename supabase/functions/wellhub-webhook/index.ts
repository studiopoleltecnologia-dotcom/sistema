// ============================================================
// Webhook de check-in Wellhub — modelo Automated Trigger
// (CLAUDE.md 12.3/12.4). PRONTO PARA ATIVAR, ainda não deployado.
//
// Credenciais de SANDBOX recebidas (jul/2026): gym_id 548 + api_key (Bearer
// de teste). IP fixo NÃO é necessário. A Wellhub recomenda UMA única URL de
// webhook para todos os eventos (checkin + booking). Autenticação da chamada
// à Access Control API no sandbox: usar o api_key como `Authorization: Bearer`
// (em produção, trocar pelo OAuth client-credentials → token curto).
//
// Ativação do webhook (fluxo confirmado pela Wellhub):
//   desenvolve local → Wellhub envia o Bearer de acesso às APIs → o parceiro
//   responde com a URL do webhook + o secret do X-Gympass-Signature.
//
//   1. supabase secrets set WELLHUB_WEBHOOK_SECRET=<secret gerado por nós>
//      (esse é o secret que assina o X-Gympass-Signature; nós o informamos
//       à Wellhub — NÃO é fornecido por eles)
//   2. supabase secrets set WELLHUB_API_TOKEN=<Bearer sandbox/produção>
//   3. supabase functions deploy wellhub-webhook --no-verify-jwt
//   4. Registrar a URL no Portal/time Wellhub:
//      https://fgvxhwpqsxohqrccrlfn.supabase.co/functions/v1/wellhub-webhook
//   5. Trocar a validação abaixo por HMAC de X-Gympass-Signature conforme a
//      doc oficial (algoritmo/encoding a confirmar na homologação — o payload
//      real é logado integralmente para facilitar o mapeamento de campos).
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  // Validação de origem (PLACEHOLDER): comparação de segredo em header até a
  // homologação. A mecânica oficial é HMAC no header X-Gympass-Signature com o
  // WELLHUB_WEBHOOK_SECRET — trocar por verificação de assinatura antes do go-live.
  const segredo = Deno.env.get('WELLHUB_WEBHOOK_SECRET')
  if (!segredo || req.headers.get('x-webhook-secret') !== segredo) {
    return new Response('unauthorized', { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return new Response('invalid json', { status: 400 })
  }

  // Payload integral nos logs p/ mapear os campos reais na homologação.
  console.log('wellhub-webhook payload:', JSON.stringify(payload))

  // Campos prováveis (ajustar na homologação): gympass_id da aluna.
  const user = payload.user as Record<string, unknown> | undefined
  const gympassId = String(
    user?.unique_token ?? user?.gympass_id ?? payload.gympass_id ?? '',
  )
  if (!gympassId) {
    console.warn('check-in sem gympass_id identificável')
    return new Response('ok (sem gympass_id)', { status: 200 })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: cliente } = await sb
    .from('clientes')
    .select('id, nome')
    .eq('gympass_id', gympassId)
    .maybeSingle()

  if (!cliente) {
    // Aluna Wellhub nova: não travar o check-in (CLAUDE.md 12.5) —
    // cadastrar automaticamente com origem wellhub.
    console.log(`gympass_id ${gympassId} sem cliente — criando cadastro`)
    const nome = String(user?.name ?? `Aluna Wellhub ${gympassId}`)
    const { data: nova, error } = await sb
      .from('clientes')
      .insert({ nome, origem: 'wellhub', estagio: 'ativa', gympass_id: gympassId })
      .select('id, nome')
      .single()
    if (error) {
      console.error('erro ao criar cliente:', error.message)
      return new Response('ok (erro interno registrado)', { status: 200 })
    }
    return await registrarCheckin(sb, nova.id)
  }

  return await registrarCheckin(sb, cliente.id)
})

/**
 * Marca presença na turma em andamento (ou prestes a começar).
 * A presença dispara sozinha, via triggers do banco: ultima_aula da
 * cliente + entrada financeira "a reconciliar".
 */
async function registrarCheckin(
  sb: ReturnType<typeof createClient>,
  clienteId: string,
): Promise<Response> {
  const agora = new Date()
  // fuso do estúdio (BRT = UTC-3) para casar dia da semana e horário
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  const hoje = brt.toISOString().slice(0, 10)
  const diaSemana = brt.getUTCDay()
  const minutosAgora = brt.getUTCHours() * 60 + brt.getUTCMinutes()

  const { data: turmas } = await sb
    .from('turmas')
    .select('id, horario, duracao_minutos')
    .eq('ativa', true)
    .eq('dia_semana', diaSemana)

  // turma cujo horário envolve o momento do check-in (30 min de tolerância antes)
  const turma = (turmas ?? []).find((t) => {
    const [h, m] = String(t.horario).split(':').map(Number)
    const inicio = h * 60 + m
    return minutosAgora >= inicio - 30 && minutosAgora <= inicio + Number(t.duracao_minutos)
  })

  if (!turma) {
    console.warn(`check-in de ${clienteId} fora do horário de qualquer turma`)
    return new Response('ok (sem turma no horário)', { status: 200 })
  }

  const { error } = await sb.rpc('registrar_presenca', {
    p_turma: turma.id,
    p_data: hoje,
    p_cliente: clienteId,
    p_presente: true,
    p_canal: 'wellhub',
  })
  if (error) {
    console.error('erro ao registrar presença:', error.message)
    return new Response('ok (erro interno registrado)', { status: 200 })
  }

  // TODO (homologação): chamar a Access Control API para validar o
  // check-in (POST /access/v1/validate com gympass_id) — é essa chamada
  // que origina o repasse (CLAUDE.md 12.3). Requer WELLHUB_CLIENT_ID/
  // WELLHUB_CLIENT_SECRET e token OAuth client-credentials.

  return new Response('ok', { status: 200 })
}
