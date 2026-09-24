// ============================================================
// Emitir cobrança no Asaas para uma contratação aprovada
// (backlog §11.3 itens 5-6; docs.asaas.com/reference/criar-nova-cobranca)
//
// Fluxo:
//   1. gestão aprova a contratação  → status `aguardando_pagamento`
//   2. a tela chama esta função
//   3. garante que o aluno existe como `customer` no Asaas
//   4. cria a cobrança e guarda `provider_ref` + `invoiceUrl` em `cobrancas`
//   5. o aluno abre a página e escolhe Pix ou cartão
//
// Dois caminhos, cada um com o dono certo:
//
//   PIX     — nós emitimos uma cobrança por ciclo (modo lote, no fim
//             deste arquivo, chamado pelo cron `emitir-cobrancas`) e
//             mandamos o link por e-mail. A equipe não clica em nada;
//             o aluno é que paga ativamente cada mês.
//   CARTÃO  — checkout de assinatura. O aluno autoriza UMA vez na
//             página do Asaas e eles debitam sozinhos todo ciclo.
//
// O Pix Automático do Banco Central (autorizar uma vez e debitar ao
// custo de Pix) não está liberado nesta conta. Quando estiver, ele
// substitui o caminho do cartão sem mexer em `cobrancas`.
//
// Segredos (supabase secrets set …; NUNCA no repo — é público, seção 3):
//   ASAAS_API_KEY    chave da conta. Sandbox e produção são chaves
//                    DIFERENTES, cada uma no projeto Supabase do seu
//                    ambiente (CLAUDE.md 14.4).
//   ASAAS_API_BASE   base da API. Default sandbox; produção é
//                    https://api.asaas.com/v3
// ============================================================
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const API_BASE = Deno.env.get('ASAAS_API_BASE') ?? 'https://api-sandbox.asaas.com/v3'
const API_KEY = Deno.env.get('ASAAS_API_KEY') ?? ''
// O Asaas pede um User-Agent que identifique a aplicação.
const UA = 'StudioPoleL-ERP/1.0 (Supabase Edge)'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function asaas(caminho: string, init?: RequestInit) {
  const r = await fetch(`${API_BASE}${caminho}`, {
    ...init,
    headers: {
      access_token: API_KEY,
      'Content-Type': 'application/json',
      'User-Agent': UA,
      ...(init?.headers ?? {}),
    },
  })
  const texto = await r.text()
  let corpo: Record<string, unknown> = {}
  try {
    corpo = JSON.parse(texto)
  } catch {
    corpo = { raw: texto }
  }
  return { ok: r.ok, status: r.status, corpo }
}


/**
 * Multa e juros de atraso, do jeito que o Asaas espera.
 *
 * Nascem em zero na config: cobrar multa precisa estar no regulamento
 * que o aluno aceitou. Enquanto estiverem zeradas, nada é enviado e o
 * atraso não custa nada — a consequência é só o bloqueio.
 */
async function encargosDeAtraso(sb: SupabaseClient) {
  const { data } = await sb
    .from('config_financeiro')
    .select('multa_atraso_pct, juros_mes_atraso_pct')
    .maybeSingle()
  const multa = Number(data?.multa_atraso_pct ?? 0)
  const juros = Number(data?.juros_mes_atraso_pct ?? 0)
  return {
    ...(multa > 0 ? { fine: { value: multa } } : {}),
    ...(juros > 0 ? { interest: { value: juros } } : {}),
  }
}

