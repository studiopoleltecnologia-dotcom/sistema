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
// Fluxo de reserva (Booking API), como a Wellhub pediu na homologação
// (28/09/2026, migration 20261001120000):
//   booking-requested       -> reservar_wellhub() faz a reserva numa
//                              transação só; depois, em paralelo, PATCH do
//                              booking (RESERVED/REJECTED) e PATCH do slot
//                              com o total_booked novo.
//   booking-canceled/
//   booking-late-canceled   -> cancela o agendamento pelo booking_number e
//                              manda SÓ o PATCH do slot. O booking quem
//                              cancela é a Wellhub.
//   checkin-booking-occurred -> acha o agendamento pelo booking_number,
//                              chama o validate (obrigatório, confirmado
//                              pela Wellhub) e registra presença DIRETO,
//                              sem heurística nem fila checkins_pendentes.
//
// Idempotente de propósito: toda reentrega refaz o que faltou (o PATCH que
// falhou) e nada mais. Por isso falha transitória da API da Wellhub
// responde 500 — a reentrega deles é a nossa retentativa.
//
// Segredos (supabase secrets set …; NUNCA no repo — é público, seção 3):
//   WELLHUB_WEBHOOK_SECRET  secret HMAC gerado por NÓS e informado à Wellhub
//                           na ativação (valida o X-Gympass-Signature).
//   WELLHUB_API_TOKEN       Bearer único p/ Access Control + Booking + Setup.
//   WELLHUB_GYM_ID          id do estúdio. Sandbox: 548; produção: runbook.
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

// Desfecho de reservar_wellhub() -> resposta ao booking. `null` = não
// mandar PATCH de booking (já confirmado, ou já cancelado).
const REJEICOES: Record<string, { reason: string; reason_category: string }> = {
  lotada: { reason: 'Turma sem vaga', reason_category: 'CLASS_IS_FULL' },
  ja_agendado: { reason: 'Aluno já tem reserva nesta aula', reason_category: 'USER_IS_ALREADY_BOOKED' },
  aula_cancelada: { reason: 'Aula cancelada pelo estúdio', reason_category: 'CLASS_HAS_BEEN_CANCELED' },
  fora_da_janela: { reason: 'Aula já aconteceu', reason_category: 'CHECK_IN_AND_CANCELATION_WINDOWS_CLOSED' },
  slot_desconhecido: { reason: 'Slot não reconhecido', reason_category: 'CLASS_NOT_FOUND' },
  erro: { reason: 'Erro ao processar reserva', reason_category: 'GENERAL_ERROR' },
}

async function tratarBookingRequested(
  // deno-lint-ignore no-explicit-any
  sb: any,
  payload: Record<string, unknown>,
): Promise<Response> {
  const inicio = Date.now()
  const ev = lerEventoBooking(payload)
  const log: Record<string, unknown> = {
    evento: 'booking-requested',
    event_id: ev.eventId,
    booking_number: ev.bookingNumber,
    slot_id: ev.slotId,
  }

  if (!ev.token || !ev.slotId || !ev.bookingNumber) {
    return responder(200, { ...log, resultado: 'payload_incompleto' }, inicio)
  }

  const { data: r, error: erroRpc } = await sb.rpc('reservar_wellhub', {
    p_token: ev.token,
    p_nome: ev.nome,
    p_slot: ev.slotId,
    p_booking: ev.bookingNumber,
  })
  if (erroRpc || !r) {
    console.error('reservar_wellhub falhou:', erroRpc?.message)
    return responder(500, { ...log, resultado: 'erro_banco', erro: erroRpc?.message }, inicio)
  }
  Object.assign(log, {
    resultado: r.resultado,
    agendamento_id: r.agendamento_id ?? null,
    total_booked: r.total_booked ?? null,
  })
  if (r.erro) console.error(`reservar_wellhub(${ev.bookingNumber}): ${r.erro}`)

  // Reservado agora, ou reentrega de uma reserva cuja confirmação ainda não
  // chegou lá -> RESERVED. Já confirmado ou já cancelado -> nada.
  const reservar = (r.resultado === 'reservado' || r.resultado === 'duplicado_ativo') &&
    !r.confirmado
  const rejeicao = REJEICOES[r.resultado as string]
  const corpoBooking = reservar
    ? { status: 'RESERVED' as const }
    : rejeicao
    ? { status: 'REJECTED' as const, ...rejeicao }
    : null

  const classId = ev.classId || String(r.class_id ?? '')
  const [pb, ps] = await Promise.all([
    corpoBooking ? patchBooking(ev.bookingNumber, corpoBooking) : null,
    r.resultado !== 'slot_desconhecido'
      ? patchSlot(classId, ev.slotId, Number(r.total_booked ?? 0))
      : null,
  ])
  log.patch_booking = resumo(pb)
  log.patch_slot = resumo(ps)

  if (reservar && pb?.ok && r.agendamento_id) {
    const { error } = await sb
      .from('agendamentos')
      .update({ wellhub_confirmado_em: new Date().toISOString() })
      .eq('id', r.agendamento_id)
      .is('wellhub_confirmado_em', null)
    if (error) console.error('gravar wellhub_confirmado_em falhou:', error.message)
  }

  const transitorio = Boolean(pb?.transitorio || ps?.transitorio)
  return responder(transitorio ? 500 : 200, log, inicio)
}

