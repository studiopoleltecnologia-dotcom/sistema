// Relatório dos planos ATIVOS no Wix, para a gestão conferir as decisões de
// migração e falar com cada aluno antes da virada (docs/05-BACKLOG.md §3).
//
// Gera um HTML para abrir no navegador, com link de WhatsApp por pessoa.
// Não é o import — o import é `importar-wix-alunos.mjs`. Aqui o objetivo é
// leitura humana: quem é, o que paga, o que muda e o que precisa de decisão.
//
// Uso:
//   WIX_API_KEY=... node scripts/relatorio-wix-planos.mjs
//
// A saída cai em `relatorios/`, que está no .gitignore: o arquivo tem nome,
// e-mail e telefone de aluno real e o repo é público (CLAUDE.md §3).

const API_KEY = process.env.WIX_API_KEY
const SITE_ID = process.env.WIX_SITE_ID || '9fdc4e72-832b-4367-818e-2ea8abfef12d'
const SAIDA = process.env.SAIDA || 'relatorios/planos-ativos-wix.html'

if (!API_KEY) {
  console.error('Falta WIX_API_KEY no ambiente.')
  process.exit(1)
}

const base = 'https://www.wixapis.com'
const headers = { Authorization: API_KEY, 'wix-site-id': SITE_ID, 'Content-Type': 'application/json' }
const pegar = async (u) => {
  const r = await fetch(u, { headers })
  if (!r.ok) throw new Error(`${r.status} em ${u}`)
  return r.json()
}

// Destino de cada plano do Wix no ERP. Os legados foram criados com o MESMO
// nome (migration 20260921130000), então quase tudo é identidade; o que muda
// é o FORMATO, e é isso que a gestão precisa conferir.
const DESTINO = {
  'Plano Mensal  - 1x na semana': ['Legado por crédito', '4 créditos/mês'],
  'Plano Mensal - 2x na semana': ['Legado por crédito', '8 créditos/mês'],
  'Plano Mensal - 3x na semana': ['Legado por crédito', '12 créditos/mês'],
  'Plano Mensal - 4x por semana': ['Legado por crédito', '16 créditos/mês'],
  'Plano Trimestral - 1x por semana': ['Legado por crédito', '4 créditos/mês, 3 ciclos'],
  'Plano Semestral - 1x por semana': ['Legado por crédito', '4 créditos/mês, 6 ciclos'],
  'Plano Semestral - 2x por semana': ['Legado por crédito', '8 créditos/mês, 6 ciclos'],
  'Plano Mensal Dança do Ventre': ['Legado turma fixa', '1 turma fixa'],
  'Hatha Yoga - Perfil Social': ['Legado turma fixa', '1 turma fixa'],
  'Hatha Yoga - Perfil Amplo': ['Legado turma fixa', '1 turma fixa'],
  'Pacotes - 4 Aulas': ['Legado pacote', '4 créditos, 40 dias'],
  'Pacotes - 6 Aulas': ['Legado pacote', '6 créditos, 40 dias'],
  'Plano Equipe': ['Cortesia', 'sem cobrança'],
  'Aula Experimental': ['Catálogo atual', 'Aula experimental'],
  'Aula Avulsa': ['Catálogo atual', 'Aula avulsa'],
}

const canal = (n) => {
  const s = (n || '').toLowerCase()
  if (s.includes('wellhub') || s.includes('gympass')) return 'Wellhub'
  if (s.includes('totalpass') || s.includes('total pass')) return 'TotalPass'
  if (s.includes('equipe')) return 'Cortesia'
  return 'Mensalista'
}

const pedidos = []
for (let offset = 0; ; offset += 50) {
  const j = await pegar(`${base}/pricing-plans/v2/orders?orderStatuses=ACTIVE&limit=50&offset=${offset}`)
  pedidos.push(...(j.orders || []))
  if (!j.pagingMetadata?.hasNext) break
}
const contatos = new Map()
for (let offset = 0; ; offset += 1000) {
  const j = await pegar(`${base}/contacts/v4/contacts?paging.limit=1000&paging.offset=${offset}&fieldsets=FULL`)
  for (const c of j.contacts || []) contatos.set(c.id, c)
  if ((j.contacts || []).length < 1000) break
}