/** Só dígitos — o Asaas recusa CPF com pontuação. */
const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'method not allowed' }, 405)

  if (!API_KEY) {
    // Ambiente sem o segredo não emite nada, de propósito: é a mesma
    // trava de isolamento do Vault (CLAUDE.md 14.4). Melhor recusar com
    // mensagem clara do que chamar a API da produção por engano.
    return json({ erro: 'ASAAS_API_KEY ausente neste ambiente' }, 503)
  }

  // A sessão de quem clicou: a RLS e as RPCs continuam valendo, então
  // uma secretária chamando isto direto é recusada pelo banco.
  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let corpo: { solicitacao_id?: string; modo?: string; cartao?: boolean }
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'json inválido' }, 400)
  }

  // ---- Modo lote: o cron mandando emitir os ciclos que venceram ----
  // Sem `Authorization` de pessoa: quem chama é `disparar_cobrancas()`
  // com a anon key, e a autorização real é a service key usada abaixo.
  if (corpo.modo === 'pendentes') {
    return await emitirPendentes(sb)
  }

  if (!corpo.solicitacao_id) return json({ erro: 'solicitacao_id é obrigatório' }, 400)

  // Quem pediu precisa ser gestão. Verificado com o token de quem
  // chamou, não com a service key — senão qualquer um emitiria cobrança.
  const comoUsuario = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  )
  const { data: ehGestao } = await comoUsuario.rpc('is_gestao')
  if (!ehGestao) return json({ erro: 'acesso restrito à gestão' }, 403)

  const { data: sol, error: erroSol } = await sb
    .from('vw_solicitacoes')
    .select('*')
    .eq('id', corpo.solicitacao_id)
    .maybeSingle()
  if (erroSol) return json({ erro: erroSol.message }, 500)
  if (!sol) return json({ erro: 'solicitação não encontrada' }, 404)
  if (sol.status !== 'aguardando_pagamento') {
    return json({ erro: `solicitação está em "${sol.status}", não aguardando pagamento` }, 409)
  }
  if (sol.cobranca_id && sol.cobranca_status === 'pendente') {
    // Já existe cobrança em aberto: devolve o link em vez de emitir
    // outra. Duas cobranças do mesmo plano é o erro que o aluno percebe.
    return json({ ja_existia: true, url: sol.url_pagamento, cobranca_id: sol.cobranca_id })
  }

  const { data: cliente } = await sb
    .from('clientes')
    .select('id, nome, email, telefone, cpf, asaas_customer_id')
    .eq('id', sol.cliente_id)
    .maybeSingle()
  if (!cliente) return json({ erro: 'aluno não encontrado' }, 404)
  // `cpfCnpj` é campo obrigatório do POST /customers do Asaas. Recusar
  // aqui, com o nome do que falta, evita a alternativa: a API deles
  // devolver um erro genérico que ninguém na recepção sabe traduzir.
  if (!digitos(cliente.cpf)) {
    return json(
      { erro: `${cliente.nome} está sem CPF no cadastro — o gateway exige para emitir cobrança` },
      422,
    )
  }

  // ---- 1. o aluno como customer no Asaas ----
  let customerId = cliente.asaas_customer_id as string | null
  if (!customerId) {
    const r = await asaas('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: cliente.nome,
        email: cliente.email,
        mobilePhone: digitos(cliente.telefone) || undefined,
        cpfCnpj: digitos(cliente.cpf) || undefined,
        externalReference: cliente.id,
        notificationDisabled: true, // quem avisa o aluno somos nós (backlog §11.2.3)
      }),
    })
    if (!r.ok) return json({ erro: 'Asaas recusou o cadastro do aluno', detalhe: r.corpo }, 502)
    customerId = String(r.corpo.id)
    await sb.from('clientes').update({ asaas_customer_id: customerId }).eq('id', cliente.id)
  }

  // ---- 2. a cobrança ----
  const vencimento = new Date()
  vencimento.setDate(vencimento.getDate() + 3)
  const venc = vencimento.toISOString().slice(0, 10)

  // ---- 2a. cartão: assinatura, não cobrança avulsa ----
  //
  // Por que o cartão recorrente NÃO passa por `/payments` com um token
  // guardado: esse endpoint exige `remoteIp`, e a doc do Asaas é
  // explícita em que precisa ser o IP do APARELHO DO ALUNO, não o do
  // servidor. Numa cobrança mensal disparada por cron não existe aluno
  // na tela, logo não existe esse IP.
  //
  // O checkout recorrente resolve na raiz: o aluno autoriza na página
  // do Asaas, e quem captura o IP é o Asaas. Daí em diante eles geram
  // e debitam cada ciclo — nós só recebemos o webhook.
  if (corpo.cartao) {
    const proximo = new Date()
    proximo.setDate(proximo.getDate() + 1)

    const chk = await asaas('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        billingTypes: ['CREDIT_CARD'],
        chargeTypes: ['RECURRENT'],
        minutesToExpire: 1440, // máximo aceito: 24h
        customerData: {
          name: cliente.nome,
          email: cliente.email,
          cpfCnpj: digitos(cliente.cpf),
        },
        items: [
          {
            name: sol.produto_nome,
            quantity: 1,
            value: Number(sol.preco_centavos) / 100,
          },
        ],
        subscription: {
          cycle: 'MONTHLY',
          nextDueDate: proximo.toISOString().slice(0, 10),
        },
        externalReference: sol.id,
      }),
    })
    if (!chk.ok) return json({ erro: 'Asaas recusou o checkout', detalhe: chk.corpo }, 502)

    const { data: assinaturaId, error: erroAss } = await sb.rpc(
      'registrar_assinatura_gateway',
      {
        p_solicitacao: sol.id,
        p_matricula: null,
        p_cliente: cliente.id,
        p_provider: 'asaas',
        p_checkout_ref: String(chk.corpo.id),
        p_url: String(chk.corpo.link ?? chk.corpo.url ?? ''),
      },
    )
    if (erroAss) return json({ erro: erroAss.message, asaas_checkout_id: chk.corpo.id }, 500)

    return json({
      assinatura_id: assinaturaId,
      url: chk.corpo.link ?? chk.corpo.url,
      recorrente: true,
      // O checkout expira em 24h (limite do Asaas). Quem manda o link
      // precisa saber disso, senão o aluno abre no dia seguinte e acha
      // que o sistema quebrou.
      expira_em_horas: 24,
    })
  }

  const r = await asaas('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: 'UNDEFINED', // o aluno escolhe Pix ou cartão no link
      value: Number(sol.preco_centavos) / 100,
      dueDate: venc,
      description: `${sol.produto_nome} — Studio Pole L`,
      externalReference: sol.id, // amarra o webhook de volta à solicitação
      ...(await encargosDeAtraso(sb)),
    }),
  })
  if (!r.ok) return json({ erro: 'Asaas recusou a cobrança', detalhe: r.corpo }, 502)

  const { data: cobrancaId, error: erroReg } = await sb.rpc('registrar_cobranca', {
    p_solicitacao: sol.id,
    p_matricula: null,
    p_ciclo: 1,
    p_cliente: cliente.id,
    p_valor_centavos: sol.preco_centavos,
    p_vencimento: venc,
    p_descricao: sol.produto_nome,
    p_provider: 'asaas',
    p_provider_ref: String(r.corpo.id),
    p_url: String(r.corpo.invoiceUrl ?? ''),
  })
  if (erroReg) {
    // A cobrança existe no Asaas mas não no nosso banco: o id vai na
    // resposta para não ficar órfã e sem ninguém saber dela.
    return json({ erro: erroReg.message, asaas_payment_id: r.corpo.id }, 500)
  }

  return json({
    cobranca_id: cobrancaId,
    url: r.corpo.invoiceUrl,
    vencimento: venc,
  })
})

