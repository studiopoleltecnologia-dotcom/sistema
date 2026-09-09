import type { Enums, Tables, TablesInsert, TablesUpdate } from '../../lib/database.types'

export type Produto = Tables<'produtos'>
export type ProdutoInsert = TablesInsert<'produtos'>
export type ProdutoUpdate = TablesUpdate<'produtos'>
export type TipoProduto = Enums<'tipo_produto'>
export type TipoRequisito = Enums<'tipo_requisito_produto'>
export type ProdutoRequisito = Tables<'produto_requisitos'>

/**
 * `tipo_produto` é rótulo, não comportamento — nenhuma regra de negócio
 * lê esse campo. Ele existe para o formulário saber quais perguntas
 * fazem sentido mostrar.
 *
 * Quem discrimina COMPORTAMENTO é `turmas_fixas` (0 = crédito/serviço,
 * 1+ = Mensalidade por Turma Fixa) — atributo, não tipo, e a trava mora
 * no banco. Ver a migration 20260908120000.
 */
export const TIPOS_PRODUTO: { valor: TipoProduto; label: string; ajuda: string }[] = [
  {
    valor: 'plano',
    label: 'Plano',
    ajuda: 'Cobrança que se repete sozinha, ciclo após ciclo, até o aluno cancelar.',
  },
  {
    valor: 'pacote',
    label: 'Pacote',
    ajuda: 'Compra única que entrega créditos com validade própria.',
  },
  {
    valor: 'servico',
    label: 'Serviço',
    ajuda: 'Compra única sem crédito — a aula é combinada à parte.',
  },
]

export const TIPO_PRODUTO_LABEL: Record<TipoProduto, string> = {
  plano: 'Plano',
  pacote: 'Pacote',
  servico: 'Serviço',
}

export const REQUISITOS: { valor: TipoRequisito; label: string; ajuda: string }[] = [
  {
    valor: 'nunca_treinou',
    label: 'Só para quem nunca treinou aqui',
    ajuda: 'Usado na aula experimental.',
  },
  {
    valor: 'plano_ativo',
    label: 'Precisa ter plano ativo',
    ajuda: 'Usado no crédito extra.',
  },
  {
    valor: 'checkins_wellhub',
    label: 'Precisa de check-ins do Wellhub',
    ajuda: 'Usado no Studio+ — quantos check-ins, em quantos dias.',
  },
]

export const REQUISITO_LABEL: Record<TipoRequisito, string> = {
  nunca_treinou: 'nunca treinou aqui',
  plano_ativo: 'plano ativo',
  checkins_wellhub: 'check-ins Wellhub',
}

// ------------------------------------------------------------
// Como o catálogo se organiza na tela
// ------------------------------------------------------------

/**
 * O estúdio vende três coisas estruturalmente diferentes, e o
 * regulamento v3 as separa nessa ordem: plano por crédito (item 2.1/2.2),
 * mensalidade por turma fixa (2.3) e o que se compra fora de plano
 * (item 8).
 *
 * O grupo é DERIVADO dos atributos, não uma coluna nova: `turmas_fixas`
 * já diz se o produto reserva assento e `renova_automaticamente` já diz
 * se é assinatura. Guardar o grupo seria uma segunda fonte de verdade
 * que dessincroniza no primeiro produto editado.
 */
export type GrupoProduto = 'creditos' | 'turma_fixa' | 'outros'

export function grupoDoProduto(p: Pick<Produto, 'turmas_fixas' | 'renova_automaticamente'>): GrupoProduto {
  if (p.turmas_fixas > 0) return 'turma_fixa'
  if (p.renova_automaticamente) return 'creditos'
  return 'outros'
}

export const GRUPOS: {
  valor: GrupoProduto
  titulo: string
  descricao: string
  /** Cor da faixa do bloco — separa os grupos antes de qualquer leitura. */
  cor: string
}[] = [
  {
    valor: 'creditos',
    titulo: 'Planos por créditos',
    descricao: 'Um crédito, todas as modalidades da grade regular. O aluno escolhe onde usar.',
    cor: 'brand',
  },
  {
    valor: 'turma_fixa',
    titulo: 'Mensalidade por turma fixa',
    descricao:
      'Vaga reservada numa turma específica da grade — mesmo dia, mesmo horário, toda semana. Não gera crédito.',
    cor: 'success',
  },
  {
    valor: 'outros',
    titulo: 'Fora do plano',
    descricao: 'Compra única: experimental, avulsa, crédito extra, particular, treino livre e Studio+.',
    cor: 'neutral',
  },
]

/**
 * Dentro de plano por crédito e de turma fixa, o que separa as colunas é
 * o compromisso: 1 ciclo = Mensal, mais que 1 = Semestral (regulamento
 * 1.5). Produto fora do plano não tem essa divisão.
 */
export type Recorrencia = 'mensal' | 'semestral'

export function recorrenciaDoProduto(p: Pick<Produto, 'ciclos_compromisso'>): Recorrencia {
  return p.ciclos_compromisso > 1 ? 'semestral' : 'mensal'
}

export const RECORRENCIA_LABEL: Record<Recorrencia, string> = {
  mensal: 'Mensal',
  semestral: 'Semestral',
}

export const RECORRENCIA_AJUDA: Record<Recorrencia, string> = {
  mensal: 'Sem compromisso — cancela quando quiser',
  semestral: 'Compromisso de 6 ciclos, valor congelado',
}

/**
 * Frase que descreve a cobrança em português — a mesma ideia que vai
 * para o checkout do aluno. O regulamento (1.5) insiste que "mensal"
 * não é uma cobrança avulsa todo mês, e é isso que o texto precisa
 * dizer sem depender de o aluno interpretar.
 */
export function descreverCobranca(p: Produto): string {
  if (p.preco_centavos === 0) return 'Cortesia — sem cobrança'
  if (!p.renova_automaticamente) return 'Pagamento único'
  const cada =
    p.periodicidade_dias === 30 ? 'a cada 30 dias' : `a cada ${p.periodicidade_dias} dias`
  if (p.ciclos_compromisso > 1) {
    return `Cobrança automática ${cada}, com permanência mínima de ${p.ciclos_compromisso} ciclos`
  }
  return `Cobrança automática ${cada}, até cancelar`
}

/** Resumo do que o produto entrega, para a linha do cartão. */
export function descreverEntrega(p: Produto): string {
  if (p.turmas_fixas > 0) {
    return `${p.turmas_fixas} turma${p.turmas_fixas === 1 ? '' : 's'} da grade, 1 aula por semana em cada`
  }
  if (!p.gera_credito) return 'Não entrega crédito'
  const n = p.creditos_por_ciclo
  const unidade = `${n} crédito${n === 1 ? '' : 's'}`
  if (p.renova_automaticamente) return `${unidade} por ciclo`
  if (p.validade_creditos_dias) return `${unidade} · vale ${p.validade_creditos_dias} dias`
  return unidade
}

/**
 * "R$ 35,00 por aula" — o número que o regulamento manda NÃO publicar
 * (2.4, bloco INTERNO) mas que existe justamente para a equipe
 * argumentar no atendimento. Só faz sentido onde há crédito.
 */
export function custoPorAula(p: Produto): number | null {
  if (p.turmas_fixas > 0) {
    // 1 aula por semana por turma, ~4,3 semanas no ciclo de 30 dias.
    const aulas = p.turmas_fixas * 4.3
    return Math.round(p.preco_centavos / aulas)
  }
  if (!p.gera_credito || p.creditos_por_ciclo === 0) return null
  return Math.round(p.preco_centavos / p.creditos_por_ciclo)
}
