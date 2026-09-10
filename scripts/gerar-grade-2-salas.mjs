// Gera docs/marketing/grade-2-salas.src.html — 12 pranchas de 1080x1920 com a
// grade real da aba GRADE INTER (planilha "NOVA GRADE DE HORÁRIOS RASCUNHO").
//
//   6 pranchas  opção A  — um dia por tela, Sala 1 e Sala 2 lado a lado
//   3 pranchas  opção M1 — semana por período, nome da sala no vão da esquerda
//   3 pranchas  opção M2 — semana por período, etiqueta do nome sobre o trilho
//
// Uso: node scripts/gerar-grade-2-salas.mjs && node scripts/exportar-grade-2-salas.mjs
//
// A grade mora aqui, num lugar só: as três peças leem a mesma tabela. Mudou
// horário, muda aqui e reexporta as 12 — não existe versão que fica para trás.
import { writeFileSync, readFileSync } from 'node:fs'

// O logo entra embutido em base64 — a prancha vira um arquivo só, sem link quebrado
// quando o HTML sair da pasta.
const LOGO = 'data:image/png;base64,' + readFileSync(
  'C:/Users/carol/Documents/STUDIO POLE L/Claude/docs/marketing/canva/logo-mandala-512.png'
).toString('base64')

const DEST = 'C:/Users/carol/Documents/STUDIO POLE L/Claude/docs/marketing/grade-2-salas.src.html'

// ---------------------------------------------------------------- dados
// Nome das salas: ainda não batizadas. Trocar as duas strings abaixo é a única
// coisa necessária se virarem "Mandala"/"Ateliê" — o layout já comporta.
const SALAS = { 1: 'Sala 1', 2: 'Sala 2' }

const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const DIA_LONGO = { SEG: 'SEGUNDA', TER: 'TERÇA', QUA: 'QUARTA', QUI: 'QUINTA', SEX: 'SEXTA', 'SÁB': 'SÁBADO' }

// aula = [modalidade, professora, sala]. Professora vazia sai como "a definir",
// que é o estado real de duas aulas na planilha — esconder viraria erro na arte.
const GRADE = {
  '8h':    { SEG: [['Pole 1', 'Nathalia', 1]], 'SÁB': [['Pole 1', 'Nathalia', 1]] },
  '9h':    { SEG: [['Calistenia', 'Nathalia', 1]], QUA: [['Calistenia', 'Nathalia', 1]],
             QUI: [['Pole 1', 'Sara', 1]], 'SÁB': [['Calistenia', 'Nathalia', 1]] },
  '10h':   { QUA: [['Pole 1', 'Nathalia', 1]], QUI: [['Pole Coreográfico', 'Sara', 1]],
             'SÁB': [['Pole Coreográfico', 'Juliana', 1], ['Flexibilidade', 'Nathalia', 2]] },
  '11h':   { SEG: [['Pole Mix', 'May', 1]], QUI: [['Pole Power', 'Sara', 1]],
             SEX: [['Pole Coreográfico', 'Paola', 1]],
             'SÁB': [['Pole 1', 'Juliana', 1], ['Defesa Pessoal Feminina', 'Jullia e Manu', 2]] },
  '12h':   { SEG: [['Pole Silk', 'May', 1]], SEX: [['Pole 1', 'Paola', 1]] },
  '13h':   { SEX: [['Bases de Inversão', 'Paola', 1]] },
  '13h40': { TER: [['Jazz Juvenil', 'Tatiane', 1]], QUI: [['Jazz Juvenil', 'Tatiane', 1]] },
  '15h45': { TER: [['Ballet Baby', 'Márcia', 1]], QUI: [['Ballet Baby', 'Márcia', 1]] },
  '16h':   { QUA: [['Pole 1', 'Paola', 1]], SEX: [['Pole Mix', 'May', 1]] },
  '17h':   { QUA: [['Pole Coreográfico', 'Paola', 1]], QUI: [['Jazz Adulto', 'Tatiane', 2]],
             SEX: [['Pole Silk', 'May', 1]] },
  '18h':   { SEG: [['Bases de Inversão', 'Paola', 1]], TER: [['Pole 1 e 2', 'Victoria', 1]],
             QUA: [['Bases de Inversão', '', 1], ['Flexibilidade', 'Victoria', 2]],
             SEX: [['Bases de salto', 'Victoria', 1]] },
  '18h30': { QUI: [['Dança do Ventre', 'Bruna', 2]] },
  '19h':   { SEG: [['Pole Spin 1', 'Juliana', 1], ['Stiletto', 'Paola', 2]],
             TER: [['Pole 1', 'Victoria', 1]],
             QUA: [['Pole On Heels', 'Victoria', 1], ['Floorwork', '', 2]],
             SEX: [['Pole 1', 'Victoria', 1]] },
  '19h30': { QUI: [['Pole Coreográfico', 'Juliana', 1], ['Jazz Funk', 'Joanne', 2]] },
  '20h':   { SEG: [['Pole 1', 'Juliana', 1], ['Floorwork', 'Paola', 2]],
             TER: [['Pole Spin 1 e 2', 'Victoria', 1]],
             QUA: [['Pole 1', 'Victoria', 1], ['Yoga', 'Fabiana', 2]] },
  '20h30': { QUI: [['Pole 1', 'Juliana', 1]] },
}

