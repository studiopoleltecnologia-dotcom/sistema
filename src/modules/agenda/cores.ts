/**
 * Cor da grade de horários.
 *
 * ## Por que a grade vivia branca
 *
 * O modo de cor padrão é `categoria`, e a cor da categoria vem de
 * `categorias_modalidade` no banco. Só que hoje, em produção, **nenhuma
 * modalidade tem categoria**: das 17 turmas ativas, 3 apontam para uma
 * modalidade e essas 3 modalidades estão com `categoria_id` nulo. O
 * resultado é que 100% dos cartões caíam no cinza `#f7f7f8` — cinza sobre
 * o branco da grade sobre o `neutral-50` da página. Três quase-brancos
 * empilhados: não era falta de paleta, era a paleta dependendo de um dado
 * opcional que ninguém preencheu.
 *
 * A correção é estrutural, não cosmética: **o cartão nunca depende de um
 * dado opcional para ter cor**. `corDaTurma()` usa a categoria quando ela
 * existe (o código de cor oficial da grade impressa, editável pela equipe
 * sem deploy) e, quando não existe, deriva uma cor estável do nome da
 * modalidade dentro da MESMA paleta da marca. Categorizar deixa de ser o
 * que faz a tela funcionar e volta a ser o que faz a tela ficar correta.
 */
export type CorCartao = {
  /** Fundo levemente tonalizado do cartão. */
  bg: string
  /** Contorno do cartão — derivado, sempre da mesma família do fundo. */
  borda: string
  /** Tinta dos rótulos secundários dentro do cartão. */
  texto: string
  /** Cor cheia: barra lateral, bolinha da legenda, tag da categoria. */
  acento: string
}

export type CorCategoria = {
  nome: string
  cor: string
  cor_fundo: string
  cor_texto: string
}

/**
 * Paleta da grade — as 4 cores principais do Guia de Marca mais 2 da
 * paleta secundária, para caber mais modalidade sem repetir cedo demais.
 *
 * Deliberadamente **sem vermelho**: `danger` é erro no resto do app e uma
 * aula não é um erro. E deliberadamente ancorada no ameixa da marca, que
 * é a primeira posição e portanto a mais provável.
 */
const PALETA_MARCA: CorCartao[] = [
  { bg: '#f0eef7', borda: '#d8d2ea', texto: '#443a66', acento: '#6b6193' }, // ameixa (marca)
  { bg: '#fbf1e5', borda: '#f0dcc2', texto: '#8f5416', acento: '#db8735' }, // ocre terracota
  { bg: '#e6f6f5', borda: '#c4e8e6', texto: '#1c6a67', acento: '#2fa9a6' }, // turquesa
  { bg: '#f0f3e3', borda: '#dde4c2', texto: '#55602a', acento: '#7d8d30' }, // verde-oliva
  { bg: '#eaf0f6', borda: '#cbdae8', texto: '#234863', acento: '#3d6488' }, // azul-marinho
  { bg: '#f7edf4', borda: '#e8d3e2', texto: '#591a49', acento: '#8a4a76' }, // magenta profundo
]

/**
 * Traduz a linha do banco para o formato do cartão.
 *
 * A borda continua derivada (não cadastrada): na grade impressa o cartão
 * não tem contorno, e pedir uma quarta cor por categoria seria mais um
 * campo para a equipe errar. Escurecer o fundo em direção ao acento
 * mantém a família e nunca destoa.
 */
export function corDaCategoria(cat: CorCategoria | null | undefined): CorCartao {
  if (!cat) return SEM_CATEGORIA
  return {
    bg: cat.cor_fundo,
    borda: `color-mix(in srgb, ${cat.cor} 26%, ${cat.cor_fundo})`,
    texto: cat.cor_texto,
    acento: cat.cor,
  }
}

/**
 * Cinza de último recurso. Depois de `corDaTurma()` ele quase não aparece
 * mais — sobra para quando não há nem categoria nem nome de modalidade.
 */
export const SEM_CATEGORIA: CorCartao = {
  bg: '#f4f4f5',
  borda: '#dcdce0',
  texto: '#52525b',
  acento: '#a1a1aa',
}

