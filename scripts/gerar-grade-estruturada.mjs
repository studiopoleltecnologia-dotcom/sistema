// Gera docs/marketing/grade-estruturada.src.html — 9 pranchas de 1080x1920.
//
// Três estruturas para a mesma grade, todas em lógica de TABELA DIAGRAMADA:
// célula com borda, bloco preenchido de ponta a ponta, cabeçalho com peso.
// O que muda entre elas é onde a sala mora.
//
//   E1  sala parte a LINHA do horário em duas faixas rotuladas
//   E2  sala parte a COLUNA do dia em duas sub-colunas fixas
//   E3  uma tabela fechada por sala, empilhadas na mesma tela
//
// Cada estrutura sai em 3 pranchas: Manhã & Tarde, Noite e um story diário.
//
// Uso: node scripts/gerar-grade-estruturada.mjs && node scripts/exportar-grade-estruturada.mjs
import { writeFileSync, readFileSync } from 'node:fs'
import {
  DIAS, DIA_LONGO, SALAS, GRADE, HORAS, BLOCOS, FAMILIAS,
  familia, esc, prof, aulasDe, salaUsada, horasComAula, familiasEm,
} from './grade-dados.mjs'

const RAIZ = 'C:/Users/carol/Documents/STUDIO POLE L/Claude'
const DEST = `${RAIZ}/docs/marketing/grade-estruturada.src.html`
const LOGO = 'data:image/png;base64,' +
  readFileSync(`${RAIZ}/docs/marketing/canva/logo-mandala-512.png`).toString('base64')

const DIA_MOSTRA = 'QUI'   // dia mais cheio — é o que estressa o layout diário

// ---------------------------------------------------------------- comuns
const marca = `
      <div class="marca">
        <span class="arroba">@studiopolel</span>
        <img class="mandala" src="${LOGO}" alt="">
      </div>`

const titulo = (chapeu, t) => `
      <div class="titulo-bloco">
        <div class="chapeu">${chapeu}</div>
        <h1>${t}</h1>
      </div>`

const legenda = usadas => `
      <div class="legenda">
        ${FAMILIAS.filter(([k]) => usadas.has(k))
          .map(([k, nome]) => `<span class="lg lg-${k}">${nome}</span>`).join('\n        ')}
      </div>`

const rodape = '<div class="rodape">Reserve pelo app · link na bio</div>'

// Bloco de aula. Preenchido até a borda da célula, sem cantinho flutuando:
// é isso que faz a grade parecer tabela e não etiqueta solta.
const bloco = (a, extra = '') =>
  `<div class="aula f-${familia(a[0])} ${extra}"><b>${esc(a[0])}</b><i>${prof(a[1])}</i></div>`

const cel = (conteudo, cls = '') =>
  `<div class="cel ${cls}">${conteudo}</div>`

const vazia = (cls = '') => `<div class="cel vaga ${cls}"></div>`

// ================================================================ E1
// A linha do horário é uma faixa fechada, com régua grossa separando um
// horário do outro. Dentro dela, uma sub-faixa por sala, cada uma aberta por
// um rótulo fixo na coluna da esquerda. Horário que só tem uma sala mostra
// uma sub-faixa só — a régua grossa continua marcando onde a hora termina.
function tabelaE1(horas) {
  const cabeca = `
        <div class="e1-cab">
          <span class="c-hora">Hora</span>
          <span class="c-sala">Sala</span>
          ${DIAS.map(d => `<span>${d}</span>`).join('\n          ')}
        </div>`

  const corpo = horas.map(h => {
    const salas = [1, 2].filter(s => salaUsada([h], s))
    const faixas = salas.map(s => `
            <div class="e1-faixa">
              <div class="e1-rot r-${s}">${SALAS[s]}</div>
              ${DIAS.map(d => {
                const as = aulasDe(h, d, s)
                return as.length ? cel(as.map(a => bloco(a)).join('')) : vazia()
              }).join('\n              ')}
            </div>`).join('')
    return `
          <div class="e1-grupo" style="flex:${salas.length}">
            <div class="e1-hora">${h}</div>
            <div class="e1-faixas">${faixas}
            </div>
          </div>`
  }).join('')

  return `      <div class="tabela e1-tab">${cabeca}
        <div class="e1-corpo">${corpo}
        </div>
      </div>`
}