const HORAS = Object.keys(GRADE)
const PERIODOS = [
  { id: 'manha', titulo: 'MANHÃ',  horas: ['8h', '9h', '10h', '11h', '12h'] },
  { id: 'tarde', titulo: 'TARDE',  horas: ['13h', '13h40', '15h45', '16h', '17h'] },
  { id: 'noite', titulo: 'NOITE',  horas: ['18h', '18h30', '19h', '19h30', '20h', '20h30'] },
]

// Famílias da legenda da própria planilha. "Defesa Pessoal Feminina" não tem
// família definida lá — entra em Condicionamento até a equipe decidir.
const FAMILIAS = [
  ['aereos', 'Aéreos'],
  ['danca', 'Dança'],
  ['casinha', 'Projeto Casinha'],
  ['cond', 'Condicionamento'],
]
const familia = m =>
  /^(Pole|Bases de)/i.test(m) ? 'aereos'
  : /(Jazz Juvenil|Ballet)/i.test(m) ? 'casinha'
  : /(Calistenia|Flexibilidade|Yoga|Defesa Pessoal)/i.test(m) ? 'cond'
  : 'danca'

// ---------------------------------------------------------------- helpers
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const prof = p => p && p.trim() ? esc(p) : 'a definir'
const aulasDe = (hora, dia, sala) => (GRADE[hora]?.[dia] || []).filter(a => a[2] === sala)
const salaUsada = (horas, sala, dias = DIAS) =>
  horas.some(h => dias.some(d => aulasDe(h, d, sala).length))

const chip = a => `<div class="chip fam-${familia(a[0])}"><b>${esc(a[0])}</b><i>${prof(a[1])}</i></div>`
const vazio = '<div class="vazio">—</div>'
const celula = (hora, dia, sala) => {
  const as = aulasDe(hora, dia, sala)
  return as.length ? as.map(chip).join('') : vazio
}

const marca = `
      <div class="marca">
        <span class="arroba">@studiopolel</span>
        <img class="mandala" src="${LOGO}" alt="">
      </div>`

const legenda = usadas => `
      <div class="legenda">
        ${FAMILIAS.filter(([k]) => !usadas || usadas.has(k))
          .map(([k, nome]) => `<span><i class="ponto p-${k}"></i>${nome}</span>`).join('\n        ')}
      </div>`

const familiasEm = (horas, dias = DIAS) => {
  const s = new Set()
  for (const h of horas) for (const d of dias) for (const a of (GRADE[h]?.[d] || [])) s.add(familia(a[0]))
  return s
}

