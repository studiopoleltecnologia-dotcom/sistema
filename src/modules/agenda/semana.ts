/**
 * Datas da grade. Tudo em ISO `YYYY-MM-DD` e construído com `Date` local
 * (nunca `toISOString()` sobre data local, que joga para UTC e no Brasil
 * volta um dia).
 */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const hojeISO = () => iso(new Date())

function deISO(s: string) {
  const [a, m, d] = s.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function somarDias(dataISO: string, dias: number) {
  const d = deISO(dataISO)
  d.setDate(d.getDate() + dias)
  return iso(d)
}

/**
 * Domingo da semana que contém `dataISO`.
 *
 * A grade começa no **domingo** (decisão de 06/09/2026; antes era segunda).
 * Mudar aqui basta: `diasDaSemana`, `semanasDoMes` e `rotuloSemana` derivam
 * desta função, e ela não é usada fora do módulo Agenda — Análises e portais
 * não têm noção própria de início de semana que pudesse divergir.
 *
 * Quem consome isto também define a janela consultada em `fn_ocupacao_turma`,
 * então a ocupação exibida acompanha a semana nova sozinha.
 */
export function inicioSemana(dataISO: string) {
  const d = deISO(dataISO)
  d.setDate(d.getDate() - d.getDay()) // getDay(): 0 = domingo
  return iso(d)
}

/** Os 7 dias da semana de `dataISO`, de domingo a sábado. */
export function diasDaSemana(dataISO: string): string[] {
  const ini = inicioSemana(dataISO)
  return Array.from({ length: 7 }, (_, i) => somarDias(ini, i))
}

export function inicioMes(dataISO: string) {
  return `${dataISO.slice(0, 7)}-01`
}

export function fimMesExclusivo(dataISO: string) {
  const d = deISO(inicioMes(dataISO))
  d.setMonth(d.getMonth() + 1)
  return iso(d)
}

/** Grade do mês: semanas completas (domingo a sábado) cobrindo o mês inteiro. */
export function semanasDoMes(dataISO: string): string[][] {
  const primeiro = inicioSemana(inicioMes(dataISO))
  const fim = fimMesExclusivo(dataISO)
  const semanas: string[][] = []
  let cursor = primeiro
  while (cursor < fim) {
    semanas.push(diasDaSemana(cursor))
    cursor = somarDias(cursor, 7)
  }
  return semanas
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function rotuloMes(dataISO: string) {
  const [ano, mes] = dataISO.slice(0, 7).split('-').map(Number)
  return `${MESES[mes - 1]} ${ano}`
}

/** "16 – 22 de agosto" ou "30 de junho – 6 de julho" quando vira o mês. */
export function rotuloSemana(dataISO: string) {
  const dias = diasDaSemana(dataISO)
  const ini = deISO(dias[0])
  const fim = deISO(dias[6])
  const mesmoMes = ini.getMonth() === fim.getMonth()
  return mesmoMes
    ? `${ini.getDate()} – ${fim.getDate()} de ${MESES[ini.getMonth()]}`
    : `${ini.getDate()} de ${MESES[ini.getMonth()]} – ${fim.getDate()} de ${MESES[fim.getMonth()]}`
}

export const diaDoMes = (dataISO: string) => Number(dataISO.slice(8, 10))
export const dowDe = (dataISO: string) => deISO(dataISO).getDay()
