import type { Enums, Tables, TablesInsert, TablesUpdate } from '../../lib/database.types'

export type Entrada = Tables<'entradas_financeiras'>
export type EntradaInsert = TablesInsert<'entradas_financeiras'>
export type EntradaUpdate = TablesUpdate<'entradas_financeiras'>
export type Saida = Tables<'saidas_financeiras'>
export type SaidaInsert = TablesInsert<'saidas_financeiras'>
export type CategoriaSaida = Tables<'categorias_saida'>
export type ConfigFinanceiro = Tables<'config_financeiro'>
export type ConfigFinanceiroUpdate = TablesUpdate<'config_financeiro'>
export type ReservaMovimento = Tables<'reserva_movimentos'>
export type ReservaMovimentoInsert = TablesInsert<'reserva_movimentos'>
export type MeiAcumulado = Tables<'vw_mei_acumulado'>

export type CategoriaEntrada = Enums<'categoria_entrada'>
export type StatusEntrada = Enums<'status_entrada'>
export type TipoSaida = Enums<'tipo_saida'>

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
  fixa: 'Fixa',
  variavel: 'Variável',
}

/** Alertas MEI nos degraus do CLAUDE.md seção 8. */
export function nivelAlertaMei(percentual: number): 'ok' | 'atencao' | 'alerta' | 'critico' {
  if (percentual >= 95) return 'critico'
  if (percentual >= 85) return 'alerta'
  if (percentual >= 70) return 'atencao'
  return 'ok'
}