const linhas = pedidos.map((p) => {
  const c = contatos.get(p.buyer?.contactId)
  const i = c?.info || {}
  const plano = (p.planName || '').trim()
  const tel = (i.phones?.items?.[0]?.phone || '').replace(/\D/g, '')
  const [destino, formato] = DESTINO[plano] || ['— sem destino —', 'decidir']
  return {
    nome: [i.name?.first, i.name?.last].filter(Boolean).join(' ').trim() || '(sem nome no Wix)',
    email: i.emails?.items?.[0]?.email || '',
    tel,
    plano,
    canal: canal(plano),
    preco: Number(p.planPrice || 0),
    pagamento: p.lastPaymentStatus || '',
    cobranca: p.type === 'ONLINE' ? 'automática' : p.type === 'OFFLINE' ? 'manual' : '—',
    recorrente: !!p.pricing?.subscription,
    ciclo: p.currentCycle?.index ?? '',
    inicio: (p.startDate || '').slice(0, 10),
    fim: (p.currentCycle?.endedDate || p.endDate || '').slice(0, 10),
    destino,
    formato,
  }
})

const pagantes = linhas.filter((l) => l.canal === 'Mensalista')
const cortesias = linhas.filter((l) => l.canal === 'Cortesia')
const plataforma = linhas.filter((l) => l.canal === 'Wellhub' || l.canal === 'TotalPass')
const emAberto = pagantes.filter((l) => l.pagamento === 'UNPAID')
const turmaFixa = pagantes.filter((l) => l.destino === 'Legado turma fixa')
const semTel = pagantes.filter((l) => !l.tel)
const br = (d) => (d ? d.split('-').reverse().join('/') : '—')
const dinheiro = (v) => 'R$ ' + v.toFixed(2).replace('.', ',')
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const zap = (l) => (l.tel ? `<a href="https://wa.me/55${l.tel}">${l.tel}</a>` : '<span class="v">sem telefone</span>')

