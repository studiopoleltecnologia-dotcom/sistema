// A grade de horários, num lugar só.
// Fonte: aba GRADE INTER da planilha "NOVA GRADE DE HORÁRIOS RASCUNHO".
//
// Todos os geradores de arte importam daqui. Mudou horário, muda neste arquivo
// e todas as pranchas reexportam juntas — não existe peça ficando para trás.

export const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
export const DIA_LONGO = {
  SEG: 'SEGUNDA', TER: 'TERÇA', QUA: 'QUARTA',
  QUI: 'QUINTA', SEX: 'SEXTA', 'SÁB': 'SÁBADO',
}

// Nome das salas: ainda não batizadas. Trocar aqui quando forem.
export const SALAS = { 1: 'Sala 1', 2: 'Sala 2' }

// aula = [modalidade, professora, sala]. Professora vazia sai como "a definir",
// que é o estado real de duas aulas na planilha — esconder viraria erro na arte.
export const GRADE = {
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

export const HORAS = Object.keys(GRADE)

// Duas artes, não três: a manhã e a tarde juntas ainda cabem numa tela com
// linha de horário respirando, e a noite sozinha é a metade mais cheia.
export const BLOCOS = [
  { id: 'manha-tarde', titulo: 'MANHÃ & TARDE',
    horas: ['8h', '9h', '10h', '11h', '12h', '13h', '13h40', '15h45', '16h', '17h'] },
  { id: 'noite', titulo: 'NOITE',
    horas: ['18h', '18h30', '19h', '19h30', '20h', '20h30'] },
]

// Famílias da legenda da própria planilha. "Defesa Pessoal Feminina" não tem
// família definida lá — entra em Condicionamento até a equipe decidir.
export const FAMILIAS = [
  ['aereos', 'Aéreos'],
  ['danca', 'Dança'],
  ['casinha', 'Projeto Casinha'],
  ['cond', 'Condicionamento'],
]

export const familia = m =>
  /^(Pole|Bases de)/i.test(m) ? 'aereos'
  : /(Jazz Juvenil|Ballet)/i.test(m) ? 'casinha'
  : /(Calistenia|Flexibilidade|Yoga|Defesa Pessoal)/i.test(m) ? 'cond'
  : 'danca'

export const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const prof = p => (p && p.trim() ? esc(p) : 'a definir')

export const aulasDe = (hora, dia, sala) =>
  (GRADE[hora]?.[dia] || []).filter(a => a[2] === sala)

export const salaUsada = (horas, sala, dias = DIAS) =>
  horas.some(h => dias.some(d => aulasDe(h, d, sala).length))

export const horasComAula = (horas, dias = DIAS) =>
  horas.filter(h => dias.some(d => (GRADE[h]?.[d] || []).length))

export const familiasEm = (horas, dias = DIAS) => {
  const s = new Set()
  for (const h of horas) for (const d of dias)
    for (const a of (GRADE[h]?.[d] || [])) s.add(familia(a[0]))
  return s
}
