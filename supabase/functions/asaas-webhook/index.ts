// ============================================================
// Webhook do Asaas — o pagamento vira matrícula
// (docs.asaas.com/docs/about-webhooks e /docs/webhook-para-cobrancas)
//
// É este o fim do fluxo desenhado na #76: "o crédito é liberado no
// pagamento, não no clique". Quem confirma o pagamento deixa de ser a
// mão da gestão e passa a ser o gateway — chamando exatamente a mesma
// `confirmar_pagamento_contratacao()`, já testada.
//
// ## A regra que manda no desenho: NUNCA errar por regra de negócio
//
// O Asaas tenta 15 vezes e, se as 15 falharem, **PAUSA A FILA INTEIRA**
// da conta — nenhum evento de nenhum aluno chega mais até alguém
// reativar à mão no painel. E eventos expiram em 14 dias.
//
// Por isso, aqui:
//   · evento que não é nosso            → 200 "ignorado"
//   · cobrança desconhecida             → 200 "desconhecida"
//   · pagamento já processado           → 200 "ja_paga"
//   · assinatura inválida               → 401 (é ataque ou configuração
//                                          errada, e aí PARAR é o certo)
//   · banco fora do ar                  → 500 (transitório, reentrega
//                                          resolve — é para isso que ela existe)
//
// O que NÃO fazemos: devolver 4xx porque "essa solicitação não está no
// estado esperado". Isso é desfecho de negócio, responde 200, e o
// detalhe vai no log.
//
// Segredos (supabase secrets set …; NUNCA no repo — é público, seção 3):
//   ASAAS_WEBHOOK_TOKEN  token que NÓS definimos e informamos ao Asaas
//                        ao cadastrar o webhook. Vem em cada chamada no
//                        header `asaas-access-token`.
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

/** Comparação em tempo constante: evita vazar o token por timing. */
function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const PAGOS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])
const VENCIDOS = new Set(['PAYMENT_OVERDUE', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'])
const CANCELADOS = new Set(['PAYMENT_DELETED'])
const ESTORNADOS = new Set(['PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED'])

/** Sempre 200 para desfecho de negócio — ver o cabeçalho deste arquivo. */
const ok = (resultado: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ resultado, ...extra }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const token = Deno.env.get('ASAAS_WEBHOOK_TOKEN')
  if (!token) {
    console.error('ASAAS_WEBHOOK_TOKEN ausente — recusando por segurança')
    return new Response('unauthorized', { status: 401 })
  }
  const recebido = req.headers.get('asaas-access-token') ?? ''
  if (!comparaSeguro(recebido, token)) {
    console.warn('asaas-access-token inválido')
    return new Response('unauthorized', { status: 401 })
  }

  let payload: {
    event?: string
    payment?: Record<string, unknown>
    checkout?: Record<string, unknown>
  }
  try {
    payload = await req.json()
  } catch {
    return new Response('invalid json', { status: 400 })
  }

  const evento = payload.event ?? ''

  const sbCheckout = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ---- Checkout de assinatura (o caminho do cartão) ----
  // É aqui que a cobrança do cartão deixa de ser nossa: a partir de
  // CHECKOUT_PAID quem gera cada ciclo é o Asaas, e o nosso emissor
  // para de listar essa matrícula (vw_cobrancas_a_emitir).
  if (evento.startsWith('CHECKOUT_')) {
    const chk = payload.checkout
    if (!chk?.id) return ok('sem_checkout', { evento })
    try {
      if (evento === 'CHECKOUT_PAID') {
        const { data, error } = await sbCheckout.rpc('assinatura_ativada', {
          p_provider: 'asaas',
          p_checkout_ref: String(chk.id),
          p_provider_ref: chk.subscription ? String(chk.subscription) : null,
        })
        if (error) throw error
        return ok(String(data), { evento })
      }
      if (evento === 'CHECKOUT_CANCELED' || evento === 'CHECKOUT_EXPIRED') {
        const { data, error } = await sbCheckout.rpc('assinatura_encerrada', {
          p_provider: 'asaas',
          p_checkout_ref: String(chk.id),
          p_status: evento === 'CHECKOUT_EXPIRED' ? 'expirada' : 'cancelada',
        })
        if (error) throw error
        return ok(String(data), { evento })
      }
      return ok('ignorado', { evento })
    } catch (e) {
      console.error('asaas-webhook erro no checkout', evento, chk.id, e)
      return new Response('erro ao processar', { status: 500 })
    }
  }

  const pagamento = payload.payment
  if (!pagamento?.id) return ok('sem_pagamento', { evento })

  const ref = String(pagamento.id)
  console.log(`asaas-webhook ${evento} payment=${ref} status=${pagamento.status}`)

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // Cobrança que a ASSINATURA do cartão gerou. Nasce lá, então
    // precisa ser registrada aqui antes que a baixa consiga achá-la.
    // `payment.subscription` é o campo que identifica a origem.
    if (evento === 'PAYMENT_CREATED' && pagamento.subscription) {
      const { data, error } = await sb.rpc('registrar_cobranca_de_assinatura', {
        p_provider: 'asaas',
        p_assinatura_ref: String(pagamento.subscription),
        p_provider_ref: ref,
        p_valor_centavos: Math.round(Number(pagamento.value ?? 0) * 100),
        p_vencimento: String(pagamento.dueDate ?? '').slice(0, 10),
        p_descricao: String(pagamento.description ?? 'Mensalidade'),
      })
      if (error) throw error
      return ok(String(data), { evento })
    }

    if (PAGOS.has(evento)) {
      // `paymentDate` é o dia que o dinheiro entrou; sem ele, agora.
      // A data importa: é ela que vai para `data_caixa` e conta no
      // regime de caixa do MEI (CLAUDE.md §8).
      const quando = pagamento.paymentDate
        ? new Date(`${pagamento.paymentDate}T12:00:00-03:00`).toISOString()
        : new Date().toISOString()
      const forma = String(pagamento.billingType ?? '').toLowerCase()
      const { data, error } = await sb.rpc('cobranca_paga', {
        p_provider: 'asaas',
        p_provider_ref: ref,
        p_forma: forma === 'undefined' ? null : forma,
        p_pago_em: quando,
      })
      if (error) throw error
      return ok(String(data), { evento })
    }

    if (VENCIDOS.has(evento)) {
      const { data, error } = await sb.rpc('cobranca_vencida', {
        p_provider: 'asaas',
        p_provider_ref: ref,
      })
      if (error) throw error
      return ok(String(data), { evento })
    }

    if (CANCELADOS.has(evento) || ESTORNADOS.has(evento)) {
      const { data, error } = await sb.rpc('cobranca_cancelada', {
        p_provider: 'asaas',
        p_provider_ref: ref,
        p_estorno: ESTORNADOS.has(evento),
      })
      if (error) throw error
      return ok(String(data), { evento })
    }

    // Todo o resto do catálogo do Asaas (PAYMENT_CREATED, _UPDATED,
    // _BANK_SLIP_VIEWED…) é ruído para nós. 200 e segue.
    return ok('ignorado', { evento })
  } catch (e) {
    // Só chega aqui falha de infraestrutura. 500 é o certo: a
    // reentrega do Asaas existe exatamente para isso.
    console.error('asaas-webhook erro ao processar', evento, ref, e)
    return new Response('erro ao processar', { status: 500 })
  }
})
