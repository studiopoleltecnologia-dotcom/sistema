import { cadaCiclo, porCiclo, sufixoCiclo } from '../../../../lib/ciclo'
import type { Enums, Tables } from '../../../../lib/database.types'
import {
  economiaMensal,
  grupoDoProduto,
  recorrenciaDoProduto,
  type Recorrencia,
} from '../../../produtos/types'

export type Produto = Tables<'produtos'>
export type TipoRequisito = Enums<'tipo_requisito_produto'>
export type { Recorrencia }
export { recorrenciaDoProduto }

/**
 * Os dois formatos de plano que o aluno escolhe no topo da tela.
 *
 * O corte é o mesmo do catálogo da equipe (`grupoDoProduto`): derivado de
 * `turmas_fixas` e `renova_automaticamente`, nunca do nome. Produto novo
 * cadastrado pela equipe cai no lugar certo sozinho.
 */
export type TipoPlano = 'creditos' | 'turma_fixa'

export const TIPOS_PLANO: TipoPlano[] = ['creditos', 'turma_fixa']

/** Onde o produto aparece: num dos dois formatos, ou na vitrine de avulsos. */
export function lugarDoProduto(p: Produto): TipoPlano | 'avulso' {
  const g = grupoDoProduto(p)
  return g === 'outros' ? 'avulso' : g
}

function plural(n: number, um: string, varios = `${um}s`) {
  return n === 1 ? um : varios
}

/** "R$ 300" — centavos só quando existem ("R$ 54,50"). */
export function fmtPreco(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: centavos % 100 === 0 ? 0 : 2,
  })
}

/** "/mês" na assinatura mensal; compra única não leva sufixo. */
export function sufixoPreco(p: Produto): string {
  if (!p.renova_automaticamente) return ''
  return sufixoCiclo(p)
}

/** O número grande do cartão e a unidade embaixo dele: "8" + "aulas". */
export function destaqueDoPlano(p: Produto): { numero: number; unidade: string } {
  if (p.turmas_fixas > 0) {
    return { numero: p.turmas_fixas, unidade: plural(p.turmas_fixas, 'turma') }
  }
  return { numero: p.creditos_por_ciclo, unidade: plural(p.creditos_por_ciclo, 'aula') }
}

/** Título por extenso, para a folha de detalhes: "8 aulas por mês", "1 turma fixa". */
export function tituloDoPlano(p: Produto): string {
  if (p.turmas_fixas > 0) {
    return `${p.turmas_fixas} ${plural(p.turmas_fixas, 'turma fixa', 'turmas fixas')}`
  }
  const n = p.creditos_por_ciclo
  return `${n} ${plural(n, 'aula')} ${porCiclo(p)}`
}

/**
 * A única linha de apoio do cartão de plano. No mensal o crédito morre no
 * fim do ciclo, então "válidos até a renovação" é literal; no semestral
 * ele acumula, e a mesma frase seria mentira.
 */
export function entregaDoPlano(p: Produto): string {
  if (p.turmas_fixas > 0) {
    return p.turmas_fixas === 1
      ? '1 aula por semana, sempre no mesmo horário'
      : `${p.turmas_fixas} aulas por semana, em horários fixos`
  }
  if (!p.gera_credito) return 'Horário combinado com o estúdio'
  const n = p.creditos_por_ciclo
  const creditos = `${n} ${plural(n, 'crédito')}`
  return p.acumula_creditos
    ? `${creditos} ${porCiclo(p)}`
    : `${creditos} ${porCiclo(p)}, ${plural(n, 'válido')} até a renovação`
}

/** Linha de apoio de um avulso: quanto entrega e por quanto tempo vale. */
export function resumoAvulso(p: Produto): string {
  if (!p.gera_credito || p.creditos_por_ciclo === 0) return 'Horário combinado com o estúdio'
  const n = p.creditos_por_ciclo
  const dias = p.validade_creditos_dias ?? p.periodicidade_dias
  return `${n} ${plural(n, 'aula')} · ${plural(n, 'válida')} por ${dias} dias`
}

/**
 * Quanto o semestral economiza no compromisso inteiro ("R$ 60 no
 * semestre"), a partir do par mensal que `produto_sucessor_id` já
 * registra. É o número que a apresentação dos planos usa — o custo por
 * aula, não: o regulamento manda não publicar.
 */
export function economiaNoCompromisso(p: Produto, porId: Map<string, Produto>): number | null {
  const porMes = economiaMensal(p, porId)
  return porMes === null ? null : porMes * p.ciclos_compromisso
}

/** A frase de cobrança dita ANTES do botão de contratar (regulamento 1.3). */
export function fraseCobranca(p: Produto): string {
  if (!p.renova_automaticamente) return 'Pagamento único.'
  const cada = cadaCiclo(p)
  return p.ciclos_compromisso > 1
    ? `Cobrança automática ${cada}, com permanência mínima de ${p.ciclos_compromisso} meses.`
    : `Cobrança automática ${cada}. Renova sozinho até você cancelar.`
}

/** Selo curto do requisito, na voz de quem compra. */
export const REQUISITO_SELO: Record<TipoRequisito, string> = {
  nunca_treinou: 'Primeira vez aqui',
  plano_ativo: 'Para quem tem plano',
  checkins_wellhub: 'Para quem usa Wellhub',
}

/**
 * A RPC devolve o motivo em português; o que vale traduzir é o que o
 * aluno consegue resolver sozinho. O resto vira a mensagem genérica.
 */
export function mensagemErroContratacao(e: unknown): string {
  const texto = (e as { message?: string } | null)?.message ?? ''
  const limite = texto.match(/limite de (\d+) contrata/)
  if (limite) {
    return Number(limite[1]) === 1
      ? 'Este item é limitado a uma compra por pessoa, e você já contratou.'
      : `Este item é limitado a ${limite[1]} compras por pessoa, e você já atingiu o limite.`
  }
  return 'Não foi possível contratar. Tente novamente.'
}

export function menorPreco(produtos: Produto[]): Produto | null {
  return produtos.reduce<Produto | null>(
    (menor, p) => (menor === null || p.preco_centavos < menor.preco_centavos ? p : menor),
    null,
  )
}

export function periodoLabel(r: Recorrencia): string {
  return r === 'semestral' ? 'Semestral' : 'Mensal'
}
