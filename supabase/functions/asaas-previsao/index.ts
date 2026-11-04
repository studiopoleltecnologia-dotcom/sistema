// ============================================================
// Previsão de receita lida do Asaas
// (docs.asaas.com/reference/listar-assinaturas e /listar-cobrancas)
//
// Decisão da gestão em 04/11/2026: a previsão de mensalidades sai do
// GATEWAY, porque é ele que cobra. Esta função é a única coisa no
// sistema que conversa com o Asaas sobre o futuro; o resultado pousa em
// `previsoes_asaas` (migration 20261113120000), que é o que as telas
// leem e a gestão edita.
//
// O que compõe a previsão, e por que são duas coisas:
//
//   COBRANÇA PENDENTE (`/payments?status=PENDING`) — o Asaas já emitiu,
//     tem data e valor exatos. É o pedaço confiável: não é estimativa,
//     é uma cobrança existindo lá com vencimento marcado.
//   CICLO PROJETADO (`/subscriptions` + `nextDueDate`) — o que a
//     assinatura vai gerar depois da última cobrança já emitida. É
//     estimativa: supõe que ninguém cancela.
//
// A soma dos dois sem cuidado contaria o mesmo mês duas vezes, porque o
// Asaas pré-gera a cobrança do próximo ciclo bem antes de `nextDueDate`
// alcançá-lo. Por isso a projeção salta todo mês que já tem cobrança
// pendente da mesma assinatura.
//
// Segredos (supabase secrets set …; NUNCA no repo — é público, §3):
//   ASAAS_API_KEY    chave da conta. Sandbox e produção são chaves
//                    DIFERENTES, cada uma no projeto Supabase do seu
//                    ambiente (CLAUDE.md §14.4).
//   ASAAS_API_BASE   base da API. Default sandbox; produção é
//                    https://api.asaas.com/v3
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const API_BASE = Deno.env.get('ASAAS_API_BASE') ?? 'https://api-sandbox.asaas.com/v3'
const API_KEY = Deno.env.get('ASAAS_API_KEY') ?? ''
const UA = 'StudioPoleL-ERP/1.0 (Supabase Edge)'

/** Quantos ciclos à frente projetar. 12 para o semestral caber inteiro. */
const CICLOS_PROJETADOS = 12

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

type Pagina<T> = { data?: T[]; hasMore?: boolean; totalCount?: number }

async function asaas<T>(caminho: string): Promise<Pagina<T>> {
  const r = await fetch(`${API_BASE}${caminho}`, {
    headers: { access_token: API_KEY, 'User-Agent': UA },
  })
  const texto = await r.text()
  if (!r.ok) {
    throw new Error(`Asaas ${r.status} em ${caminho}: ${texto.slice(0, 300)}`)
  }
  return JSON.parse(texto) as Pagina<T>
}

/** Percorre a paginação por offset até `hasMore` ficar falso. */
async function todas<T>(caminho: string): Promise<T[]> {
  const juntas: T[] = []
  let offset = 0
  for (;;) {
    const sep = caminho.includes('?') ? '&' : '?'
    const p = await asaas<T>(`${caminho}${sep}limit=100&offset=${offset}`)
    juntas.push(...(p.data ?? []))
    if (!p.hasMore) return juntas
    offset += 100
    // Guarda contra paginação infinita por resposta malformada: 20
    // páginas são 2.000 linhas, muito além do tamanho deste estúdio.
    if (offset > 2000) return juntas
  }
}

type Assinatura = {
  id: string
  customer: string
  value: number
  nextDueDate: string
  cycle: string
  status: string
  description?: string | null
  deleted?: boolean
}

type Cobranca = {
  id: string
  customer: string
  subscription?: string | null
  value: number
  dueDate: string
  status: string
  description?: string | null
}

type Cliente = {
  id: string
  name?: string | null
  cpfCnpj?: string | null
  email?: string | null
}

/** Reais com centavos (o Asaas fala em decimal) → inteiro em centavos. */
const centavos = (v: number) => Math.round(Number(v) * 100)

/** Meses que cada ciclo do Asaas avança. */
const PASSO_MESES: Record<string, number> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUALLY: 6,
  YEARLY: 12,
}

/**
 * Avança `n` passos de um vencimento, no mesmo dia do mês.
 *
 * Mesma regra do resto do sistema (`data_renovacao()`, A17): mês que não
 * tem o dia (29–31) cai no último dia e volta no seguinte. É assim que o
 * Asaas cobra — ele não tem "a cada 30 dias".
 */
function avancar(iso: string, passos: number, mesesPorPasso: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(ano, mes - 1 + passos * mesesPorPasso, 1))
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  const d = Math.min(dia, ultimoDia)
  const m = String(alvo.getUTCMonth() + 1).padStart(2, '0')
  return `${alvo.getUTCFullYear()}-${m}-${String(d).padStart(2, '0')}`
}

/** Semanal e quinzenal não têm passo em meses: avançam em dias. */
const PASSO_DIAS: Record<string, number> = { WEEKLY: 7, BIWEEKLY: 14 }

