// Exporta do Wix os alunos com PLANO ATIVO e gera o CSV de import do ERP.
//
// Por que existe: a operação ainda roda no Wix Bookings (docs/05-BACKLOG.md §3)
// e o ERP precisa nascer com os alunos que já pagam. O MCP do Wix consegue
// fazer a mesma leitura, mas página a página e sem repetir sozinho — isto aqui
// é o caminho repetível, para rodar de novo na véspera da virada.
//
// Uso:
//   WIX_API_KEY=... node scripts/importar-wix-alunos.mjs
//   WIX_API_KEY=... node scripts/importar-wix-alunos.mjs --saida alunos.csv
//
// A chave sai de manage.wix.com -> Configurações -> Chaves de API, com leitura
// em Pricing Plans e Contatos. NUNCA commitar a chave: o repo é público
// (CLAUDE.md §3). O CSV de saída também não entra — `*.csv` está no
// .gitignore justamente porque carrega nome, e-mail e telefone de aluno real.

const API_KEY = process.env.WIX_API_KEY
const SITE_ID = process.env.WIX_SITE_ID || '9fdc4e72-832b-4367-818e-2ea8abfef12d'
const SAIDA = arg('--saida') || 'wix-alunos-ativos.csv'

if (!API_KEY) {
  console.error('Falta WIX_API_KEY no ambiente. Veja o cabeçalho deste arquivo.')
  process.exit(1)
}

// Wix -> ERP, explícito de propósito: equivalência de plano é decisão de
// negócio, não semelhança de string.
//
// Desde 21/09/2026 (migration 20260921130000) os planos antigos existem no
// ERP com o MESMO NOME do Wix, como produto legado — fora do catálogo do
// aluno, mantido só para honrar quem já contratou. Por isso a maioria das
// entradas aqui é identidade: o destino é o produto legado homônimo, não o
// plano novo. Quem migra o aluno para o catálogo novo é a renovação, quando
// o ciclo contratado acabar — não este import.
//
// `null` = não vira matrícula nenhuma.
const MAPA_PRODUTO = {
  'Plano Mensal  - 1x na semana': 'Plano Mensal  - 1x na semana', // dois espaços, é assim no Wix
  'Plano Mensal - 2x na semana': 'Plano Mensal - 2x na semana',
  'Plano Mensal - 3x na semana': 'Plano Mensal - 3x na semana',
  'Plano Mensal - 4x por semana': 'Plano Mensal - 4x por semana',
  'Plano Trimestral - 1x por semana': 'Plano Trimestral - 1x por semana',
  'Plano Semestral - 1x por semana': 'Plano Semestral - 1x por semana',
  'Plano Semestral - 2x por semana': 'Plano Semestral - 2x por semana',
  'Plano Mensal Dança do Ventre': 'Plano Mensal Dança do Ventre',
  'Hatha Yoga - Perfil Social': 'Hatha Yoga - Perfil Social',
  'Hatha Yoga - Perfil Amplo': 'Hatha Yoga - Perfil Amplo',
  'Pacotes - 4 Aulas': 'Pacotes - 4 Aulas',
  'Pacotes - 6 Aulas': 'Pacotes - 6 Aulas',
  'Plano Equipe': 'Plano Equipe',
  // Estes dois já existiam no catálogo novo com o mesmo preço — não houve
  // legado a criar, o import cai direto no produto atual.
  'Aula Experimental': 'Aula experimental',
  'Aula Avulsa': 'Aula avulsa',
}

const base = 'https://www.wixapis.com'
const headers = { Authorization: API_KEY, 'wix-site-id': SITE_ID, 'Content-Type': 'application/json' }

