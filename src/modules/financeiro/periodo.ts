/**
 * Período de análise do Financeiro: um intervalo INCLUSIVO de meses no
 * formato 'YYYY-MM'. Mês único = inicio === fim. Toda a página passou a
 * raciocinar por período em vez de um mês só, para permitir visão
 * trimestral / semestral / anual e faixas personalizadas.
 *
 * Comparação de 'YYYY-MM' pode ser feita como string (largura fixa,
 * lexicográfico == cronológico).
 */
export type Periodo = { inicio: string; fim: string }

export function mesAtual(): string {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`
}

/** Desloca um 'YYYY-MM' por N meses (N pode ser negativo). */
export function deslocarMes(ym: string, delta: number): string {
  const [ano, mes] = ym.split('-').map(Number)
  const d = new Date(ano, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function periodoMes(ym: string): Periodo {
  return { inicio: ym, fim: ym }
}

/** Últimos N meses terminando no mês atual (inclusive). */
export function ultimosMeses(n: number): Periodo {
  const fim = mesAtual()
  return { inicio: deslocarMes(fim, -(n - 1)), fim }
}

/** Ano-calendário corrente (Jan–Dez) — casa com o regime de caixa do MEI. */
export function anoCorrente(): Periodo {
  const ano = new Date().getFullYear()
  return { inicio: `${ano}-01`, fim: `${ano}-12` }
}

export function ehMesUnico(p: Periodo): boolean {
  return p.inicio === p.fim
}

export function mesmoPeriodo(a: Periodo, b: Periodo): boolean {
  return a.inicio === b.inicio && a.fim === b.fim
}

/** Quantidade de meses no período (inclusivo, mínimo 1). */
export function qtdMeses(p: Periodo): number {
  const [ai, mi] = p.inicio.split('-').map(Number)
  const [af, mf] = p.fim.split('-').map(Number)
  return Math.max(1, (af - ai) * 12 + (mf - mi) + 1)
}

/** true se o ano-mês está dentro do período (inclusive). */
export function contemMes(p: Periodo, ym: string): boolean {
  return ym >= p.inicio && ym <= p.fim
}

/** Primeiro e último dia (ISO) do período — para filtrar por data_caixa. */
export function limitesDoPeriodo(p: Periodo): { inicio: string; fim: string } {
  const [af, mf] = p.fim.split('-').map(Number)
  const ultimoDia = new Date(af, mf, 0).getDate()
  return {
    inicio: `${p.inicio}-01`,
    fim: `${p.fim}-${String(ultimoDia).padStart(2, '0')}`,
  }
}

const MESES_CURTO = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

function rotuloMes(ym: string): string {
  const [ano, mes] = ym.split('-').map(Number)
  return `${MESES_CURTO[mes - 1]}/${String(ano).slice(2)}`
}

/** Rótulo curto e humano do período (ex.: "jul/26" ou "fev/26 – jul/26"). */
export function rotuloPeriodo(p: Periodo): string {
  return ehMesUnico(p) ? rotuloMes(p.inicio) : `${rotuloMes(p.inicio)} – ${rotuloMes(p.fim)}`
}
