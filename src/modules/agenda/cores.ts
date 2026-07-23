/**
 * Cores suaves para os cartões da grade — uma por modalidade, estáveis
 * (mesma modalidade = mesma cor sempre). Tons pastel para diferenciar sem
 * poluir (CLAUDE.md §4: poucas cores, muito espaço em branco).
 */
export type CorCartao = { bg: string; borda: string; texto: string }

const PALETA: CorCartao[] = [
  { bg: '#f5f3ff', borda: '#ddd6fe', texto: '#5b21b6' }, // violeta (marca)
  { bg: '#fdf2f8', borda: '#fbcfe8', texto: '#9d174d' }, // rosa
  { bg: '#ecfeff', borda: '#a5f3fc', texto: '#155e75' }, // ciano
  { bg: '#f0fdf4', borda: '#bbf7d0', texto: '#166534' }, // verde
  { bg: '#fff7ed', borda: '#fed7aa', texto: '#9a3412' }, // laranja
  { bg: '#eff6ff', borda: '#bfdbfe', texto: '#1e40af' }, // azul
  { bg: '#fefce8', borda: '#fde68a', texto: '#854d0e' }, // amarelo
  { bg: '#fef2f2', borda: '#fecaca', texto: '#991b1b' }, // vermelho
]

export function corModalidade(nome: string): CorCartao {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return PALETA[h % PALETA.length]
}
