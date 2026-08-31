import type { Enums, Tables, TablesInsert, TablesUpdate } from '../../lib/database.types'

export type Entrada = Tables<'entradas_financeiras'>
export type EntradaInsert = TablesInsert<'entradas_financeiras'>
export type EntradaUpdate = TablesUpdate<'entradas_financeiras'>
export type Saida = Tables<'saidas_financeiras'>
export type SaidaInsert = TablesInsert<'saidas_financeiras'>
export type SaidaUpdate = TablesUpdate<'saidas_financeiras'>
export type CategoriaSaida = Tables<'categorias_saida'>
export type ConfigFinanceiro = Tables<'config_financeiro'>
export type ConfigFinanceiroUpdate = TablesUpdate<'config_financeiro'>
export type ReservaMovimento = Tables<'reserva_movimentos'>
export type ReservaMovimentoInsert = TablesInsert<'reserva_movimentos'>
export type MeiAcumulado = Tables<'vw_mei_acumulado'>
export type SaldoCaixa = Tables<'vw_saldo_caixa'>
export type Mrr = Tables<'vw_mrr'>
export type MixReceitaMensal = Tables<'vw_mix_receita_mensal'>
export type SaidasMensal = Tables<'vw_saidas_mensal'>
export type DespesaRecorrente = Tables<'despesas_recorrentes'>
export type DespesaRecorrenteUpdate = TablesUpdate<'despesas_recorrentes'>
export type DreCompetencia = Tables<'vw_dre_competencia'>
export type ContaAPagar = Tables<'vw_contas_a_pagar'>
export type Divida = Tables<'dividas'>
export type DividaInsert = TablesInsert<'dividas'>
export type DividaUpdate = TablesUpdate<'dividas'>

export type CategoriaEntrada = Enums<'categoria_entrada'>
export type StatusEntrada = Enums<'status_entrada'>
export type StatusSaida = Enums<'status_saida'>
export type TipoSaida = Enums<'tipo_saida'>

/**
 * Uma linha do extrato de uma dívida. É sempre uma saída com `divida_id`:
 * `prevista` = parcela agendada que ainda vai sair do caixa, `paga` =
 * abatimento que já saiu. Não existe tabela de "parcela" — é a mesma saída
 * que aparece em Saídas → Dívidas, por isso os números não divergem.
 */
export type MovimentoDivida = {
  id: string
  divida_id: string
  descricao: string | null
  valor_centavos: number
  status_saida: StatusSaida
  data_caixa: string
  data_prevista: string | null
}

export const CATEGORIAS_ENTRADA: { value: CategoriaEntrada; label: string }[] = [
  { value: 'mensalista', label: 'Mensalista' },
  { value: 'wellhub', label: 'Wellhub' },
  { value: 'classpass', label: 'ClassPass' },
  { value: 'avulsa', label: 'Aula avulsa' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'evento', label: 'Evento' },
  { value: 'outros', label: 'Outros' },
]

export const CATEGORIA_ENTRADA_LABEL = Object.fromEntries(
  CATEGORIAS_ENTRADA.map((c) => [c.value, c.label]),
) as Record<CategoriaEntrada, string>

export const TIPO_SAIDA_LABEL: Record<TipoSaida, string> = {
  fixa: 'Fixo recorrente',
  fixa_planejada: 'Fixo recorrente',
  variavel: 'Variável',
}

export const TIPO_SAIDA_DESCRICAO: Record<TipoSaida, string> = {
  fixa: 'Todo mês, o custo de manter as portas abertas',
  fixa_planejada: 'Todo mês, o custo de manter as portas abertas',
  variavel: 'Depende da operação — professoras, comissões, materiais',
}

/**
 * Ordem de exibição. `fixa_planejada` saiu: a gestão não distingue "fixo
 * planejado" de "fixo recorrente" (18/08/2026), e a migration daquele dia
 * migrou as categorias para 'fixa'. O valor segue no enum do Postgres —
 * remover valor de enum exige recriar o tipo — mas nada novo o usa, e o
 * LABEL acima ainda o mapeia caso apareça em dado histórico.
 */
export const ORDEM_TIPO_SAIDA: TipoSaida[] = ['fixa', 'variavel']

/** Grupos de Saídas: dívida é decidida por divida_id, não por tipo. */
export type GrupoSaida = 'fixa' | 'variavel' | 'divida'

export const GRUPO_SAIDA_LABEL: Record<GrupoSaida, string> = {
  fixa: 'Fixo recorrente',
  variavel: 'Variável',
  divida: 'Dívidas',
}

export const GRUPO_SAIDA_DESCRICAO: Record<GrupoSaida, string> = {
  fixa: 'Todo mês, o custo de manter as portas abertas',
  variavel: 'Depende da operação — professoras, comissões, materiais',
  divida: 'Abatimento de empréstimos — sai do caixa, não conta como despesa',
}

export const ORDEM_GRUPO_SAIDA: GrupoSaida[] = ['fixa', 'variavel', 'divida']

/** Um tipo_saida do banco cai em qual grupo de tela. */
export function grupoDoTipo(tipo: TipoSaida | string | null | undefined): GrupoSaida {
  return tipo === 'fixa' || tipo === 'fixa_planejada' ? 'fixa' : 'variavel'
}

/**
 * Status "de tela" de uma entrada. `atrasada` não existe no banco — é
 * derivada de uma prevista cuja data_prevista já passou. As demais espelham
 * o enum status_entrada.
 */
export type StatusEntradaVis = 'recebida' | 'pendente' | 'atrasada' | 'cancelada'

export function statusEntradaVis(
  e: Pick<Entrada, 'status' | 'data_prevista'>,
  hojeISO: string,
): StatusEntradaVis {
  if (e.status === 'recebida') return 'recebida'
  if (e.status === 'cancelada') return 'cancelada'
  if (e.data_prevista != null && e.data_prevista < hojeISO) return 'atrasada'
  return 'pendente'
}

/** Alertas MEI nos degraus do CLAUDE.md seção 8. */
export function nivelAlertaMei(percentual: number): 'ok' | 'atencao' | 'alerta' | 'critico' {
  if (percentual >= 95) return 'critico'
  if (percentual >= 85) return 'alerta'
  if (percentual >= 70) return 'atencao'
  return 'ok'
}