// ================================================================ E2
// O dia se parte em duas sub-colunas fixas, com cabeçalho próprio. A coluna
// da Sala 2 leva um fundo tonal que corre a tabela inteira, e a divisória
// entre dias é grossa — é ela que impede a leitura de virar sopa de células.
function tabelaE2(horas) {
  const cabeca = `
        <div class="e2-cab1">
          <span class="c-hora"></span>
          ${DIAS.map(d => `<span>${d}</span>`).join('\n          ')}
        </div>
        <div class="e2-cab2">
          <span class="c-hora">Hora</span>
          ${DIAS.map(() => '<span class="s1">Sala 1</span><span class="s2">Sala 2</span>').join('\n          ')}
        </div>`

  const corpo = horas.map(h => `
          <div class="e2-lin">
            <div class="e2-hora">${h}</div>
            ${DIAS.flatMap(d => [1, 2].map(s => {
              const as = aulasDe(h, d, s)
              const cls = (s === 2 ? 'col2' : 'col1') + (s === 2 ? ' fimdia' : '')
              return as.length ? cel(as.map(a => bloco(a)).join(''), cls) : vazia(cls)
            })).join('\n            ')}
          </div>`).join('')

  return `      <div class="tabela e2-tab">${cabeca}
        <div class="e2-corpo">${corpo}
        </div>
      </div>`
}

// ================================================================ E3
// Uma tabela fechada por sala, empilhadas. A sala deixa de ser marcador e
// vira título de tabela — o jeito mais explícito possível. Funciona porque a
// Sala 2 tem poucas aulas: a tabela dela nasce curta e não disputa altura.
function tabelaE3(horas) {
  return [1, 2].map(s => {
    const hs = horas.filter(h => DIAS.some(d => aulasDe(h, d, s).length))
    if (!hs.length) return ''
    const cabeca = `
          <div class="e3-cab">
            <span class="c-hora">Hora</span>
            ${DIAS.map(d => `<span>${d}</span>`).join('\n            ')}
          </div>`
    const corpo = hs.map(h => `
            <div class="e3-lin">
              <div class="e3-hora">${h}</div>
              ${DIAS.map(d => {
                const as = aulasDe(h, d, s)
                return as.length ? cel(as.map(a => bloco(a)).join('')) : vazia()
              }).join('\n              ')}
            </div>`).join('')
    return `      <div class="tabela e3-tab" style="flex:${Math.max(hs.length, 2)}">
        <div class="e3-titulo t-${s}">${SALAS[s]}<em>${hs.length} horário${hs.length > 1 ? 's' : ''}</em></div>
        <div class="e3-grade">${cabeca}
          <div class="e3-corpo">${corpo}
          </div>
        </div>
      </div>`
  }).join('\n')
}

// ---------------------------------------------------------------- semanais
function pranchaSemana(est, blocoPeriodo) {
  const horas = horasComAula(blocoPeriodo.horas)
  const tabela = est === 'e1' ? tabelaE1(horas) : est === 'e2' ? tabelaE2(horas) : tabelaE3(horas)
  return `
  <div class="prancha ${est}" id="${est}-${blocoPeriodo.id}">
    <div class="fio"></div>
    <div class="miolo">
      ${marca}
      ${titulo('Grade de horários', blocoPeriodo.titulo)}
      ${legenda(familiasEm(horas))}
${tabela}
      ${rodape}
    </div>
  </div>`
}

// ---------------------------------------------------------------- diária
// Leitura vertical: HORÁRIO → MODALIDADE → SALA. Cada horário é uma linha
// fechada; quando as duas salas rodam junto, as duas aulas ficam dentro da
// mesma linha, uma sob a outra, cada uma com sua etiqueta de sala.
function pranchaDia(est, dia) {
  const horas = HORAS.filter(h => (GRADE[h]?.[dia] || []).length)

  const linhas = horas.map(h => {
    const itens = [1, 2].flatMap(s => aulasDe(h, dia, s).map(a => ({ a, s })))
    const corpo = itens.map(({ a, s }) => `
              <div class="d-item">
                <span class="d-sala ds-${s}">${SALAS[s]}</span>
                <div class="d-aula f-${familia(a[0])}"><b>${esc(a[0])}</b><i>${prof(a[1])}</i></div>
              </div>`).join('')
    return `
          <div class="d-lin" style="flex:${itens.length}">
            <div class="d-hora">${h}</div>
            <div class="d-itens">${corpo}
            </div>
          </div>`
  }).join('')

  return `
  <div class="prancha dia ${est}" id="${est}-dia-${dia.toLowerCase().replace('á', 'a')}">
    <div class="fio"></div>
    <div class="miolo">
      ${marca}
      ${titulo('Grade de horários', DIA_LONGO[dia])}
      ${legenda(familiasEm(horas, [dia]))}
      <div class="tabela d-tab">
        <div class="d-cab"><span>Hora</span><span>Sala</span><span>Aula</span></div>
        <div class="d-corpo">${linhas}
        </div>
      </div>
      ${rodape}
    </div>
  </div>`
}