function avancarDias(iso: string, passos: number, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia + passos * dias))
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'method not allowed' }, 405)

  if (!API_KEY) {
    // Ambiente sem o segredo não fala com gateway nenhum, de propósito:
    // é a trava de isolamento do §14.4. A tela mostra esta mensagem, que
    // é melhor do que uma previsão vazia sem explicação.
    return json({ erro: 'ASAAS_API_KEY ausente neste ambiente' }, 503)
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let corpo: { modo?: string } = {}
  try {
    corpo = await req.json()
  } catch {
    corpo = {}
  }

  // Chamada de pessoa (botão "Atualizar") é conferida com o token dela:
  // previsão é número financeiro, então só gestão dispara. O cron entra
  // com `modo: 'cron'` e a anon key, e a autorização real ali é a
  // service key usada acima — igual a `asaas-cobranca`.
  if (corpo.modo !== 'cron') {
    const auth = req.headers.get('Authorization') ?? ''
    const comoUsuario = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )
    const { data: ehGestao } = await comoUsuario.rpc('is_gestao')
    if (!ehGestao) return json({ erro: 'acesso restrito' }, 403)
  }

  const hoje = new Date().toISOString().slice(0, 10)

  let assinaturas: Assinatura[]
  let pendentes: Cobranca[]
  try {
    // As duas listas em paralelo: são independentes e o orçamento de
    // tempo da função é curto.
    const [a, p] = await Promise.all([
      todas<Assinatura>('/subscriptions?status=ACTIVE'),
      todas<Cobranca>('/payments?status=PENDING'),
    ])
    assinaturas = a
    pendentes = p
  } catch (e) {
    // Gateway fora do ar não apaga a previsão de ninguém: a função
    // devolve erro e a tabela fica como estava.
    return json({ erro: String(e instanceof Error ? e.message : e) }, 502)
  }

  // Nome, CPF e e-mail de cada pessoa, para o banco casar com `clientes`.
  // Uma chamada só, não uma por linha.
  const clientes = new Map<string, Cliente>()
  try {
    for (const c of await todas<Cliente>('/customers')) clientes.set(c.id, c)
  } catch {
    // Sem a lista de clientes a previsão ainda vale: ela só casa menos
    // gente automaticamente, e a tela oferece vincular à mão.
  }

  const linhas: Record<string, unknown>[] = []

  function pessoa(cus: string) {
    const c = clientes.get(cus)
    return {
      asaas_customer_id: cus,
      nome_no_gateway: c?.name ?? null,
      cpf_no_gateway: c?.cpfCnpj ?? null,
      email_no_gateway: c?.email ?? null,
    }
  }

  // 1. As cobranças que o Asaas já emitiu e ainda vão vencer.
  //
  // Cobrança vencida (OVERDUE) fica de fora: ela não é previsão, é
  // atraso — e atraso que o sistema conhece já está em Entradas pelo
  // webhook. Prever o passado inflaria o mês corrente.
  const mesesComCobranca = new Set<string>()
  for (const p of pendentes) {
    if (!p.dueDate || p.dueDate < hoje) continue
    linhas.push({
      ref: `pay_${p.id}`,
      tipo: 'cobranca',
      ...pessoa(p.customer),
      vencimento: p.dueDate,
      valor_centavos: centavos(p.value),
      descricao: p.description ?? null,
    })
    if (p.subscription) mesesComCobranca.add(`${p.subscription}@${p.dueDate.slice(0, 7)}`)
  }

  // 2. O que cada assinatura ainda vai gerar.
  for (const s of assinaturas) {
    if (s.deleted) continue
    const mesesPorPasso = PASSO_MESES[s.cycle]
    const dias = PASSO_DIAS[s.cycle]
    if (!mesesPorPasso && !dias) continue // ciclo desconhecido: não invento data

    for (let k = 0; k < CICLOS_PROJETADOS; k++) {
      const venc = mesesPorPasso
        ? avancar(s.nextDueDate, k, mesesPorPasso)
        : avancarDias(s.nextDueDate, k, dias)
      if (venc < hoje) continue
      // O mês que já tem cobrança emitida desta assinatura não entra:
      // seria o mesmo dinheiro duas vezes.
      if (mesesComCobranca.has(`${s.id}@${venc.slice(0, 7)}`)) continue
      linhas.push({
        ref: `sub_${s.id}@${venc.slice(0, 7)}`,
        tipo: 'assinatura',
        ...pessoa(s.customer),
        vencimento: venc,
        valor_centavos: centavos(s.value),
        descricao: s.description ?? null,
      })
    }
  }

  const { data, error } = await sb.rpc('sincronizar_previsao_asaas', {
    p_linhas: linhas,
    // A afirmação de que o gateway está mesmo vazio só sai daqui, e só
    // quando as duas listas vieram vazias de verdade (sem erro no meio).
    p_gateway_vazio: linhas.length === 0,
  })
  if (error) return json({ erro: error.message }, 500)

  return json({
    ok: true,
    assinaturas_ativas: assinaturas.length,
    cobrancas_pendentes: pendentes.length,
    linhas_enviadas: linhas.length,
    resultado: data,
  })
})