// ------------------------------------------------------------
// Booking API — cancelamento (pelo aluno ou tardio). A Wellhub cancela o
// booking do lado dela; a nós cabe liberar a vaga aqui e atualizar o
// total_booked do slot lá. Sem PATCH de booking.
// ------------------------------------------------------------
async function tratarBookingCancelado(
  // deno-lint-ignore no-explicit-any
  sb: any,
  payload: Record<string, unknown>,
): Promise<Response> {
  const inicio = Date.now()
  const ev = lerEventoBooking(payload)
  const log: Record<string, unknown> = {
    evento: String(payload.event_type ?? ''),
    event_id: ev.eventId,
    booking_number: ev.bookingNumber,
    slot_id: ev.slotId,
  }
  if (!ev.bookingNumber) {
    return responder(200, { ...log, resultado: 'sem_booking_number' }, inicio)
  }

  const { data: agendamento, error: erroBusca } = await sb
    .from('agendamentos')
    .select('id, status')
    .eq('wellhub_booking_number', ev.bookingNumber)
    .maybeSingle()
  if (erroBusca) {
    console.error('busca do agendamento falhou:', erroBusca.message)
    return responder(500, { ...log, resultado: 'erro_banco' }, inicio)
  }

  if (!agendamento) {
    log.resultado = 'nao_encontrado'
  } else if (agendamento.status !== 'agendado') {
    log.resultado = 'ja_cancelado'
  } else {
    const { error } = await sb.rpc('cancelar_agendamento', {
      p_agendamento: agendamento.id,
      p_origem: 'sistema',
    })
    // Duas entregas simultâneas: a segunda perde a corrida no `for update`
    // de cancelar_agendamento e cai aqui — o desfecho é o mesmo.
    if (error && !/já cancelado/.test(error.message ?? '')) {
      console.error('cancelar_agendamento falhou:', error.message)
      return responder(500, { ...log, resultado: 'erro_banco' }, inicio)
    }
    log.resultado = error ? 'ja_cancelado' : 'cancelado'
  }
  log.agendamento_id = agendamento?.id ?? null

  // Sempre reafirma o número do slot, mesmo sem nada a cancelar aqui: o
  // valor é absoluto, então corrigir um desvio antigo não custa nada.
  if (!ev.slotId) {
    log.patch_slot = 'sem_slot_id'
    return responder(200, log, inicio)
  }
  const { data: ocupacao, error: erroOcup } = await sb.rpc('wellhub_ocupacao_slot', {
    p_slot: ev.slotId,
  })
  if (erroOcup) {
    console.error('wellhub_ocupacao_slot falhou:', erroOcup.message)
    return responder(500, { ...log, patch_slot: 'erro_banco' }, inicio)
  }
  if (!ocupacao) {
    log.patch_slot = 'slot_desconhecido'
    return responder(200, log, inicio)
  }
  log.total_booked = ocupacao.total_booked
  const ps = await patchSlot(
    ev.classId || String(ocupacao.class_id ?? ''),
    ev.slotId,
    Number(ocupacao.total_booked ?? 0),
  )
  log.patch_slot = resumo(ps)
  return responder(ps.transitorio ? 500 : 200, log, inicio)
}

