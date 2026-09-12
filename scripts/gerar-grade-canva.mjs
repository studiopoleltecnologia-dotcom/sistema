// Gera arte/grade-canva.html — as 8 pranchas para IMPORTAR NO CANVA EDITÁVEL.
//
// Por que existe, já que gerar-grade-estruturada.mjs faz a mesma arte:
// aquele produz PDF, e o importador de PDF do Canva achata tudo. Medido em
// 11/09/2026 na página 8 do design importado: a estrutura toda virou uma
// imagem de fundo e o texto veio partido ("Nat halia", "F lexibilidade").
// O caminho editável é importar HTML com data-document-role="page".
//
// A consequência de projeto: aqui NÃO se usa grid nem flex para montar a
// tabela. Cada célula, cada fio e cada texto é um elemento posicionado em
// pixel absoluto — é isso que faz cada um chegar no Canva como objeto que se
// seleciona e se move sozinho. A geometria é calculada aqui em JS, não
// delegada ao layout do navegador.
//
// Uso: node scripts/gerar-grade-canva.mjs
import { writeFileSync } from 'node:fs'
import {
  DIAS, DIA_LONGO, SALAS, GRADE, HORAS, BLOCOS, FAMILIAS,
  familia, esc, prof, aulasDe, salaUsada, horasComAula, familiasEm,
} from './grade-dados.mjs'

const RAIZ = 'C:/Users/carol/Documents/STUDIO POLE L/Claude'
const DEST = `${RAIZ}/arte/grade-canva.html`
// O logo entra por URL pública, não embutido: repetido em base64 nas 8
// páginas ele sozinho levava o arquivo a 3,9 MB.
const LOGO = 'https://raw.githubusercontent.com/studiopoleltecnologia-dotcom/sistema/'
  + 'feat/arte-grade-2-salas/arte/logo-mandala-512.png'

// ---------------------------------------------------------------- paleta
const AMEIXA = '#443a66'
const TINTA = '#241f37'
const FIO = '#ded8ec'
const VAZIO = '#f2eff7'
const HORA_BG = '#efecf6'
const FUNDO = '#fbfaf8'
const CORES = {
  aereos:  ['#ddd5ef', '#3a2f5c'],
  danca:   ['#f7e2c2', '#8a5410'],
  casinha: ['#cfe9e7', '#175f5d'],
  cond:    ['#e0e8c9', '#4c5a18'],
}

const W = 1080, H = 1920
const MARGEM = 44
const LARG = W - MARGEM * 2          // 992

// ---------------------------------------------------------------- peças
const px = n => `${Math.round(n)}px`
const el = (estilo, conteudo = '') => `  <div style="position:absolute;${estilo}">${conteudo}</div>`

const retangulo = (x, y, w, h, cor, extra = '') =>
  el(`left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};background:${cor};${extra}`)

// Fio como retângulo próprio, não como border: border vira propriedade de
// outro objeto e some na importação; retângulo chega como forma que se move.
const fioH = (x, y, w, esp, cor) => retangulo(x, y, w, esp, cor)
const fioV = (x, y, h, esp, cor) => retangulo(x, y, esp, h, cor)

const texto = (x, y, w, h, txt, o = {}) => {
  const {
    tam = 20, peso = 800, cor = TINTA, fonte = 'Nunito',
    alinha = 'center', maiusc = false, espaco = 0, opacidade = 1, altura = 1.1,
  } = o
  return el(
    `left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};` +
    `display:flex;align-items:center;justify-content:${alinha === 'center' ? 'center' : 'flex-start'};` +
    `font-family:'${fonte}',sans-serif;font-size:${px(tam)};font-weight:${peso};color:${cor};` +
    `line-height:${altura};text-align:${alinha};opacity:${opacidade};` +
    (maiusc ? 'text-transform:uppercase;' : '') +
    (espaco ? `letter-spacing:${espaco}em;` : ''),
    esc(txt))
}

