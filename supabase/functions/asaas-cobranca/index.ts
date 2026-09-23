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
// `billingType: UNDEFINED` de propósito: é ele que deixa o aluno
// escolher no próprio link. O Pix Automático (débito recorrente
// autorizado uma vez) não está liberado nesta conta, então "cobrança
// automática" aqui significa: NÓS emitimos a cobrança de cada ciclo
// sozinhos, e o aluno paga cada uma. O cartão salvo vem depois.
//
// Segredos (supabase secrets set …; NUNCA no repo — é público, seção 3):
//   ASAAS_API_KEY    chave da conta. Sandbox e produção são chaves
//                    DIFERENTES, cada uma no projeto Supabase do seu
//                    ambiente (CLAUDE.md 14.4).
//   ASAAS_API_BASE   base da API. Default sandbox; produção é
//                    https://api.asaas.com/v3
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

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

  let corpo: { solicitacao_id?: string }
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'json inválido' }, 400)
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

  const r = await asaas('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: 'UNDEFINED', // o aluno escolhe Pix ou cartão no link
      value: Number(sol.preco_centavos) / 100,
      dueDate: venc,
      description: `${sol.produto_nome} — Studio Pole L`,
      externalReference: sol.id, // amarra o webhook de volta à solicitação
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
