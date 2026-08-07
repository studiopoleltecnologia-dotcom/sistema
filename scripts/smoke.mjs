// Smoke test do BUNDLE de produção (não o dev server): sobe o `vite preview`
// e valida que cada portal MONTA conteúdo (pega tela branca / base path errado
// / crash de runtime). Usa a lib `playwright` já presente no projeto.
//
// Gate: a rota montou conteúdo em #root? Erro de console (favicon 404, 401 de
// sessão anônima nos portais) é ruído esperado — vira aviso, não reprova.
//
// Uso local:  npm run build && npm run preview & ; node scripts/smoke.mjs
// CI:         SMOKE_BASE_URL + VITE_BASE definidos pelo workflow.
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:4173'
let vbase = process.env.VITE_BASE || '/'
if (!vbase.endsWith('/')) vbase += '/'

// hash routing: os 3 portais (CLAUDE.md 5.1)
const rotas = ['', '#/', '#/portal', '#/prof']

const browser = await chromium.launch()
const page = await browser.newPage()
const avisos = []
page.on('console', (m) => { if (m.type() === 'error') avisos.push(m.text()) })
page.on('pageerror', (e) => avisos.push(String(e)))

let falhou = false
for (const r of rotas) {
  const url = `${BASE}${vbase}${r}`
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(700) // deixa o SPA renderizar a rota
    const montou = await page.evaluate(() => {
      const el = document.querySelector('#root')
      return !!el && el.children.length > 0
    })
    console.log(`${montou ? 'OK   ' : 'FALHA'} ${url}`)
    if (!montou) falhou = true
  } catch (e) {
    console.error(`FALHA ${url} → ${e.message}`)
    falhou = true
  }
}
if (avisos.length) console.warn('Avisos de console (não reprovam):', avisos.slice(0, 20))
await browser.close()
if (falhou) { console.error('\nSMOKE FALHOU (alguma rota não montou)'); process.exit(1) }
console.log('\nSMOKE OK')