// ---------------------------------------------------------------- cabeçalho
function topo(chapeu, tit, usadas, tamTit = 82) {
  const out = []
  out.push(retangulo(0, 0, W, 12, AMEIXA, 'background:linear-gradient(90deg,#591a49,#443a66 55%,#db8735);'))
  out.push(texto(MARGEM, 54, 400, 32, '@studiopolel',
    { tam: 23, peso: 700, cor: '#8d84b3', fonte: 'League Spartan', alinha: 'left', maiusc: true, espaco: .3 }))
  out.push(el(`left:${px(W - MARGEM - 80)};top:54px;width:80px;height:80px;`,
    `<img src="${LOGO}" alt="" style="width:80px;height:80px;object-fit:contain">`))
  out.push(texto(MARGEM, 158, 600, 30, chapeu,
    { tam: 23, peso: 700, cor: '#8d84b3', fonte: 'League Spartan', alinha: 'left', maiusc: true, espaco: .2 }))
  out.push(texto(MARGEM, 194, 900, tamTit + 14, tit,
    { tam: tamTit, peso: 800, cor: TINTA, fonte: 'League Spartan', alinha: 'left', altura: 1 }))

  // legenda: cada família é um retângulo com seu texto por cima
  let x = MARGEM
  const yL = 200 + tamTit + 26
  for (const [k, nome] of FAMILIAS) {
    if (!usadas.has(k)) continue
    const w = nome.length * 11.5 + 30
    out.push(retangulo(x, yL, w, 36, CORES[k][0], 'border-radius:4px;'))
    out.push(texto(x, yL, w, 36, nome,
      { tam: 19, peso: 800, cor: CORES[k][1], fonte: 'League Spartan', maiusc: true, espaco: .05 }))
    x += w + 9
  }
  return { out, yTabela: yL + 36 + 26 }
}

const rodape = y => texto(MARGEM, y, LARG, 34, 'Reserve pelo app · link na bio',
  { tam: 22, peso: 700, cor: '#8d84b3' })

// ---------------------------------------------------------------- semanal
// Colunas: hora | sala | 6 dias. A largura de cada uma é fixada aqui para que
// o Canva receba coordenadas, não uma tabela que ele precise interpretar.
const C_HORA = 78, C_SALA = 104
const C_DIA = (LARG - C_HORA - C_SALA) / 6
const xDia = i => MARGEM + C_HORA + C_SALA + i * C_DIA