// ============================================================
// Modo lote — chamado pelo cron `emitir-cobrancas`
// ============================================================
/**
 * Emite a cobrança dos ciclos que já venceram e ainda não têm cobrança.
 *
 * `vw_cobrancas_a_emitir` já exclui quem tem assinatura de cartão ativa
 * no gateway: lá quem gera é o Asaas, e emitir aqui cobraria o aluno
 * duas vezes pelo mesmo mês.
 *
 * Erro em um aluno não derruba os outros — a lista é processada até o
 * fim e o resumo diz quantos falharam. Um CPF faltando não pode impedir
 * a cobrança dos demais.
 */
async function emitirPendentes(sb: SupabaseClient) {
  const { data: pendentes, error } = await sb
    .from('vw_cobrancas_a_emitir')
    .select('*')
    .lte('vencimento', new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10))
    .limit(200)
  if (error) return json({ erro: error.message }, 500)

  // Lido uma vez, não por aluno: é config do estúdio, igual para todos.
  const encargos = await encargosDeAtraso(sb)
  const resultado = { emitidas: 0, falhas: [] as { aluno: string; erro: string }[] }

  for (const p of pendentes ?? []) {
    try {
      const customerId = await garantirCustomer(sb, {
        id: p.cliente_id,
        nome: p.cliente_nome,
        email: p.cliente_email,
        cpf: p.cliente_cpf,
        telefone: null,
        asaas_customer_id: p.asaas_customer_id,
      })

      const r = await asaas('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customer: customerId,
          billingType: 'PIX',
          value: Number(p.valor_centavos) / 100,
          dueDate: p.vencimento,
          description: p.descricao ?? 'Studio Pole L',
          externalReference: p.entrada_id,
          ...encargos,
        }),
      })
      if (!r.ok) throw new Error(JSON.stringify(r.corpo))

      await sb.rpc('registrar_cobranca', {
        p_solicitacao: null,
        p_matricula: p.matricula_id,
        p_ciclo: p.ciclo,
        p_cliente: p.cliente_id,
        p_valor_centavos: p.valor_centavos,
        p_vencimento: p.vencimento,
        p_descricao: p.descricao,
        p_provider: 'asaas',
        p_provider_ref: String(r.corpo.id),
        p_url: String(r.corpo.invoiceUrl ?? ''),
      })

      // O link precisa CHEGAR ao aluno, senão emitir sozinho não serve
      // de nada. `ref` leva o id da cobrança para a fila não deduplicar
      // a cobrança do mês seguinte contra a deste mês.
      await sb.rpc('enfileirar_email', {
        p_tipo: 'cobranca_do_ciclo',
        p_destinatario: p.cliente_email,
        p_dados: {
          produto: p.descricao,
          valor_centavos: p.valor_centavos,
          vencimento: p.vencimento,
          url: r.corpo.invoiceUrl,
        },
        p_ref: `cobranca:${r.corpo.id}`,
      })

      resultado.emitidas++
    } catch (e) {
      resultado.falhas.push({
        aluno: String(p.cliente_nome),
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (resultado.falhas.length) console.error('asaas-cobranca falhas:', resultado.falhas)
  return json(resultado)
}

/** Cria o aluno no gateway se ainda não existir, e guarda o id. */
async function garantirCustomer(
  sb: SupabaseClient,
  c: {
    id: string
    nome: string
    email: string | null
    cpf: string | null
    telefone: string | null
    asaas_customer_id: string | null
  },
) {
  if (c.asaas_customer_id) return c.asaas_customer_id
  if (!digitos(c.cpf)) throw new Error(`${c.nome} está sem CPF no cadastro`)

  const r = await asaas('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: c.nome,
      email: c.email ?? undefined,
      mobilePhone: digitos(c.telefone) || undefined,
      cpfCnpj: digitos(c.cpf),
      externalReference: c.id,
      notificationDisabled: true,
    }),
  })
  if (!r.ok) throw new Error(`Asaas recusou o cadastro de ${c.nome}: ${JSON.stringify(r.corpo)}`)

  const id = String(r.corpo.id)
  await sb.from('clientes').update({ asaas_customer_id: id }).eq('id', c.id)
  return id
}