/** Hash estável: o mesmo nome devolve a mesma cor em toda sessão e tela. */
function indiceEstavel(nome: string, total: number) {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return h % total
}

export function corModalidade(nome: string): CorCartao {
  if (!nome.trim()) return SEM_CATEGORIA
  return PALETA_MARCA[indiceEstavel(nome, PALETA_MARCA.length)]
}

/**
 * A cor de um cartão no modo "categoria" — categoria cadastrada primeiro,
 * modalidade como rede de segurança.
 *
 * Não é um mapa `nome → categoria` escondido no código: isso duplicaria em
 * TypeScript uma regra de negócio que mora no banco justamente para a
 * equipe mudar sem deploy. É só uma cor estável para a turma não ficar
 * invisível enquanto o agrupamento não é feito — e por isso a legenda
 * avisa, em vez de fingir que está tudo categorizado.
 */
export function corDaTurma(turma: {
  categoria: CorCategoria | null
  modalidade: string
}): CorCartao {
  return turma.categoria ? corDaCategoria(turma.categoria) : corModalidade(turma.modalidade)
}

/**
 * Escala de OCUPAÇÃO — cinco estados, a leitura operacional da tela: onde
 * ainda cabe gente e o que está prestes a lotar.
 *
 * **Vazio é cinza, não vermelho.** A grade mostra as reservas reais da
 * semana exibida, e a realidade do estúdio hoje é que a maior parte das
 * aulas de uma semana futura começa sem ninguém (na semana de 07/09/2026,
 * 20 das 36 aulas do Wix estavam em zero). Se vazio fosse alarme, a tela
 * viveria em alarme e o alarme deixaria de significar alguma coisa.
 *
 * **Lotada também não é vermelho.** Turma cheia é a meta do estúdio, não
 * um problema: fecha em ameixa sólido, o tom mais forte da marca.
 */
export type FaixaOcupacao = {
  chave: 'vazia' | 'baixa' | 'boa' | 'quase' | 'lotada'
  label: string
  /** Cor cheia da barra e do contador. */
  barra: string
  /** Fundo do contador quando ele vira pastilha (quase cheia / lotada). */
  pastilha: string
  /** Trilho da barrinha de ocupação. */
  trilho: string
}

const OCUPACAO: Record<FaixaOcupacao['chave'], FaixaOcupacao> = {
  vazia: {
    chave: 'vazia',
    label: 'Sem reservas',
    barra: '#a1a1aa',
    pastilha: '#f4f4f5',
    trilho: '#e4e4e7',
  },
  baixa: {
    chave: 'baixa',
    label: 'Baixa ocupação',
    barra: '#db8735',
    pastilha: '#fbf1e5',
    trilho: '#efe6da',
  },
  boa: {
    chave: 'boa',
    label: 'Boa ocupação',
    barra: '#2fa9a6',
    pastilha: '#e6f6f5',
    trilho: '#d9ebea',
  },
  quase: {
    chave: 'quase',
    label: 'Quase cheia',
    barra: '#6b6193',
    pastilha: '#f0eef7',
    trilho: '#e0dcec',
  },
  lotada: {
    chave: 'lotada',
    label: 'Lotada',
    barra: '#443a66',
    pastilha: '#443a66',
    trilho: '#d8d2ea',
  },
}

export const FAIXAS_OCUPACAO = Object.values(OCUPACAO)

/**
 * Os cortes trabalham com números pequenos de propósito. As turmas reais
 * têm capacidade 5, 6, 7 e 10 (e 1, no Treino Livre) — numa turma de 6, a
 * diferença entre 3 e 5 alunos é a diferença entre "dá para vender" e
 * "acabou". Percentual grosso demais colapsaria os dois no mesmo estado.
 */
export function faixaOcupacao(reservas: number, capacidade: number): FaixaOcupacao {
  if (reservas <= 0) return OCUPACAO.vazia
  if (capacidade <= 0) return OCUPACAO.baixa
  if (reservas >= capacidade) return OCUPACAO.lotada
  const pct = (reservas / capacidade) * 100
  if (pct >= 75) return OCUPACAO.quase
  if (pct >= 40) return OCUPACAO.boa
  return OCUPACAO.baixa
}