// ---------------------------------------------------------------- opção A
// Um dia por tela. Sala 1 à esquerda, Sala 2 à direita — a posição é o que
// identifica a sala, não a cor (a cor já é da modalidade).
// Nos dias em que a Sala 2 não abre, a peça encolhe para uma faixa só: manter
// uma coluna inteira de "livre" gasta metade do card com não-informação.
function pranchaDia(dia) {
  const horas = HORAS.filter(h => (GRADE[h]?.[dia] || []).length)
  const temSala2 = salaUsada(horas, 2, [dia])
  const cols = temSala2 ? 2 : 1

  const linhas = horas.map(h => {
    const faixas = (temSala2 ? [1, 2] : [1]).map(s => {
      const as = aulasDe(h, dia, s)
      return as.length
        ? as.map(a => `<div class="vaga fam-${familia(a[0])}"><b>${esc(a[0])}</b><i>${prof(a[1])}</i></div>`).join('')
        : '<div class="vaga livre">livre</div>'
    }).join('\n            ')
    return `          <div class="linha">
            <div class="hora">${h}</div>
            ${faixas}
          </div>`
  }).join('\n')

  const cabecalho = temSala2
    ? `        <div class="faixas">
          <span></span><span>${SALAS[1]}</span><span>${SALAS[2]}</span>
        </div>`
    : `        <div class="faixas uma">
          <span></span><span>${SALAS[1]} · única sala aberta</span>
        </div>`

  return `
  <div class="prancha dia ${cols === 1 ? 'so-uma' : ''}" id="dia-${dia.toLowerCase().replace('á', 'a')}">
    <div class="fio"></div>
    <div class="miolo">
      ${marca}
      <div class="titulo-bloco">
        <div class="chapeu">Grade de horários</div>
        <h1>${DIA_LONGO[dia]}</h1>
      </div>
${cabecalho}
      <div class="linhas">
${linhas}
      </div>
      ${legenda(familiasEm(horas, [dia]))}
      <div class="rodape">Reserve pelo app · link na bio</div>
    </div>
  </div>`
}

// ---------------------------------------------------------------- M1 e M2
// Semana inteira, cortada por período. Cada horário abre um bloco e dentro dele
// cada sala tem seu trilho. M1 põe o nome da sala num vão à esquerda; M2 põe
// como etiqueta acima do trilho. O resto é idêntico.
function pranchaPeriodo(p, modo) {
  const horas = p.horas.filter(h => DIAS.some(d => (GRADE[h]?.[d] || []).length))

  const blocos = horas.map(h => {
    const trilhos = [1, 2].filter(s => salaUsada([h], s)).map(s => {
      const cels = DIAS.map(d => celula(h, d, s)).join('\n              ')
      if (modo === 'm1') {
        return `            <div class="trilho">
              <div class="rotulo"><span class="pt pt-${s}"></span>${SALAS[s]}</div>
              ${cels}
            </div>`
      }
      return `            <div class="trilho">
              <span class="etiqueta et-${s}">${SALAS[s]}</span>
              <div class="trilho-linha">
              ${cels}
              </div>
            </div>`
    }).join('\n')
    const nTrilhos = [1, 2].filter(s => salaUsada([h], s)).length
    return `        <div class="bloco" style="flex:${nTrilhos}">
          <div class="hora">${h}</div>
          <div class="trilhos">
${trilhos}
          </div>
        </div>`
  }).join('\n')

  return `
  <div class="prancha periodo ${modo}" id="${modo}-${p.id}">
    <div class="fio"></div>
    <div class="miolo">
      ${marca}
      <div class="titulo-bloco">
        <div class="chapeu">Grade de horários</div>
        <h1>${p.titulo}</h1>
      </div>
      <div class="dias">
        ${modo === 'm1' ? '<span></span><span></span>' : '<span></span>'}
        ${DIAS.map(d => `<span>${d}</span>`).join('')}
      </div>
      <div class="blocos">
${blocos}
      </div>
      ${legenda(familiasEm(horas))}
      <div class="rodape">Reserve pelo app · link na bio</div>
    </div>
  </div>`
}

