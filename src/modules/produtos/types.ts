import type { Enums, Tables, TablesInsert, TablesUpdate } from '../../lib/database.types'

export type Produto = Tables<'produtos'>
export type ProdutoInsert = TablesInsert<'produtos'>
export type ProdutoUpdate = TablesUpdate<'produtos'>
export type TipoProduto = Enums<'tipo_produto'>
export type TipoRequisito = Enums<'tipo_requisito_produto'>
export type ProdutoRequisito = Tables<'produto_requisitos'>

/**
 * `tipo_produto` é rótulo, não comportamento — nenhuma regra de negócio
 * lê esse campo. Ele existe para agrupar o catálogo na tela e para o
 * formulário saber quais perguntas fazem sentido mostrar.
 */
export const TIPOS_PRODUTO: { valor: TipoProduto; label: string; ajuda: string }[] = [
  {
    valor: 'plano',
    label: 'Plano',
    ajuda: 'Cobrança que se repete sozinha e entrega créditos a cada ciclo.',
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

/**
 * Frase que descreve a cobrança em português — a mesma ideia que vai
 * para o checkout do aluno. O regulamento (1.3) insiste que "mensal"
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

/** Resumo do que o produto entrega, para a linha da lista. */
export function descreverEntrega(p: Produto): string {
  if (!p.gera_credito) return 'não entrega crédito'
  const n = p.creditos_por_ciclo
  const unidade = `${n} crédito${n === 1 ? '' : 's'}`
  if (p.renova_automaticamente) return `${unidade} por ciclo`
  if (p.validade_creditos_dias) return `${unidade} · vale ${p.validade_creditos_dias} dias`
  return unidade
}