const tabela = (arr, titulo) => `
<h3>${esc(titulo)} <span class="n">${arr.length}</span></h3>
<table>
  <thead><tr><th>Aluno</th><th>Contato</th><th>Plano no Wix</th><th>Paga</th><th>Cobrança</th><th>Ciclo</th><th>Vence</th><th>Vira no sistema</th></tr></thead>
  <tbody>
  ${arr.map((l) => `<tr${l.pagamento === 'UNPAID' ? ' class="alerta"' : ''}>
    <td><strong>${esc(l.nome)}</strong><br><span class="v">${esc(l.email)}</span></td>
    <td>${zap(l)}</td>
    <td>${esc(l.plano)}</td>
    <td>${dinheiro(l.preco)}${l.pagamento === 'UNPAID' ? '<br><span class="tag">em aberto</span>' : ''}</td>
    <td>${l.cobranca}</td>
    <td>${l.ciclo || '—'}</td>
    <td>${br(l.fim)}</td>
    <td>${esc(l.destino)}<br><span class="v">${esc(l.formato)}</span></td>
  </tr>`).join('')}
  </tbody>
</table>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Planos ativos no Wix</title>
<style>
 :root { --texto:#1c1917; --fraco:#78716c; --linha:#e7e5e4; --alerta:#fef3c7; --fundo:#fff; }
 @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --texto:#f5f5f4; --fraco:#a8a29e; --linha:#44403c; --alerta:#422006; --fundo:#1c1917; } }
 * { box-sizing:border-box }
 body { font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif; color:var(--texto); background:var(--fundo); margin:0; padding:32px 16px; }
 main { max-width:1100px; margin:0 auto }
 h1 { font-size:24px; margin:0 0 4px } h2 { font-size:19px; margin:40px 0 8px; padding-top:16px; border-top:1px solid var(--linha) }
 h3 { font-size:15px; margin:24px 0 8px; font-weight:600 }
 .v { color:var(--fraco); font-size:13px } .n { color:var(--fraco); font-weight:400 }
 table { border-collapse:collapse; width:100%; font-size:13.5px } th { text-align:left; font-weight:600; color:var(--fraco); font-size:12px; text-transform:uppercase; letter-spacing:.03em }
 th,td { padding:8px 10px; border-bottom:1px solid var(--linha); vertical-align:top }
 tr.alerta td { background:var(--alerta) }
 .tag { font-size:11px; background:#dc2626; color:#fff; padding:1px 6px; border-radius:99px; display:inline-block }
 .cards { display:flex; gap:12px; flex-wrap:wrap; margin:16px 0 }
 .card { border:1px solid var(--linha); border-radius:10px; padding:12px 16px; min-width:130px }
 .card b { display:block; font-size:26px; font-weight:600 } .card span { color:var(--fraco); font-size:12px }
 a { color:inherit } ul { padding-left:20px } li { margin:4px 0 }
 @media (max-width:640px) { table,thead,tbody,tr,td,th { display:block } th { display:none } td { border:0; padding:2px 0 } tr { border-bottom:1px solid var(--linha); padding:10px 0; display:block } }
</style></head><body><main>
<h1>Planos ativos no Wix</h1>
<p class="v">Levantado direto da API do Wix em ${new Date().toLocaleString('pt-BR')} · ${linhas.length} assinaturas ativas, ${new Set(linhas.map((l) => l.email || l.nome)).size} pessoas</p>

<div class="cards">
  <div class="card"><b>${pagantes.length}</b><span>assinaturas pagas</span></div>
  <div class="card"><b>${emAberto.length}</b><span>com ciclo em aberto</span></div>
  <div class="card"><b>${cortesias.length}</b><span>cortesias da equipe</span></div>
  <div class="card"><b>${plataforma.filter((l) => l.canal === 'Wellhub').length}</b><span>Wellhub</span></div>
  <div class="card"><b>${plataforma.filter((l) => l.canal === 'TotalPass').length}</b><span>TotalPass</span></div>
  <div class="card"><b>${dinheiro(pagantes.filter((l) => l.recorrente).reduce((s, l) => s + l.preco, 0))}</b><span>mensal recorrente</span></div>
</div>

<h2>1. Precisa de decisão sua</h2>
${tabela(turmaFixa, 'Planos de modalidade única — virar turma fixa, e qual turma?')}
${tabela(emAberto, 'Ciclo marcado como NÃO PAGO no Wix')}
<p class="v">Cobrança "manual" = assinatura registrada à mão no Wix, que não cobra ninguém sozinho. O aluno em aberto ou não pagou, ou pagou e ninguém deu baixa.</p>
${semTel.length ? `<h3>Sem telefone no cadastro <span class="n">${semTel.length}</span></h3><p class="v">${semTel.map((l) => esc(l.nome)).join(' · ')}</p>` : ''}

<h2>2. Todos os planos pagos</h2>
${tabela(pagantes.filter((l) => l.recorrente), 'Assinaturas recorrentes')}
${tabela(pagantes.filter((l) => !l.recorrente), 'Pacotes e aulas avulsas')}

<h2>3. Cortesias da equipe</h2>
<p class="v">Professora ou sócia. Não é venda — entra no sistema como cliente com produto de cortesia, preço zero.</p>
${tabela(cortesias, 'Plano Equipe')}

<h2>4. Plataformas</h2>
<p class="v">Não precisam de contato sobre mudança de plano: continuam agendando pelo app da plataforma. Estão aqui só para conferência do volume.</p>
<h3>Wellhub <span class="n">${plataforma.filter((l) => l.canal === 'Wellhub').length}</span></h3>
<p class="v">${plataforma.filter((l) => l.canal === 'Wellhub').map((l) => esc(l.nome)).join(' · ')}</p>
<h3>TotalPass <span class="n">${plataforma.filter((l) => l.canal === 'TotalPass').length}</span></h3>
<p class="v">${plataforma.filter((l) => l.canal === 'TotalPass').map((l) => esc(l.nome)).join(' · ')}</p>
</main></body></html>`

const { writeFileSync, mkdirSync } = await import('node:fs')
const { dirname } = await import('node:path')
mkdirSync(dirname(SAIDA), { recursive: true })
writeFileSync(SAIDA, html)
console.log(`${linhas.length} assinaturas | ${pagantes.length} pagas | ${emAberto.length} em aberto | ${cortesias.length} cortesias`)
console.log(`Relatório: ${SAIDA} (contém dado pessoal — não versionar)`)
