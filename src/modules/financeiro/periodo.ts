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

/**
 * Esta conta a receber / a pagar pertence ao recorte escolhido?
 *
 * Vale para o que ainda não aconteceu — entrada prevista, conta a pagar
 * —, onde a data que importa é o VENCIMENTO, não a de caixa (que não
 * existe ainda).
 *
 * Duas partes, e a segunda é a que não é óbvia:
 *
 *  1. vence dentro do período → é do período;
 *  2. já venceu E o período inclui hoje → também aparece. Esconder uma
 *     conta atrasada de quem está olhando o mês corrente é o oposto do
 *     que estas telas servem para fazer.
 *
 * O efeito do (2) ser condicionado a "o período inclui hoje": olhar
 * dezembro NÃO arrasta o que ficou em aberto em novembro. Antes, a
 * tela de Entradas trazia toda prevista sem recorte de data nenhum, e
 * a mensalidade não recebida de novembro continuava no meio de
 * dezembro — somando no "a receber" do mês errado.
 *
 * Sem vencimento (prevista sem data prevista nem data de caixa), a
 * linha pertence ao "agora": aparece quando o período inclui hoje, e
 * não polui mês futuro.
 */
export function venceNoRecorte(p: Periodo, venc: string | null, hoje: string): boolean {
  const incluiHoje = contemMes(p, hoje.slice(0, 7))
  if (venc == null) return incluiHoje
  return contemMes(p, venc.slice(0, 7)) || (incluiHoje && venc < hoje)
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

const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/**
 * 'YYYY-MM' por extenso ("dezembro de 2026"). Para frase corrida — numa
 * confirmação, "sai de dez/26" se lê como código; "sai de dezembro de
 * 2026" se lê como aviso.
 */
export function mesPorExtenso(ym: string): string {
  const [ano, mes] = ym.split('-').map(Number)
  return `${MESES_EXTENSO[mes - 1]} de ${ano}`
}

/** Rótulo curto e humano do período (ex.: "jul/26" ou "fev/26 – jul/26"). */
export function rotuloPeriodo(p: Periodo): string {
  return ehMesUnico(p) ? rotuloMes(p.inicio) : `${rotuloMes(p.inicio)} – ${rotuloMes(p.fim)}`
}