// ---------------------------------------------------------------- CSS
// Tudo em px absoluto: a prancha é exportada 1:1 em 1080x1920, então não há
// container query nem viewport para acompanhar.
const CSS = `
  @page { size: 1080px 1920px; margin: 0; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ background:#e9e6ef; font-family:"Nunito","Segoe UI",system-ui,sans-serif;
    display:flex; flex-direction:column; align-items:center; gap:40px; padding:40px 0; }

  .prancha{
    width:1080px; height:1920px; background:#fbfaf8; color:#241f37;
    display:flex; flex-direction:column; overflow:hidden; position:relative;
    break-after:page;
  }
  .prancha:last-child{ break-after:auto; }
  .fio{ height:12px; flex:none; background:linear-gradient(90deg,#591a49,#443a66 55%,#db8735); }
  .miolo{ flex:1; min-height:0; padding:60px 58px 52px; display:flex; flex-direction:column; gap:26px; }

  .marca{ display:flex; align-items:center; justify-content:space-between; flex:none; }
  .arroba{ font-family:"League Spartan",sans-serif; text-transform:uppercase; letter-spacing:.3em;
    font-size:24px; font-weight:700; color:#8d84b3; }
  .mandala{ width:86px; height:86px; object-fit:contain; }

  .titulo-bloco{ flex:none; display:flex; flex-direction:column; gap:6px; }
  .chapeu{ font-family:"League Spartan",sans-serif; text-transform:uppercase; letter-spacing:.2em;
    font-size:24px; font-weight:700; color:#8d84b3; }
  h1{ font-family:"League Spartan",sans-serif; font-weight:800; line-height:.92;
    letter-spacing:-.015em; color:#241f37; }

  .legenda{ display:flex; flex-wrap:wrap; gap:12px 34px; flex:none; padding-top:4px; }
  .legenda span{ display:flex; align-items:center; gap:11px; font-size:22px; font-weight:700; color:#443a66; }
  .ponto{ width:19px; height:19px; border-radius:50%; }
  .p-aereos{ background:#443a66; } .p-danca{ background:#c07a24; }
  .p-casinha{ background:#2fa9a6; } .p-cond{ background:#7c8f2e; }
  .rodape{ flex:none; text-align:center; font-size:24px; font-weight:700; color:#8d84b3; }

  /* cor = família da modalidade. Nunca sala. */
  .fam-aereos{ background:#ece9f5; color:#443a66; }
  .fam-danca{ background:#faf1e2; color:#9c631c; }
  .fam-casinha{ background:#e4f4f3; color:#1f6f6d; }
  .fam-cond{ background:#eef1e0; color:#59691f; }

  /* ---------------- opção A: um dia por tela ---------------- */
  .dia h1{ font-size:118px; }
  .dia .faixas{ display:grid; grid-template-columns:98px 1fr 1fr; gap:17px; flex:none; }
  .dia .faixas.uma{ grid-template-columns:98px 1fr; }
  .dia .faixas span{ font-family:"League Spartan",sans-serif; font-size:27px; font-weight:700;
    text-transform:uppercase; letter-spacing:.14em; color:#443a66; text-align:center;
    padding:13px 0; border-bottom:5px solid #443a66; }
  .dia .faixas span:first-child{ border-bottom-color:transparent; }
  .dia .linhas{ flex:1; min-height:0; display:flex; flex-direction:column; gap:16px; justify-content:center; }
  .dia .linha{ flex:1 1 0; max-height:196px; display:grid; grid-template-columns:98px 1fr 1fr; gap:17px; }
  .dia.so-uma .linha{ grid-template-columns:98px 1fr; }
  .dia .hora{ font-family:"League Spartan",sans-serif; font-size:38px; font-weight:800; color:#241f37;
    display:flex; align-items:center; justify-content:flex-end; font-variant-numeric:tabular-nums; }
  .dia .vaga{ border-radius:22px; padding:14px 12px; display:flex; flex-direction:column;
    align-items:center; justify-content:center; text-align:center; gap:4px; min-width:0; }
  .dia .vaga b{ font-size:38px; font-weight:800; line-height:1.04; }
  .dia .vaga i{ font-style:normal; font-size:29px; font-weight:700; opacity:.66; }
  .dia .vaga.livre{ background:transparent; border:2px dashed #ddd7ea; color:#c9c3dc;
    font-size:26px; font-weight:700; }

  /* ---------------- M1 e M2: semana por período ---------------- */
  .periodo h1{ font-size:92px; }
  .periodo .dias{ display:grid; gap:10px; border-bottom:5px solid #241f37; padding-bottom:10px; flex:none; }
  .periodo .dias span{ font-family:"League Spartan",sans-serif; font-size:25px; font-weight:700;
    text-transform:uppercase; letter-spacing:.06em; text-align:center; color:#241f37; }
  .m1 .dias{ grid-template-columns:66px 122px repeat(6,1fr); }
  .m2 .dias{ grid-template-columns:78px repeat(6,1fr); }

  .periodo .blocos{ flex:1; min-height:0; display:flex; flex-direction:column; }
  .periodo .bloco{ flex:1; display:grid; gap:10px; border-bottom:1px solid #edeaf4; padding:7px 0; }
  .periodo .bloco:last-child{ border-bottom:0; }
  .m1 .bloco{ grid-template-columns:66px 1fr; }
  .m2 .bloco{ grid-template-columns:78px 1fr; }
  .periodo .bloco > .hora{ font-family:"League Spartan",sans-serif; font-size:27px; font-weight:800;
    color:#241f37; display:flex; align-items:center; font-variant-numeric:tabular-nums; }
  .periodo .trilhos{ display:flex; flex-direction:column; justify-content:center; }
  .m1 .trilhos{ gap:8px; }
  .m2 .trilhos{ gap:13px; }

  .m1 .trilho{ display:grid; grid-template-columns:122px repeat(6,1fr); gap:10px; align-items:stretch; }
  .m1 .rotulo{ font-family:"League Spartan",sans-serif; font-size:21px; font-weight:800;
    letter-spacing:.08em; text-transform:uppercase; color:#443a66; display:flex; align-items:center;
    justify-content:flex-end; gap:10px; padding-right:12px; border-right:1px solid #ded8ea;
    text-align:right; line-height:1.05; }
  .m1 .pt{ width:17px; height:17px; border-radius:50%; flex:none; }
  .m1 .pt-1{ background:#443a66; }
  .m1 .pt-2{ background:#fbfaf8; box-shadow:inset 0 0 0 4px #443a66; }

  .m2 .trilho{ display:flex; flex-direction:column; gap:6px; }
  .m2 .etiqueta{ align-self:flex-start; font-family:"League Spartan",sans-serif; font-size:20px;
    font-weight:800; text-transform:uppercase; letter-spacing:.13em; border-radius:999px; padding:5px 20px; }
  .m2 .et-1{ background:#443a66; color:#fff; }
  .m2 .et-2{ background:#fbfaf8; color:#443a66; box-shadow:inset 0 0 0 3px #443a66; }
  .m2 .trilho-linha{ display:grid; grid-template-columns:repeat(6,1fr); gap:10px; align-items:stretch; }

  .periodo .chip{ border-radius:14px; padding:10px 5px; text-align:center; display:flex;
    flex-direction:column; justify-content:center; gap:2px; min-width:0; }
  .periodo .chip b{ font-size:21px; font-weight:800; line-height:1.06; }
  .periodo .chip i{ font-style:normal; font-size:17px; font-weight:700; opacity:.66; }
  .periodo .vazio{ text-align:center; color:#dcd7e8; font-size:22px; align-self:center; }
`

