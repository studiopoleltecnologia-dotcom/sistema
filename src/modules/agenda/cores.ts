/**
 * Cores suaves para os cartões da grade — uma por modalidade, estáveis
 * (mesma modalidade = mesma cor sempre). Tons pastel para diferenciar sem
 * poluir (CLAUDE.md §4: poucas cores, muito espaço em branco).
 */
export type CorCartao = { bg: string; borda: string; texto: string }

/**
 * Cor por CATEGORIA — o código de cor da grade impressa que o estúdio
 * publica (Pole · Dança · Projeto Casinha · Condicionamento).
 *
 * As cores não moram aqui: moram em `categorias_modalidade` no banco,
 * porque a equipe precisa criar categoria e trocar cor sem deploy. Esta
 * função só traduz a linha do banco para o formato do cartão.
 *
 * A borda é derivada (não cadastrada) de propósito: na grade impressa o
 * cartão não tem contorno, e inventar uma quarta cor por categoria daria
 * à equipe um campo a mais para errar. Escurecer o próprio fundo em
 * direção ao acento mantém a família e nunca destoa.
 */
export type CorCategoria = {
  nome: string
  cor: string
  cor_fundo: string
  cor_texto: string
}

export function corDaCategoria(cat: CorCategoria | null | undefined): CorCartao {
  if (!cat) return SEM_CATEGORIA
  return {
    bg: cat.cor_fundo,
    borda: `color-mix(in srgb, ${cat.cor} 22%, ${cat.cor_fundo})`,
    texto: cat.cor_texto,
  }
}

/**
 * Modalidade ainda sem categoria (Defesa Pessoal, Muay Thai, o que a
 * equipe cadastrar amanhã). Cinza neutro, nunca uma das quatro cores:
 * herdar a cor de outra categoria seria mentir sobre o agrupamento.
 */
export const SEM_CATEGORIA: CorCartao = {
  bg: '#f7f7f8',
  borda: '#e2e2e6',
  texto: '#71717a',
}

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

/**
 * Escala de OCUPAÇÃO — uma escala sequencial só, no lugar dos 8 pastéis
 * sorteados por modalidade. É o que permite bater o olho e achar a aula
 * vazia sem decorar legenda.
 *
 * **Sem vermelho, de propósito.** A grade mostra as reservas reais da semana
 * exibida, então toda semana futura começa vazia. Se vazio fosse vermelho, a
 * tela viveria em alarme e o alarme deixaria de significar algo — vazio é
 * cinza ("ninguém ainda"), estado neutro e não um erro.
 */
export type FaixaOcupacao = {
  chave: 'vazia' | 'comecando' | 'saudavel' | 'cheia'
  label: string
  cor: CorCartao
  /** Cor da barrinha de preenchimento — reforça sem depender de cor. */
  barra: string
}

const OCUPACAO: Record<FaixaOcupacao['chave'], FaixaOcupacao> = {
  vazia: {
    chave: 'vazia',
    label: 'Sem reservas',
    cor: { bg: '#f7f7f8', borda: '#e2e2e6', texto: '#71717a' },
    barra: '#c4c4cc',
  },
  comecando: {
    chave: 'comecando',
    label: 'Começando a encher',
    cor: { bg: '#fcf1e6', borda: '#f8e1c7', texto: '#9c5a18' },
    barra: '#db8735',
  },
  saudavel: {
    chave: 'saudavel',
    label: 'Saudável',
    cor: { bg: '#eaf9f8', borda: '#d1f0ee', texto: '#1f726f' },
    barra: '#2fa9a6',
  },
  cheia: {
    chave: 'cheia',
    label: 'Cheia',
    cor: { bg: '#f6f5fa', borda: '#d3cfe6', texto: '#443a66' },
    barra: '#6b6193',
  },
}

export const FAIXAS_OCUPACAO = Object.values(OCUPACAO)

export function faixaOcupacao(reservas: number, capacidade: number): FaixaOcupacao {
  if (reservas <= 0) return OCUPACAO.vazia
  const pct = capacidade > 0 ? (reservas / capacidade) * 100 : 0
  if (pct >= 85) return OCUPACAO.cheia
  if (pct >= 50) return OCUPACAO.saudavel
  return OCUPACAO.comecando
}