// ------------------------------------------------------------
// Booking API — checkin-booking-occurred: check-in de quem já tinha reserva.
// É o evento que elimina a ambiguidade de turma na raiz (booking_number
// aponta direto pro agendamento, sem heurística de horário nem fila).
// Payload-chave: booking.booking_number, user.unique_token, expires_at.
//
// O /validate é obrigatório aqui (confirmado pela Wellhub em 28/09/2026): é
// ele que gera a transação de repasse. Sem token, não há como validar —
// então não registra presença, senão nasceria uma entrada "a reconciliar"
// que a Wellhub nunca vai pagar.
// ------------------------------------------------------------
async function tratarCheckinBookingOccurred(
  // deno-lint-ignore no-explicit-any
  sb: any,
  payload: Record<string, unknown>,
): Promise<Response> {
  const inicio = Date.now()
  const eventData = (payload.event_data ?? payload) as Record<string, unknown>
  const booking = eventData.booking as Record<string, unknown> | undefined
  const user = eventData.user as Record<string, unknown> | undefined
  const bookingNumber = String(booking?.booking_number ?? '')
  const log: Record<string, unknown> = {
    evento: 'checkin-booking-occurred',
    event_id: String(eventData.event_id ?? payload.event_id ?? '') || null,
    booking_number: bookingNumber,
  }

  if (!bookingNumber) {
    return responder(200, { ...log, resultado: 'sem_booking_number' }, inicio)
  }

  const { data: agendamento, error: erroBusca } = await sb
    .from('agendamentos')
    .select('id, turma_id, data, cliente_id, status, clientes ( gympass_id )')
    .eq('wellhub_booking_number', bookingNumber)
    .maybeSingle()
  if (erroBusca) {
    console.error('busca do agendamento falhou:', erroBusca.message)
    return responder(500, { ...log, resultado: 'erro_banco' }, inicio)
  }
  if (!agendamento) {
    return responder(200, { ...log, resultado: 'agendamento_nao_encontrado' }, inicio)
  }
  log.agendamento_id = agendamento.id
  // Reserva cancelada (pela aluna ou por aula cancelada pelo estúdio) não
  // vira presença: seria pagar professora por aula que não houve.
  if (agendamento.status !== 'agendado') {
    return responder(200, { ...log, resultado: 'agendamento_nao_ativo' }, inicio)
  }

  const token = String(user?.unique_token ?? '') ||
    String(agendamento.clientes?.gympass_id ?? '')
  if (!token) {
    return responder(200, { ...log, resultado: 'sem_token' }, inicio)
  }

  const validacao = await validarAccessControl(token)
  log.validate = validacao.ok ? 'ok' : validacao.motivo
  if (!validacao.ok) {
    return responder(200, { ...log, resultado: 'ticket_nao_validado' }, inicio)
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
    return responder(500, { ...log, resultado: 'erro_banco' }, inicio)
  }
  return responder(200, { ...log, resultado: 'presenca' }, inicio)
}

// Campos que os eventos de booking trazem em event_data (formato real,
// conferido no cURL da Wellhub de 28/09/2026).
function lerEventoBooking(payload: Record<string, unknown>) {
  const eventData = (payload.event_data ?? payload) as Record<string, unknown>
  const user = eventData.user as Record<string, unknown> | undefined
  const slot = eventData.slot as Record<string, unknown> | undefined
  return {
    eventId: String(eventData.event_id ?? payload.event_id ?? '') || null,
    token: String(user?.unique_token ?? ''),
    nome: String(user?.name ?? ''),
    slotId: String(slot?.id ?? ''),
    classId: String(slot?.class_id ?? ''),
    bookingNumber: String(slot?.booking_number ?? ''),
  }
}

