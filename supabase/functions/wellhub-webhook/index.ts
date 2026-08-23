// ============================================================
// Webhook Wellhub — Automated Trigger (check-in) + Booking API
// (CLAUDE.md 12.3/12.4, docs/interno/wellhub-api-referencia.md §4-5).
//
// Fluxo do check-in avulso (Access Control), inalterado:
//   1. aluna faz check-in no app Wellhub
//   2. Wellhub faz POST assinado nesta URL (X-Gympass-Signature)
//   3. o sistema pré-registra a usuária
//   4. chama a Access Control API `validate` p/ confirmar ticket válido no dia
//   5. se positivo, libera → `registrar_checkin_wellhub()` decide a turma.
//
// Fluxo de reserva (Booking API), novo nesta migration (20260823100000):
//   booking-requested       -> acha o Slot em turmas_wellhub_slots, tenta
//                              agendar_aula(canal='wellhub'); PATCH RESERVED
//                              ou REJECTED (turma lotada) na Wellhub.
//   booking-canceled/
//   booking-late-canceled   -> cancela o agendamento pelo booking_number.
//   checkin-booking-occurred -> acha o agendamento pelo booking_number e
//                              registra presença DIRETO, sem heurística
//                              nem fila checkins_pendentes (é o que a
//                              Booking API elimina na raiz — ver CLAUDE.md
//                              9.7 e docs/interno/wellhub-api-referencia.md
//                              §5.4).
//
// Segredos (supabase secrets set …; NUNCA no repo — é público, seção 3):
//   WELLHUB_WEBHOOK_SECRET  secret HMAC gerado por NÓS e informado à Wellhub
//                           na ativação (valida o X-Gympass-Signature).
//   WELLHUB_API_TOKEN       Bearer único p/ Access Control + Booking + Setup.
//   WELLHUB_GYM_ID          id do estúdio. Sandbox: 548.
//   WELLHUB_API_BASE        base da API. Default sandbox apitesting.*;
//                           produção: https://api.partners.gympass.com
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
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ---- 3. Roteamento por evento (URL única p/ checkin + booking) ----------
  if (eventType === 'booking-requested') {
    return await tratarBookingRequested(sb, payload)
  }
  if (eventType === 'booking-canceled' || eventType === 'booking-late-canceled') {
    return await tratarBookingCancelado(sb, payload)
  }
  if (eventType === 'checkin-booking-occurred') {
    return await tratarCheckinBookingOccurred(sb, payload)
  }
  if (eventType.startsWith('booking')) {
    console.log(`evento de booking desconhecido (${eventType}) — ignorado`)
    return new Response('ok (evento de booking não tratado)', { status: 200 })
  }

  // ---- 4. Check-in avulso (Access Control) ---------------------------------
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

  // 4.2 — Pré-registro: acha ou cria a aluna Wellhub (não trava o check-in de
  // aluna nova — CLAUDE.md 12.5).
  const clienteId = await buscarOuCriarCliente(sb, token, String(user?.name ?? ''))
  if (!clienteId) {
    console.error('erro ao achar/criar cliente para check-in')
    return new Response('erro interno', { status: 500 })
  }

  // 4.3 — A decisão de turma é do banco (RPC), não daqui. Ver a migration
  // 20260808120000: com duas salas na mesma hora o horário não identifica a
  // turma, então o sistema atribui só quando tem certeza e enfileira o resto
  // em `checkins_pendentes` para a equipe resolver. Presença atribuída
  // dispara sozinha ultima_aula + entrada "a reconciliar".
  const eventoId =
    String(payload.id ?? payload.event_id ?? eventData?.id ?? '') || null
  if (!eventoId) {
    // sinaliza na homologação qual é o campo real de id do evento
    console.warn('payload sem id de evento — idempotência cai no par (cliente, dia)')
  }

  const { data: desfecho, error: erroRpc } = await sb.rpc(
    'registrar_checkin_wellhub',
    {
      p_cliente: clienteId,
      p_momento: new Date().toISOString(),
      p_evento_externo: eventoId,
    },
  )
  if (erroRpc) {
    console.error('registrar_checkin_wellhub falhou:', erroRpc.message)
    return new Response('erro interno', { status: 500 })
  }
  if (desfecho?.resultado === 'pendente') {
    console.warn(
      `check-in pendente (${desfecho.motivo}) — pendencia ${desfecho.pendencia_id}`,
    )
  }
  return new Response(JSON.stringify(desfecho), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

// ------------------------------------------------------------
// Booking API — booking-requested: reserva feita pelo aluno no app.
// Payload-chave (docs/interno/wellhub-api-referencia.md §5.4):
//   user.unique_token, slot.{id, gym_id, class_id, booking_number}, event_id
// ------------------------------------------------------------
async function tratarBookingRequested(
  // deno-lint-ignore no-explicit-any
  sb: any,
  payload: Record<string, unknown>,
): Promise<Response> {
  const eventData = (payload.event_data ?? payload) as Record<string, unknown>
  const user = eventData.user as Record<string, unknown> | undefined
  const slot = eventData.slot as Record<string, unknown> | undefined
  const token = String(user?.unique_token ?? '')
  const slotId = String(slot?.id ?? '')
  const bookingNumber = String(slot?.booking_number ?? '')

  if (!token || !slotId || !bookingNumber) {
    console.warn('booking-requested sem token/slot.id/booking_number — payload incompleto')
    return new Response('ok (payload incompleto)', { status: 200 })
  }

  // Reentrega: já resolvemos esse booking antes? Devolve 200 sem reprocessar.
  const { data: existente } = await sb
    .from('agendamentos')
    .select('id')
    .eq('wellhub_booking_number', bookingNumber)
    .maybeSingle()
  if (existente) {
    return new Response('ok (booking já processado)', { status: 200 })
  }

  const { data: slotRow, error: erroSlot } = await sb
    .from('turmas_wellhub_slots')
    .select('turma_id, data')
    .eq('wellhub_slot_id', slotId)
    .maybeSingle()
  if (erroSlot || !slotRow) {
    console.error(`slot ${slotId} não encontrado em turmas_wellhub_slots`)
    await patchBooking(bookingNumber, {
      status: 'REJECTED',
      reason: 'Slot não reconhecido',
      reason_category: 'CLASS_NOT_FOUND',
    })
    return new Response('ok (slot desconhecido)', { status: 200 })
  }

  const clienteId = await buscarOuCriarCliente(sb, token, String(user?.name ?? ''))
  if (!clienteId) {
    console.error('erro ao achar/criar cliente para booking-requested')
    return new Response('erro interno', { status: 500 })
  }

  // agendar_aula() com canal='wellhub' pula as travas de crédito/matrícula
  // (só 'mensalista' passa por elas — 20260821140000_regras_agendamento.sql)
  // e o trigger validar_vaga_agendamento é quem decide se a turma está cheia.
  const { data: agendamentoId, error: erroAgendar } = await sb.rpc('agendar_aula', {
    p_cliente: clienteId,
    p_turma: slotRow.turma_id,
    p_data: slotRow.data,
    p_canal: 'wellhub',
  })

  if (erroAgendar) {
    const lotada = /turma lotada/i.test(erroAgendar.message ?? '')
    if (!lotada) {
      console.error('agendar_aula falhou (booking-requested):', erroAgendar.message)
    }
    await patchBooking(bookingNumber, {
      status: 'REJECTED',
      reason: lotada ? 'Turma sem vaga' : 'Erro ao processar reserva',
      reason_category: lotada ? 'CLASS_IS_FULL' : 'GENERAL_ERROR',
    })
    return new Response('ok (rejeitado)', { status: 200 })
  }

  await sb
    .from('agendamentos')
    .update({ wellhub_booking_number: bookingNumber })
    .eq('id', agendamentoId)

  await patchBooking(bookingNumber, { status: 'RESERVED' })
  return new Response('ok (reservado)', { status: 200 })
}

// ------------------------------------------------------------
// Booking API — cancelamento (pelo aluno ou tardio).
// ------------------------------------------------------------
async function tratarBookingCancelado(
  // deno-lint-ignore no-explicit-any
  sb: any,
  payload: Record<string, unknown>,
): Promise<Response> {
  const eventData = (payload.event_data ?? payload) as Record<string, unknown>
  const slot = eventData.slot as Record<string, unknown> | undefined
  const bookingNumber = String(slot?.booking_number ?? '')
  if (!bookingNumber) {
    return new Response('ok (sem booking_number)', { status: 200 })
  }

  const { data: agendamento } = await sb
    .from('agendamentos')
    .select('id, status')
    .eq('wellhub_booking_number', bookingNumber)
    .maybeSingle()
  if (!agendamento || agendamento.status === 'cancelado') {
    return new Response('ok (nada a cancelar)', { status: 200 })
  }

  const { error } = await sb.rpc('cancelar_agendamento', {
    p_agendamento: agendamento.id,
    p_origem: 'sistema',
  })
  if (error) {
    console.error('cancelar_agendamento falhou:', error.message)
    return new Response('erro interno', { status: 500 })
  }
  return new Response('ok (cancelado)', { status: 200 })
}

// ------------------------------------------------------------
// Booking API — checkin-booking-occurred: check-in de quem já tinha reserva.
// É o evento que elimina a ambiguidade de turma na raiz (booking_number
// aponta direto pro agendamento, sem heurística de horário nem fila).
// Payload-chave: booking.booking_number, user.unique_token, expires_at.
//
// Mantemos a chamada a /validate antes de gravar presença, pela mesma razão
// do check-in avulso — é o que confirma a transação de repasse. A doc não diz
// explicitamente se esse evento já dispensa o /validate; tratar como
// suposição a confirmar no teste de sandbox (ver plano de verificação).
// ------------------------------------------------------------
async function tratarCheckinBookingOccurred(
  // deno-lint-ignore no-explicit-any
  sb: any,
  payload: Record<string, unknown>,
): Promise<Response> {
  const eventData = (payload.event_data ?? payload) as Record<string, unknown>
  const booking = eventData.booking as Record<string, unknown> | undefined
  const user = eventData.user as Record<string, unknown> | undefined
  const bookingNumber = String(booking?.booking_number ?? '')
  const token = String(user?.unique_token ?? '')

  if (!bookingNumber) {
    console.warn('checkin-booking-occurred sem booking_number')
    return new Response('ok (sem booking_number)', { status: 200 })
  }

  const { data: agendamento } = await sb
    .from('agendamentos')
    .select('id, turma_id, data, cliente_id')
    .eq('wellhub_booking_number', bookingNumber)
    .maybeSingle()
  if (!agendamento) {
    console.error(`agendamento não encontrado para booking_number ${bookingNumber}`)
    return new Response('ok (agendamento não encontrado)', { status: 200 })
  }

  if (token) {
    const validacao = await validarAccessControl(token)
    if (!validacao.ok) {
      console.warn(`validate negou/erro p/ booking ${bookingNumber}: ${validacao.motivo}`)
      return new Response('ok (ticket não validado)', { status: 200 })
    }
  }

  const { error } = await sb.rpc('registrar_presenca', {
    p_turma: agendamento.turma_id,
    p_data: agendamento.data,
    p_cliente: agendamento.cliente_id,
    p_presente: true,
    p_canal: 'wellhub',
  })
  if (error) {
    console.error('registrar_presenca falhou (checkin-booking-occurred):', error.message)
    return new Response('erro interno', { status: 500 })
  }
  return new Response('ok (presenca)', { status: 200 })
}

// ------------------------------------------------------------
// Acha o cliente pela gympass_id (unique_token) ou cria "Aluna Wellhub
// <token>" — reaproveitado pelo check-in avulso e pelo booking-requested.
// ------------------------------------------------------------
async function buscarOuCriarCliente(
  // deno-lint-ignore no-explicit-any
  sb: any,
  token: string,
  nome?: string,
): Promise<string | null> {
  const { data: cliente } = await sb
    .from('clientes')
    .select('id')
    .eq('gympass_id', token)
    .maybeSingle()
  if (cliente) return cliente.id as string

  const { data: nova, error } = await sb
    .from('clientes')
    .insert({
      nome: nome || `Aluna Wellhub ${token}`,
      origem: 'wellhub',
      estagio: 'ativa',
      gympass_id: token,
    })
    .select('id')
    .single()
  if (error) {
    console.error('erro ao criar cliente:', error.message)
    return null
  }
  return nova.id as string
}

// ------------------------------------------------------------
// PATCH /booking/v2/gyms/:gym_id/bookings/:booking_number — confirma ou
// recusa a reserva. Precisa responder em até 15 min (aqui é síncrono, no
// mesmo request do webhook — bem dentro do prazo).
// ------------------------------------------------------------
async function patchBooking(
  bookingNumber: string,
  body: { status: 'RESERVED' | 'REJECTED'; reason?: string; reason_category?: string },
): Promise<void> {
  const bearer = await getBearer()
  if (!bearer || !GYM_ID) {
    console.error('WELLHUB_API_TOKEN/WELLHUB_GYM_ID ausentes — não deu pra confirmar booking')
    return
  }
  try {
    const res = await fetch(
      `${API_BASE}/booking/v2/gyms/${GYM_ID}/bookings/${bookingNumber}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) {
      console.error(`PATCH booking ${bookingNumber} falhou: HTTP ${res.status}`)
    }
  } catch (e) {
    console.error(`PATCH booking ${bookingNumber} falha de rede:`, (e as Error).message)
  }
}

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

// Bearer único p/ Access Control + Booking + Setup (WELLHUB_API_TOKEN).
// Produção: trocar por OAuth client-credentials quando as credenciais de
// produção chegarem (client_id/secret → token curto). Ponto único de troca.
function getBearer(): Promise<string> {
  return Promise.resolve(Deno.env.get('WELLHUB_API_TOKEN') ?? '')
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