function pranchaSemana(blocoPeriodo) {
  const horas = horasComAula(blocoPeriodo.horas)
  const { out, yTabela } = topo('Grade de horários', blocoPeriodo.titulo, familiasEm(horas))

  const yFim = H - 46 - 40
  const hCab = 50
  const y0 = yTabela + hCab
  const alturaCorpo = yFim - y0

  const grupos = horas.map(h => ({ h, salas: [1, 2].filter(s => salaUsada([h], s)) }))
  const totalFaixas = grupos.reduce((t, g) => t + g.salas.length, 0)
  const hFaixa = alturaCorpo / totalFaixas

  // fundo do corpo — uma peça só, para não gerar 80 retângulos de célula vazia
  out.push(retangulo(MARGEM, y0, LARG, alturaCorpo, VAZIO))
  out.push(retangulo(MARGEM, y0, C_HORA, alturaCorpo, HORA_BG))

  // barra de cabeçalho
  out.push(retangulo(MARGEM, yTabela, LARG, hCab, AMEIXA))
  out.push(texto(MARGEM, yTabela, C_HORA, hCab, 'Hora',
    { tam: 17, peso: 700, cor: '#b8aede', fonte: 'League Spartan', maiusc: true, espaco: .14 }))
  out.push(texto(MARGEM + C_HORA, yTabela, C_SALA, hCab, 'Sala',
    { tam: 17, peso: 700, cor: '#b8aede', fonte: 'League Spartan', maiusc: true, espaco: .14 }))
  DIAS.forEach((d, i) => out.push(texto(xDia(i), yTabela, C_DIA, hCab, d,
    { tam: 24, peso: 700, cor: '#fff', fonte: 'League Spartan', maiusc: true, espaco: .05 })))

  // aulas, rótulos de sala e horas
  let y = y0
  for (const g of grupos) {
    const hGrupo = hFaixa * g.salas.length
    out.push(texto(MARGEM, y, C_HORA, hGrupo, g.h,
      { tam: 26, peso: 800, cor: TINTA, fonte: 'League Spartan' }))

    g.salas.forEach((s, k) => {
      const yF = y + k * hFaixa
      out.push(retangulo(MARGEM + C_HORA, yF, C_SALA, hFaixa, s === 1 ? AMEIXA : '#fff'))
      if (s === 2) {
        // contorno da Sala 2 desenhado como 4 fios, para cada um ser editável
        out.push(fioH(MARGEM + C_HORA, yF, C_SALA, 3, AMEIXA))
        out.push(fioH(MARGEM + C_HORA, yF + hFaixa - 3, C_SALA, 3, AMEIXA))
        out.push(fioV(MARGEM + C_HORA, yF, hFaixa, 3, AMEIXA))
        out.push(fioV(MARGEM + C_HORA + C_SALA - 3, yF, hFaixa, 3, AMEIXA))
      }
      out.push(texto(MARGEM + C_HORA, yF, C_SALA, hFaixa, SALAS[s],
        { tam: 18, peso: 800, cor: s === 1 ? '#fff' : AMEIXA, fonte: 'League Spartan', maiusc: true, espaco: .08 }))

      DIAS.forEach((d, i) => {
        for (const a of aulasDe(g.h, d, s)) {
          const [fundo, tintaTxt] = CORES[familia(a[0])]
          out.push(retangulo(xDia(i), yF, C_DIA, hFaixa, fundo))
          out.push(texto(xDia(i) + 4, yF + hFaixa / 2 - 26, C_DIA - 8, 34, a[0],
            { tam: 19, peso: 800, cor: tintaTxt, altura: 1.08 }))
          out.push(texto(xDia(i) + 4, yF + hFaixa / 2 + 8, C_DIA - 8, 22, prof(a[1]),
            { tam: 15, peso: 700, cor: tintaTxt, opacidade: .66 }))
        }
      })
    })
    y += hGrupo
  }

  // fios: verticais de coluna, horizontais de faixa, régua grossa por horário
  for (let i = 0; i <= 6; i++) out.push(fioV(xDia(i) - 1, y0, alturaCorpo, 1, FIO))
  out.push(fioV(MARGEM + C_HORA, y0, alturaCorpo, 3, AMEIXA))
  let yy = y0
  for (const g of grupos) {
    for (let k = 1; k < g.salas.length; k++) out.push(fioH(MARGEM + C_HORA, yy + k * hFaixa, LARG - C_HORA, 1, FIO))
    yy += hFaixa * g.salas.length
    if (yy < yFim - 1) out.push(fioH(MARGEM, yy - 1.5, LARG, 3, AMEIXA))
  }
  // moldura
  out.push(fioH(MARGEM, yTabela, LARG, 3, AMEIXA))
  out.push(fioH(MARGEM, yFim - 3, LARG, 3, AMEIXA))
  out.push(fioV(MARGEM, yTabela, yFim - yTabela, 3, AMEIXA))
  out.push(fioV(MARGEM + LARG - 3, yTabela, yFim - yTabela, 3, AMEIXA))

  out.push(rodape(yFim + 8))
  return pagina(`Grade ${blocoPeriodo.titulo}`, out)
}

// ---------------------------------------------------------------- diária
const D_HORA = 150, D_SALA = 168
const D_AULA = LARG - D_HORA - D_SALA