// Uma linha de log por evento, sem nome/e-mail/telefone, e o mesmo objeto
// como corpo da resposta — a Wellhub ignora o corpo; nós lemos nos testes.
function responder(
  status: number,
  corpo: Record<string, unknown>,
  inicio: number,
): Response {
  const saida = { ...corpo, ms: Date.now() - inicio }
  console.log(JSON.stringify({ fn: 'wellhub-webhook', status, ...saida }))
  return new Response(JSON.stringify(saida), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
// Chamadas à Booking API. Devolvem o desfecho em vez de só logar: o
// webhook precisa saber se a Wellhub aceitou para gravar
// wellhub_confirmado_em e para decidir entre 200 e 500.
//
// `transitorio` = vale tentar de novo (rede, 429, 5xx, secret ausente).
// 4xx é definitivo: repetir não muda a resposta.
// ------------------------------------------------------------
type ResultadoWellhub = {
  ok: boolean
  http: number | null
  corpo: string
  tentativas: number
  transitorio: boolean
}

async function chamarWellhub(path: string, body: unknown): Promise<ResultadoWellhub> {
  const bearer = await getBearer()
  if (!bearer || !GYM_ID) {
    console.error('WELLHUB_API_TOKEN/WELLHUB_GYM_ID ausentes — PATCH não enviado')
    return { ok: false, http: null, corpo: 'secrets ausentes', tentativas: 0, transitorio: true }
  }
  const esperas = [0, 200, 500]
  let ultimo: ResultadoWellhub = {
    ok: false,
    http: null,
    corpo: '',
    tentativas: 0,
    transitorio: true,
  }
  for (let i = 0; i < esperas.length; i++) {
    if (esperas[i]) await new Promise((r) => setTimeout(r, esperas[i]))
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      })
      const corpo = (await res.text()).slice(0, 300)
      const transitorio = res.status === 429 || res.status >= 500
      ultimo = { ok: res.ok, http: res.status, corpo, tentativas: i + 1, transitorio }
      if (!transitorio) break
    } catch (e) {
      ultimo = {
        ok: false,
        http: null,
        corpo: (e as Error).message,
        tentativas: i + 1,
        transitorio: true,
      }
    }
  }
  if (!ultimo.ok) {
    console.error(`PATCH ${path} falhou: HTTP ${ultimo.http ?? '-'} ${ultimo.corpo}`)
  }
  return ultimo
}

// PATCH /booking/v2/gyms/:gym_id/bookings/:booking_number — confirma ou
// recusa a reserva. A Wellhub dá 15 min; aqui sai no mesmo request.
function patchBooking(
  bookingNumber: string,
  body: { status: 'RESERVED' | 'REJECTED'; reason?: string; reason_category?: string },
): Promise<ResultadoWellhub> {
  return chamarWellhub(`/booking/v2/gyms/${GYM_ID}/bookings/${bookingNumber}`, body)
}

// PATCH /booking/v1/gyms/:gym_id/classes/:class_id/slots/:slot_id — só
// total_booked. Valor absoluto: reenviar é inofensivo e corrige desvio.
async function patchSlot(
  classId: string,
  slotId: string,
  totalBooked: number,
): Promise<ResultadoWellhub> {
  if (!classId) {
    console.error(`slot ${slotId} sem class_id (nem no payload, nem no mapa) — total_booked não enviado`)
    return { ok: false, http: null, corpo: 'sem class_id', tentativas: 0, transitorio: false }
  }
  return await chamarWellhub(
    `/booking/v1/gyms/${GYM_ID}/classes/${classId}/slots/${slotId}`,
    { total_booked: totalBooked },
  )
}

function resumo(r: ResultadoWellhub | null) {
  if (!r) return null
  return { http: r.http, tentativas: r.tentativas, ...(r.ok ? {} : { corpo: r.corpo }) }
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
