// Exporta as pranchas de docs/marketing/grade-2-salas.src.html.
// Uso: node scripts/exportar-grade-2-salas.mjs  (depois de gerar-grade-2-salas.mjs)
//
// Saída em STUDIO POLE L/GRADE-2-SALAS/:
//   A-stories-por-dia/   6 PNGs 1080x1920
//   M1-vao-esquerda/     3 PNGs 1080x1920
//   M2-etiqueta/         3 PNGs 1080x1920
//   grade-2-salas.pdf    12 páginas 1080x1920 — é este arquivo que se joga no Canva
import { chromium } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'

const SRC = 'C:/Users/carol/Documents/STUDIO POLE L/Claude/docs/marketing/grade-2-salas.src.html'
const DEST = 'C:/Users/carol/Documents/STUDIO POLE L/GRADE-2-SALAS'
const url = 'file:///' + SRC.replace(/ /g, '%20')

const PASTA = { dia: 'A-stories-por-dia', m1: 'M1-vao-esquerda', m2: 'M2-etiqueta' }
const ORDEM = { seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, manha: 1, tarde: 2, noite: 3 }

rmSync(DEST, { recursive: true, force: true })   // evita PNG órfão de dia removido

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1160, height: 1200 }, deviceScaleFactor: 1 })
await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(600)

const pranchas = await p.evaluate(() =>
  [...document.querySelectorAll('.prancha')].map(el => ({
    id: el.id,
    grupo: el.classList.contains('dia') ? 'dia' : el.classList.contains('m1') ? 'm1' : 'm2',
  })))

for (const { id, grupo } of pranchas) {
  const chave = id.replace(/^(dia|m1|m2)-/, '')
  const nome = `${String(ORDEM[chave] ?? 0).padStart(2, '0')}-${chave}`
  const destino = `${DEST}/${PASTA[grupo]}/${nome}.png`
  mkdirSync(destino.slice(0, destino.lastIndexOf('/')), { recursive: true })
  await (await p.$('#' + id)).screenshot({ path: destino })
}
console.log(pranchas.length, 'PNGs 1080x1920')

// O PDF é o caminho de import no Canva: uma página por prancha, na medida certa.
// preferCSSPageSize faz o @page de 1080x1920 valer — sem ele o Canva recebe A4.
await p.emulateMedia({ media: 'print' })
await p.addStyleTag({ content: 'body{ background:#fff; gap:0; padding:0; }' })
await p.pdf({
  path: `${DEST}/grade-2-salas.pdf`,
  printBackground: true,
  preferCSSPageSize: true,
  pageRanges: '1-12',
})
console.log('PDF de 12 páginas →', `${DEST}/grade-2-salas.pdf`)

await b.close()