function pranchaDia(dia) {
  const horas = HORAS.filter(h => (GRADE[h]?.[dia] || []).length)
  const { out, yTabela } = topo('Grade de horários', DIA_LONGO[dia], familiasEm(horas, [dia]), 104)

  const yFim = H - 46 - 40
  const hCab = 52
  const y0 = yTabela + hCab
  const alturaCorpo = yFim - y0

  const linhas = horas.map(h => ({
    h, itens: [1, 2].flatMap(s => aulasDe(h, dia, s).map(a => ({ a, s }))),
  }))
  const totalItens = linhas.reduce((t, l) => t + l.itens.length, 0)
  const hItem = alturaCorpo / totalItens

  out.push(retangulo(MARGEM, y0, LARG, alturaCorpo, FUNDO))
  out.push(retangulo(MARGEM, y0, D_HORA, alturaCorpo, HORA_BG))

  out.push(retangulo(MARGEM, yTabela, LARG, hCab, AMEIXA))
  ;[['Hora', MARGEM, D_HORA], ['Sala', MARGEM + D_HORA, D_SALA], ['Aula', MARGEM + D_HORA + D_SALA, D_AULA]]
    .forEach(([t, x, w]) => out.push(texto(x + 20, yTabela, w - 20, hCab, t,
      { tam: 24, peso: 700, cor: '#fff', fonte: 'League Spartan', maiusc: true, espaco: .05, alinha: 'left' })))

  let y = y0
  for (const l of linhas) {
    const hLin = hItem * l.itens.length
    out.push(texto(MARGEM, y, D_HORA, hLin, l.h,
      { tam: 38, peso: 800, cor: TINTA, fonte: 'League Spartan' }))

    l.itens.forEach(({ a, s }, k) => {
      const yI = y + k * hItem
      const [fundo, tintaTxt] = CORES[familia(a[0])]
      out.push(retangulo(MARGEM + D_HORA, yI, D_SALA, hItem, s === 1 ? AMEIXA : FUNDO))
      if (s === 2) {
        out.push(fioV(MARGEM + D_HORA, yI, hItem, 4, AMEIXA))
        out.push(fioV(MARGEM + D_HORA + D_SALA - 4, yI, hItem, 4, AMEIXA))
      }
      out.push(texto(MARGEM + D_HORA + 20, yI, D_SALA - 20, hItem, SALAS[s],
        { tam: 21, peso: 800, cor: s === 1 ? '#fff' : AMEIXA, fonte: 'League Spartan',
          maiusc: true, espaco: .1, alinha: 'left' }))

      out.push(retangulo(MARGEM + D_HORA + D_SALA, yI, D_AULA, hItem, fundo))
      out.push(texto(MARGEM + D_HORA + D_SALA + 22, yI + hItem / 2 - 30, D_AULA - 40, 42, a[0],
        { tam: 34, peso: 800, cor: tintaTxt, alinha: 'left', altura: 1.06 }))
      out.push(texto(MARGEM + D_HORA + D_SALA + 22, yI + hItem / 2 + 8, D_AULA - 40, 30, prof(a[1]),
        { tam: 23, peso: 700, cor: tintaTxt, alinha: 'left', opacidade: .66 }))

      if (k > 0) out.push(fioH(MARGEM + D_HORA, yI, LARG - D_HORA, 1, FIO))
    })

    y += hLin
    if (y < yFim - 1) out.push(fioH(MARGEM, y - 1.5, LARG, 3, AMEIXA))
  }

  out.push(fioV(MARGEM + D_HORA, y0, alturaCorpo, 3, AMEIXA))
  out.push(fioH(MARGEM, yTabela, LARG, 3, AMEIXA))
  out.push(fioH(MARGEM, yFim - 3, LARG, 3, AMEIXA))
  out.push(fioV(MARGEM, yTabela, yFim - yTabela, 3, AMEIXA))
  out.push(fioV(MARGEM + LARG - 3, yTabela, yFim - yTabela, 3, AMEIXA))

  out.push(rodape(yFim + 8))
  return pagina(DIA_LONGO[dia], out)
}

// data-document-role="page" é o que faz o Canva tratar cada div como página.
function pagina(rotulo, elementos) {
  return `<div data-document-role="page" data-label="${esc(rotulo)}"
  style="position:relative;width:${px(W)};height:${px(H)};background:${FUNDO};overflow:hidden">
${elementos.join('\n')}
</div>`
}

// ---------------------------------------------------------------- montagem
const paginas = [
  ...BLOCOS.map(pranchaSemana),
  ...DIAS.map(pranchaDia),
]

writeFileSync(DEST, `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Grade 2 Salas — editável</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@600;700;800&family=Nunito:wght@400;600;700;800&display=swap">
<style>
  body{ margin:0; background:#e9e6ef; display:flex; flex-direction:column;
    align-items:center; gap:40px; padding:40px 0; }
  div{ box-sizing:border-box; }
</style>
</head>
<body>
${paginas.join('\n\n')}
</body>
</html>
`, 'utf8')

const n = paginas.reduce((t, p) => t + (p.match(/<div style="position:absolute/g) || []).length, 0)
console.log(`arte/grade-canva.html — ${paginas.length} páginas · ${n} elementos posicionados`)
console.log(`  ${BLOCOS.length} gerais + ${DIAS.length} diárias`)
