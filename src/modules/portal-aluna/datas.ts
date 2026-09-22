/**
 * Datas do Portal do Aluno — sempre no fuso de quem está olhando.
 *
 * A versão anterior usava `new Date().toISOString().slice(0, 10)` para
 * saber "hoje". Isso é a data em UTC: às 21h de São Paulo já é amanhã, e a
 * "próxima aula" pulava a aula das 21h30 do próprio dia. Tudo aqui trabalha
 * com a data LOCAL em ISO (AAAA-MM-DD), que é o formato do banco.
 */

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const
const DIAS_LONGOS = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
] as const
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const

/** Plural de dias da semana, para turma fixa: "Segundas-feiras". */
const DIAS_PLURAL = [
  'Domingos', 'Segundas-feiras', 'Terças-feiras', 'Quartas-feiras', 'Quintas-feiras', 'Sextas-feiras', 'Sábados',
] as const

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function hojeIso(): string {
  return isoLocal(new Date())
}

/** Meio-dia local: somar dias nunca cai na virada de horário de verão. */
export function paraData(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d, 12)
}

export function somarDias(iso: string, dias: number): string {
  const d = paraData(iso)
  d.setDate(d.getDate() + dias)
  return isoLocal(d)
}

export function diaDaSemana(iso: string): number {
  return paraData(iso).getDay()
}

/** Diferença em dias corridos (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((paraData(b).getTime() - paraData(a).getTime()) / 86_400_000)
}

/** Segunda-feira da semana da data (a grade do estúdio começa na segunda). */
export function inicioDaSemana(iso: string): string {
  const dow = diaDaSemana(iso)
  return somarDias(iso, dow === 0 ? -6 : 1 - dow)
}

/** "16/10" */
export function fmtDiaMes(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** "16/10/2026" */
export function fmtDataCompleta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function nomeDiaCurto(iso: string): string {
  return DIAS_CURTOS[diaDaSemana(iso)]
}

export function nomeDiaPlural(dow: number): string {
  return DIAS_PLURAL[dow]
}

export function nomeDiaLongo(dow: number): string {
  return DIAS_LONGOS[dow]
}

/**
 * Rótulo relativo de um dia: "Hoje", "Amanhã", "qua, 24/09".
 * É a forma como o aluno pensa na agenda — ninguém procura "24/09".
 */
export function rotuloDia(iso: string, hoje = hojeIso()): string {
  const diff = diasEntre(hoje, iso)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return `${nomeDiaCurto(iso)}, ${fmtDiaMes(iso)}`
}

/** "Segunda-feira, 21 de setembro" — cabeçalho do Início. */
export function dataPorExtenso(iso: string): string {
  const d = paraData(iso)
  const texto = `${DIAS_LONGOS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** "19:00:00" → "19:00" */
export function fmtHora(horario: string | null | undefined): string {
  return (horario ?? '').slice(0, 5)
}

/** "19:00:00" → "19h" / "19:30:00" → "19h30" */
export function fmtHoraCurta(horario: string | null | undefined): string {
  if (!horario) return ''
  const [h, m] = horario.split(':')
  return m === '00' ? `${h}h` : `${h}h${m}`
}

/** "21/09/2026 às 19:40" a partir de um timestamptz. */
export function fmtDataHora(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A aula (data + horário local) já começou? */
export function jaComecou(data: string, horario: string | null | undefined, agora = new Date()): boolean {
  if (!horario) return data < isoLocal(agora)
  const [h, m] = horario.split(':').map(Number)
  const inicio = paraData(data)
  inicio.setHours(h, m, 0, 0)
  return agora >= inicio
}

/** Limite para cancelar com devolução de crédito (N horas antes do início). */
export function limiteCancelamento(data: string, horario: string, horas: number): Date {
  const [h, m] = horario.split(':').map(Number)
  const d = paraData(data)
  d.setHours(h, m, 0, 0)
  d.setHours(d.getHours() - horas)
  return d
}
