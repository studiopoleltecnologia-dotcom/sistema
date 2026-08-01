// ============================================================
// Webhook Wellhub — modelo Automated Trigger (CLAUDE.md 12.3/12.4).
//
// Fluxo oficial do check-in (confirmado pelo Techsales, jul/2026):
//   1. aluna faz check-in no app Wellhub
//   2. Wellhub faz POST assinado nesta URL (X-Gympass-Signature)
//   3. o sistema pré-registra a usuária
//   4. chama a Access Control API `validate` p/ confirmar ticket válido no dia
//   5. se positivo, libera → aqui isso vira presença (canal wellhub), que por
//      trigger gera a entrada financeira "a reconciliar" (CLAUDE.md 8/12.5).
//
// Segredos (supabase secrets set …; NUNCA no repo — é público, seção 3):
//   WELLHUB_WEBHOOK_SECRET  secret HMAC gerado por NÓS e informado à Wellhub
//                           na ativação (valida o X-Gympass-Signature).
//   WELLHUB_API_TOKEN       Bearer da Access Control API. Sandbox: o api_key
//                           recebido por e-mail (gym_id 548). Produção: token
//                           OAuth client-credentials (ver getBearer()).
//   WELLHUB_GYM_ID          id do estúdio no header X-Gym-Id. Sandbox: 548.
//   WELLHUB_API_BASE        base da API. Default sandbox apitesting.*;
//                           produção: https://api.partners.gympass.com
//
// Ativação: desenvolve local → Wellhub envia o Bearer de acesso → respondemos
// com ESTA URL (uma só p/ todos os eventos) + o WELLHUB_WEBHOOK_SECRET.
//   supabase functions deploy wellhub-webhook --no-verify-jwt
//   URL: https://fgvxhwpqsxohqrccrlfn.supabase.co/functions/v1/wellhub-webhook
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const API_BASE = Deno.env.get('WELLHUB_API_BASE') ??
  'https://apitesting.partners.gympass.com'
const GYM_ID = Deno.env.get('WELLHUB_GYM_ID') ?? ''

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  // O corpo PRECISA ser lido como texto bruto: a assinatura é o HMAC do body
  // exatamente como enviado. Re-serializar o JSON parseado quebraria o hash.
  const rawBody = await req.text()

  // ---- 1. Validação da assinatura X-Gympass-Signature ---------------------
  // HMAC-SHA1 do corpo com o nosso secret, saída hex MAIÚSCULA (spec Wellhub).
  const segredo = Deno.env.get('WELLHUB_WEBHOOK_SECRET')
  if (!segredo) {
    console.error('WELLHUB_WEBHOOK_SECRET ausente — recusando por segurança')
    return new Response('unauthorized', { status: 401 })
  }
  const assinaturaRecebida = req.headers.get('x-gympass-signature') ?? ''
  const assinaturaEsperada = await hmacSha1Hex(segredo, rawBody)
  if (!comparaSeguro(assinaturaRecebida.toUpperCase(), assinaturaEsperada)) {
    console.warn('assinatura X-Gympass-Signature inválida')
    return new Response('unauthorized', { status: 401 })
  }

  // ---- 2. Parse do payload ------------------------------------------------
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('invalid json', { status: 400 })
  }
  // Payload integral nos logs p/ conferir o mapeamento de campos na homologação.
  console.log('wellhub-webhook payload:', rawBody)

  const eventType = String(payload.event_type ?? '')

  // ---- 3. Roteamento por evento (URL única p/ checkin + booking) ----------
  // Booking API é opcional/futura (CLAUDE.md 12.3/12.7): eventos de reserva são
  // reconhecidos e respondidos com 200, mas ainda não processados — não podem
  // ser tratados como check-in. Implementar junto de Agenda & Turmas (Fase 4).
  if (eventType.startsWith('booking')) {
    console.log(`evento de booking recebido (${eventType}) — ainda não tratado`)
    return new Response('ok (booking não processado)', { status: 200 })
  }

  // ---- 4. Check-in --------------------------------------------------------
  // O id da usuária chega em event_data.user.unique_token (payload novo) ou
  // user.unique_token/gympass_id (formatos antigos). É esse token que vai como
  // `gympass_id` no validate.
  const eventData = payload.event_data as Record<string, unknown> | undefined
  const user = (eventData?.user ?? payload.user) as
    | Record<string, unknown>
    | undefined
  const token = String(
    user?.unique_token ?? user?.gympass_id ?? payload.gympass_id ?? '',
  )
  if (!token) {
    console.warn('check-in sem identificador de usuária (unique_token)')
    return new Response('ok (sem token)', { status: 200 })
  }

  // 4.1 — Access Control `validate`: confirma ticket válido HOJE. É essa
  // chamada que origina o repasse (CLAUDE.md 12.3). Sem validate positivo NÃO
  // registramos presença: geraria uma entrada "a reconciliar" que nunca
  // bateria com o repasse.
  const validacao = await validarAccessControl(token)
  if (!validacao.ok) {
    console.warn(`validate negou/erro p/ token ${token}: ${validacao.motivo}`)
    return new Response('ok (ticket não validado)', { status: 200 })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 4.2 — Pré-registro: acha ou cria a aluna Wellhub (não trava o check-in de
  // aluna nova — CLAUDE.md 12.5).
  let clienteId: string
  const { data: cliente } = await sb
    .from('clientes')
    .select('id')
    .eq('gympass_id', token)
    .maybeSingle()

  if (cliente) {
    clienteId = cliente.id as string
  } else {
    const nome = String(user?.name ?? `Aluna Wellhub ${token}`)
    const { data: nova, error } = await sb
      .from('clientes')
      .insert({ nome, origem: 'wellhub', estagio: 'ativa', gympass_id: token })
      .select('id')
      .single()
    if (error) {
      console.error('erro ao criar cliente:', error.message)
      return new Response('ok (erro interno registrado)', { status: 200 })
    }
    clienteId = nova.id as string
  }

  // 4.3 — Presença: dispara sozinha ultima_aula + entrada "a reconciliar".
  return await registrarCheckin(sb, clienteId)
})