// ---------------------------------------------------------------- CSS
const CSS = `
  @page { size: 1080px 1920px; margin: 0; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ background:#e9e6ef; font-family:"Nunito","Segoe UI",system-ui,sans-serif;
    display:flex; flex-direction:column; align-items:center; gap:40px; padding:40px 0; }

  .prancha{ width:1080px; height:1920px; background:#fbfaf8; color:#241f37;
    display:flex; flex-direction:column; overflow:hidden; break-after:page; }
  .prancha:last-child{ break-after:auto; }
  .fio{ height:12px; flex:none; background:linear-gradient(90deg,#591a49,#443a66 55%,#db8735); }
  .miolo{ flex:1; min-height:0; padding:54px 44px 46px;
    display:flex; flex-direction:column; gap:20px; }

  .marca{ display:flex; align-items:center; justify-content:space-between; flex:none; }
  .arroba{ font-family:"League Spartan",sans-serif; text-transform:uppercase; letter-spacing:.3em;
    font-size:23px; font-weight:700; color:#8d84b3; }
  .mandala{ width:80px; height:80px; object-fit:contain; }
  .titulo-bloco{ flex:none; display:flex; flex-direction:column; gap:12px; }
  .chapeu{ font-family:"League Spartan",sans-serif; text-transform:uppercase; letter-spacing:.2em;
    font-size:23px; font-weight:700; color:#8d84b3; }
  h1{ font-family:"League Spartan",sans-serif; font-weight:800; line-height:.92;
    letter-spacing:-.015em; color:#241f37; font-size:82px; }

  /* legenda: pílula preenchida com a própria cor da família, sem bolinha
     solta — a amostra de cor É o bloco que a aluna vai procurar na tabela */
  .legenda{ display:flex; flex-wrap:wrap; gap:9px; flex:none; }
  .lg{ font-family:"League Spartan",sans-serif; font-size:19px; font-weight:800;
    letter-spacing:.05em; padding:7px 15px; border-radius:4px; }
  .lg-aereos{ background:#ddd5ef; color:#3a2f5c; }
  .lg-danca{ background:#f7e2c2; color:#8a5410; }
  .lg-casinha{ background:#cfe9e7; color:#175f5d; }
  .lg-cond{ background:#e0e8c9; color:#4c5a18; }

  .rodape{ flex:none; text-align:center; font-size:22px; font-weight:700; color:#8d84b3; }

  /* ---------- a tabela ---------- */
  .tabela{ border:3px solid #443a66; display:flex; flex-direction:column;
    overflow:hidden; background:#fff; flex:1; min-height:0; }
  .tabela > div{ min-width:0; }

  /* cabeçalho: barra ameixa sólida, é a âncora da leitura */
  .e1-cab, .e2-cab1, .e2-cab2, .e3-cab, .d-cab{
    display:grid; background:#443a66; flex:none; }
  .e1-cab span, .e2-cab1 span, .e3-cab span, .d-cab span{
    font-family:"League Spartan",sans-serif; font-size:24px; font-weight:700;
    text-transform:uppercase; letter-spacing:.05em; color:#fff; text-align:center;
    padding:13px 2px; }
  .c-hora, .c-sala{ font-size:17px !important; color:#b8aede !important; letter-spacing:.14em !important; }

  /* célula: o fio de 1px é o que transforma bloco solto em tabela */
  .cel{ border-right:1px solid #ded8ec; border-bottom:1px solid #ded8ec;
    display:flex; padding:0; min-width:0; }
  .cel.vaga{ background:#f7f5fa; }
  .aula{ flex:1; display:flex; flex-direction:column; align-items:center;
    justify-content:center; text-align:center; padding:8px 5px; gap:2px; min-width:0; }
  .aula{ overflow:hidden; }
  .aula b{ font-weight:800; line-height:1.08; overflow-wrap:break-word; }
  .aula i{ font-style:normal; font-weight:700; opacity:.66; line-height:1.1; }
  .f-aereos{ background:#ddd5ef; color:#3a2f5c; }
  .f-danca{ background:#f7e2c2; color:#8a5410; }
  .f-casinha{ background:#cfe9e7; color:#175f5d; }
  .f-cond{ background:#e0e8c9; color:#4c5a18; }

  /* coluna de hora: fundo próprio e régua grossa à direita */
  .e1-hora, .e2-hora, .e3-hora, .d-hora{
    font-family:"League Spartan",sans-serif; font-weight:800; color:#241f37;
    background:#efecf6; display:flex; align-items:center; justify-content:center;
    font-variant-numeric:tabular-nums; border-right:3px solid #443a66; }

  /* ================= E1 ================= */
  .e1-cab{ grid-template-columns:78px 104px repeat(6,1fr); }
  .e1-corpo{ flex:1; min-height:0; display:flex; flex-direction:column; }
  /* a régua grossa entre horários é o que dá o "cada hora é uma linha" */
  .e1-grupo{ display:grid; grid-template-columns:78px 1fr; border-bottom:3px solid #443a66; }
  .e1-grupo:last-child{ border-bottom:0; }
  .e1-hora{ font-size:26px; }
  .e1-faixas{ display:flex; flex-direction:column; min-width:0; }
  .e1-faixa{ flex:1; display:grid; grid-template-columns:104px repeat(6,1fr); min-width:0; }
  .e1-faixa:last-child .cel{ border-bottom:0; }
  .e1-faixa .cel:last-child{ border-right:0; }
  .e1-rot{ font-family:"League Spartan",sans-serif; font-size:18px; font-weight:800;
    text-transform:uppercase; letter-spacing:.08em; display:flex; align-items:center;
    justify-content:center; border-right:1px solid #ded8ec; border-bottom:1px solid #ded8ec; }
  .e1-faixa:last-child .e1-rot{ border-bottom:0; }
  .r-1{ background:#443a66; color:#fff; }
  .r-2{ background:#fff; color:#443a66; box-shadow:inset 0 0 0 3px #443a66; }
  .e1 .aula b{ font-size:19px; }
  .e1 .aula i{ font-size:15px; }

  /* ================= E2 ================= */
  .e2-cab1, .e2-cab2, .e2-lin{ grid-template-columns:78px repeat(12,1fr); }
  .e2-cab1{ display:grid; }
  .e2-cab1 span:not(.c-hora){ grid-column:span 2; border-right:3px solid #fbfaf8; }
  .e2-cab1 span:last-child{ border-right:0; }
  .e2-cab2{ display:grid; background:#5a4e82; }
  .e2-cab2 span{ font-family:"League Spartan",sans-serif; font-size:15px; font-weight:800;
    text-transform:uppercase; letter-spacing:.06em; color:#e2dcf3; text-align:center; padding:7px 1px; }
  .e2-cab2 .s2{ background:#4b4070; border-right:3px solid #fbfaf8; }
  .e2-cab2 span:last-child{ border-right:0; }
  .e2-corpo{ flex:1; min-height:0; display:flex; flex-direction:column; }
  .e2-lin{ display:grid; flex:1; }
  .e2-hora{ font-size:23px; border-bottom:1px solid #ded8ec; }
  .e2-corpo .e2-lin:last-child .cel{ border-bottom:0; }
  /* faixa tonal contínua na Sala 2 + divisória grossa fechando cada dia */
  .e2 .cel.col2.vaga{ background:#eeeaf6; }
  .e2 .cel.fimdia{ border-right:3px solid #443a66; }
  .e2-lin .cel:last-child{ border-right:0; }
  .e2 .aula{ padding:6px 3px; }
  .e2 .aula b{ font-size:15px; overflow-wrap:anywhere; hyphens:none; }
  .e2 .aula i{ font-size:12px; }

  /* ================= E3 ================= */
  .e3{ }
  .e3 .miolo{ gap:16px; }
  .e3-tab{ display:flex; flex-direction:column; min-height:0; }
  .e3-titulo{ font-family:"League Spartan",sans-serif; font-size:28px; font-weight:800;
    text-transform:uppercase; letter-spacing:.16em; padding:12px 18px; flex:none;
    display:flex; align-items:baseline; justify-content:space-between; }
  .e3-titulo em{ font-style:normal; font-size:17px; font-weight:700; letter-spacing:.06em; opacity:.75; }
  .t-1{ background:#443a66; color:#fff; }
  .t-2{ background:#efecf6; color:#443a66; border-bottom:3px solid #443a66; }
  .e3-grade{ flex:1; min-height:0; display:flex; flex-direction:column; }
  .e3-cab, .e3-lin{ grid-template-columns:78px repeat(6,1fr); }
  .e3-cab span{ padding:10px 2px; font-size:21px; }
  .e3-corpo{ flex:1; min-height:0; display:flex; flex-direction:column; }
  .e3-lin{ display:grid; flex:1; }
  .e3-hora{ font-size:24px; border-bottom:1px solid #ded8ec; }
  .e3-corpo .e3-lin:last-child .cel, .e3-corpo .e3-lin:last-child .e3-hora{ border-bottom:0; }
  .e3-lin .cel:last-child{ border-right:0; }
  .e3 .aula b{ font-size:20px; }
  .e3 .aula i{ font-size:16px; }

  /* ================= diária ================= */
  .dia h1{ font-size:104px; }
  .d-tab{ flex:1; min-height:0; display:flex; flex-direction:column; }
  .d-cab{ grid-template-columns:150px 168px 1fr; }
  .d-cab span{ text-align:left; padding-left:20px; }
  .d-corpo{ flex:1; min-height:0; display:flex; flex-direction:column; }
  .d-lin{ display:grid; grid-template-columns:150px 1fr; border-bottom:3px solid #443a66; }
  .d-lin:last-child{ border-bottom:0; }
  .d-hora{ font-size:38px; border-right:3px solid #443a66; }
  .d-itens{ display:flex; flex-direction:column; min-width:0; }
  .d-item{ flex:1; display:grid; grid-template-columns:168px 1fr;
    border-bottom:1px solid #ded8ec; min-width:0; }
  .d-item:last-child{ border-bottom:0; }
  .d-sala{ font-family:"League Spartan",sans-serif; font-size:21px; font-weight:800;
    text-transform:uppercase; letter-spacing:.1em; display:flex; align-items:center;
    padding-left:20px; border-right:1px solid #ded8ec; }
  .ds-1{ background:#443a66; color:#fff; }
  .ds-2{ background:#fbfaf8; color:#443a66; box-shadow:inset 4px 0 0 #443a66, inset -4px 0 0 #443a66; }
  .d-aula{ display:flex; flex-direction:column; justify-content:center; gap:3px;
    padding:12px 22px; min-width:0; }
  .d-aula b{ font-size:34px; font-weight:800; line-height:1.06; }
  .d-aula i{ font-style:normal; font-size:23px; font-weight:700; opacity:.66; }
`