async function pegar(url) {
  const r = await fetch(url, { headers })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} em ${url}\n${await r.text()}`)
  return r.json()
}

// Pedidos: até 50 por página, paginação por offset (não há cursor aqui).
async function pedidosAtivos() {
  const todos = []
  for (let offset = 0; ; offset += 50) {
    const j = await pegar(`${base}/pricing-plans/v2/orders?orderStatuses=ACTIVE&limit=50&offset=${offset}`)
    todos.push(...(j.orders || []))
    if (!j.pagingMetadata?.hasNext) break
  }
  return todos
}

// Contatos: puxa todos de uma vez e indexa por id. Sai mais barato que uma
// consulta por aluno, e o estúdio tem ordem de centenas de contatos.
async function contatosPorId() {
  const mapa = new Map()
  for (let offset = 0; ; offset += 1000) {
    const j = await pegar(`${base}/contacts/v4/contacts?paging.limit=1000&paging.offset=${offset}&fieldsets=FULL`)
    for (const c of j.contacts || []) mapa.set(c.id, c)
    if ((j.contacts || []).length < 1000) break
  }
  return mapa
}

// O canal decide o que o ERP faz com a pessoa: aluno de plataforma não vira
// mensalista nem entra em cobrança. TotalPass ainda não existe como canal no
// banco — é o item X5 do backlog.
function canal(nomePlano) {
  const n = (nomePlano || '').toLowerCase()
  if (n.includes('wellhub') || n.includes('gympass')) return 'wellhub'
  if (n.includes('totalpass') || n.includes('total pass')) return 'totalpass'
  if (n.includes('classpass')) return 'classpass'
  return 'mensalista'
}

function csv(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const pedidos = await pedidosAtivos()
const contatos = await contatosPorId()

const linhas = []
const semContato = []
for (const p of pedidos) {
  const c = contatos.get(p.buyer?.contactId)
  if (!c) { semContato.push(p.id); continue }
  const info = c.info || {}
  const nome = [info.name?.first, info.name?.last].filter(Boolean).join(' ').trim()
  const plano = (p.planName || '').trim()
  linhas.push({
    nome: nome || '(sem nome)',
    email: info.emails?.items?.[0]?.email || '',
    telefone: info.phones?.items?.[0]?.phone || '',
    plano_wix: plano,
    produto_erp: MAPA_PRODUTO[plano] ?? '',
    canal: canal(plano),
    preco: p.planPrice ?? '',
    pagamento: p.lastPaymentStatus ?? '',
    inicio: (p.startDate || '').slice(0, 10),
    fim_ciclo: (p.currentCycle?.endedDate || p.endDate || '').slice(0, 10),
    ciclo: p.currentCycle?.index ?? '',
    contact_id: c.id,
    order_id: p.id,
  })
}

const colunas = Object.keys(linhas[0] || { nome: '' })
const { writeFileSync } = await import('node:fs')
writeFileSync(SAIDA, [colunas.join(','), ...linhas.map((l) => colunas.map((k) => csv(l[k])).join(','))].join('\n'))

// Resumo no terminal: é aqui que se enxerga o que vai dar trabalho na virada
// (plano sem produto correspondente, pedido pago mas em aberto, etc).
const porCanal = {}
const porPlano = {}
const semProduto = new Set()
for (const l of linhas) {
  porCanal[l.canal] = (porCanal[l.canal] || 0) + 1
  porPlano[l.plano_wix] = (porPlano[l.plano_wix] || 0) + 1
  if (l.canal === 'mensalista' && !l.produto_erp) semProduto.add(l.plano_wix)
}

console.log(`${pedidos.length} pedidos ativos, ${linhas.length} com contato, ${new Set(linhas.map((l) => l.contact_id)).size} pessoas`)
console.log('Por canal:', porCanal)
console.log('Por plano:')
for (const [k, v] of Object.entries(porPlano).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`)
if (semProduto.size) console.log('SEM produto no ERP (ver X4 do backlog):', [...semProduto])
if (semContato.length) console.log(`${semContato.length} pedidos sem contato correspondente (comprador apagado?)`)
console.log(`\nCSV: ${SAIDA} — contém dado pessoal, não versionar.`)

function arg(nome) {
  const i = process.argv.indexOf(nome)
  return i > -1 ? process.argv[i + 1] : null
}