// ---------------------------------------------------------------- montagem
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Grade 2 salas — pranchas 1080x1920</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@600;700;800&family=Nunito:wght@400;600;700;800&display=swap">
<style>${CSS}</style>
</head>
<body>
${DIAS.map(pranchaDia).join('\n')}
${PERIODOS.map(p => pranchaPeriodo(p, 'm1')).join('\n')}
${PERIODOS.map(p => pranchaPeriodo(p, 'm2')).join('\n')}
</body>
</html>
`

writeFileSync(DEST, html, 'utf8')

const nAulas = HORAS.reduce((t, h) => t + DIAS.reduce((s, d) => s + (GRADE[h]?.[d] || []).length, 0), 0)
const s1 = HORAS.reduce((t, h) => t + DIAS.reduce((s, d) => s + aulasDe(h, d, 1).length, 0), 0)
console.log(`grade-2-salas.src.html — 12 pranchas · ${nAulas} aulas (Sala 1: ${s1}, Sala 2: ${nAulas - s1})`)
for (const d of DIAS) {
  const h = HORAS.filter(x => (GRADE[x]?.[d] || []).length)
  console.log(`  ${d.padEnd(4)} ${String(h.length).padStart(2)} horários${salaUsada(h, 2, [d]) ? '' : '  · Sala 2 fechada → faixa única'}`)
}