// ------------------------------------------------------------
// Access Control API — POST /access/v1/validate
// Sandbox: https://apitesting.partners.gympass.com | Prod: api.partners.*
// Headers: X-Gym-Id + Authorization: Bearer. Body: {"gympass_id": token}.
// Sucesso (200) traz results.validated_at e metadata.errors = 0. Valor R$0 é
// caso válido (1ª visita / teto) — não é erro (CLAUDE.md 12.5).
// ------------------------------------------------------------
async function validarAccessControl(
  token: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const bearer = await getBearer()
  if (!bearer || !GYM_ID) {
    return { ok: false, motivo: 'WELLHUB_API_TOKEN/WELLHUB_GYM_ID ausentes' }
  }
  try {
    const res = await fetch(`${API_BASE}/access/v1/validate`, {
      method: 'POST',
      headers: {
        'X-Gym-Id': GYM_ID,
        'Authorization': `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gympass_id: token }),
    })
    if (!res.ok) {
      return { ok: false, motivo: `HTTP ${res.status}: ${await res.text()}` }
    }
    const body = await res.json().catch(() => ({})) as {
      metadata?: { errors?: number }
      results?: unknown
    }
    if ((body.metadata?.errors ?? 0) > 0 || !body.results) {
      return { ok: false, motivo: 'validate sem results / com errors' }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: `falha de rede: ${(e as Error).message}` }
  }
}

// Bearer da Access Control API. Sandbox usa o api_key estático (WELLHUB_API_TOKEN).
// Produção: trocar por OAuth client-credentials quando as credenciais de produção
// chegarem (client_id/secret → token curto). Mantido como ponto único de troca.
function getBearer(): Promise<string> {
  return Promise.resolve(Deno.env.get('WELLHUB_API_TOKEN') ?? '')
}

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

  return new Response('ok', { status: 200 })
}

// ------------------------------------------------------------
// HMAC-SHA1 do texto → hex MAIÚSCULO (spec X-Gympass-Signature).
// ------------------------------------------------------------
async function hmacSha1Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

// Comparação em tempo constante (evita timing attack na verificação de assinatura).
function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
