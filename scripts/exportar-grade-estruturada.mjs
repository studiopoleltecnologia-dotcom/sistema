// Exporta as pranchas de docs/marketing/grade-estruturada.src.html.
// Uso: node scripts/exportar-grade-estruturada.mjs  (depois do gerador)
//
// Saída em STUDIO POLE L/GRADE-ESTRUTURADA/:
//   geral/                2 PNGs — Manhã & Tarde, Noite
//   diarias/              6 PNGs — um story por dia da semana
//   comparativo/          4 PNGs — E2 e E3, só para a equipe decidir
//   grade-2-salas.pdf     8 páginas — o material publicável (E1)
//   comparativo-estruturas.pdf   4 páginas
//
// Dois PDFs de propósito: o que vai para o story não se mistura com o que
// serve só para escolher a estrutura.
import { chromium } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'

const SRC = 'C:/Users/carol/Documents/STUDIO POLE L/Claude/docs/marketing/grade-estruturada.src.html'
const DEST = 'C:/Users/carol/Documents/STUDIO POLE L/GRADE-ESTRUTURADA'
const url = 'file:///' + SRC.replace(/ /g, '%20')

// Nome do arquivo sai do id da prancha — some a lista fixa que desatualiza
// toda vez que um dia entra ou sai da grade.
const ORDEM_DIA = { seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 }
function destinoDe(id) {
  const m = id.match(/^e1-dia-(\w+)$/)
  if (m) return `diarias/${String(ORDEM_DIA[m[1]]).padStart(2, '0')}-${m[1]}`
  if (id === 'e1-manha-tarde') return 'geral/01-manha-tarde'
  if (id === 'e1-noite') return 'geral/02-noite'
  return `comparativo/${id}`
}

rmSync(DEST, { recursive: true, force: true })   // evita PNG órfão de dia removido

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1160, height: 1200 }, deviceScaleFactor: 1 })
await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(600)

const ids = await p.evaluate(() => [...document.querySelectorAll('.prancha')].map(el => el.id))

for (const id of ids) {
  const destino = `${DEST}/${destinoDe(id)}.png`
  mkdirSync(destino.slice(0, destino.lastIndexOf('/')), { recursive: true })
  await (await p.$('#' + id)).screenshot({ path: destino })
}
console.log(ids.length, 'PNGs 1080x1920')

// preferCSSPageSize faz o @page de 1080x1920 valer — sem ele o Canva recebe A4.
await p.emulateMedia({ media: 'print' })
await p.addStyleTag({ content: 'body{ background:#fff; gap:0; padding:0; }' })

const publicaveis = ids.filter(id => id.startsWith('e1-')).length
for (const [arquivo, faixa, quantas] of [
  ['grade-2-salas.pdf', `1-${publicaveis}`, publicaveis],
  ['comparativo-estruturas.pdf', `${publicaveis + 1}-${ids.length}`, ids.length - publicaveis],
]) {
  await p.pdf({ path: `${DEST}/${arquivo}`, printBackground: true, preferCSSPageSize: true, pageRanges: faixa })
  console.log(`${arquivo} — ${quantas} páginas`)
}

await b.close()