// ---------------------------------------------------------------- montagem
// A ordem das pranchas é o contrato com o exportador: as 8 primeiras são o
// conjunto publicável (E1), as 4 seguintes são o comparativo das outras duas
// estruturas. Cada bloco vira um PDF próprio — não se mistura material que
// vai para o story com material que serve só para a equipe decidir.
const PUBLICAVEL = [
  ...BLOCOS.map(b => pranchaSemana('e1', b)),
  ...DIAS.map(d => pranchaDia('e1', d)),
]
const COMPARATIVO = ['e2', 'e3'].flatMap(est => BLOCOS.map(b => pranchaSemana(est, b)))

const pranchas = [...PUBLICAVEL, ...COMPARATIVO]

writeFileSync(DEST, `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Grade estruturada — pranchas 1080x1920</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@600;700;800&family=Nunito:wght@400;600;700;800&display=swap">
<style>${CSS}</style>
</head>
<body>
${pranchas.join('\n')}
</body>
</html>
`, 'utf8')

console.log(`grade-estruturada.src.html — ${pranchas.length} pranchas (${PUBLICAVEL.length} publicáveis + ${COMPARATIVO.length} de comparação)`)
for (const b of BLOCOS) {
  const hs = horasComAula(b.horas)
  const duplos = hs.filter(h => salaUsada([h], 1) && salaUsada([h], 2)).length
  console.log(`  ${b.titulo.padEnd(14)} ${String(hs.length).padStart(2)} horários · ${duplos} com as duas salas`)
}
