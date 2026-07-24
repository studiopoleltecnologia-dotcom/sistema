import { requireSupabase } from '../../../lib/supabase'
import { limitesDoPeriodo, ultimosMeses, type Periodo } from '../periodo'
import type {
  ConfigFinanceiroUpdate,
  EntradaInsert,
  EntradaUpdate,
  ReservaMovimentoInsert,
  SaidaInsert,
  TipoSaida,
} from '../types'

/**
 * Entradas do período: recebidas por data_caixa, todas as previstas em
 * aberto (independem do período — são pendências vivas) e as canceladas
 * cuja competência caiu no período (para a aba "Canceladas" ter conteúdo).
 */
export async function listarEntradas(periodo: Periodo) {
  const { inicio, fim } = limitesDoPeriodo(periodo)
  const { data, error } = await requireSupabase()
    .from('entradas_financeiras')
    .select('*')
    .or(
      `and(data_caixa.gte.${inicio},data_caixa.lte.${fim}),status.eq.prevista,and(status.eq.cancelada,data_competencia.gte.${inicio},data_competencia.lte.${fim})`,
    )
    .order('data_caixa', { ascending: false, nullsFirst: true })
  if (error) throw error
  return data
}

export async function criarEntrada(input: EntradaInsert) {
  const { data, error } = await requireSupabase()
    .from('entradas_financeiras')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarEntrada(id: string, patch: EntradaUpdate) {
  const { data, error } = await requireSupabase()
    .from('entradas_financeiras')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function excluirEntrada(id: string) {
  const { error } = await requireSupabase()
    .from('entradas_financeiras')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function listarSaidas(periodo: Periodo) {
  const { inicio, fim } = limitesDoPeriodo(periodo)
  const { data, error } = await requireSupabase()
    .from('saidas_financeiras')
    .select('*, categoria:categorias_saida(*)')
    .gte('data_caixa', inicio)
    .lte('data_caixa', fim)
    .order('data_caixa', { ascending: false })
  if (error) throw error
  return data
}

export async function criarSaida(input: SaidaInsert) {
  const { data, error } = await requireSupabase()
    .from('saidas_financeiras')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function excluirSaida(id: string) {
  const { error } = await requireSupabase()
    .from('saidas_financeiras')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function listarRecorrentes() {
  const { data, error } = await requireSupabase()
    .from('despesas_recorrentes')
    .select('*, categoria:categorias_saida(*)')
    .eq('ativa', true)
    .order('dia_vencimento')
  if (error) throw error
  return data
}

export async function criarRecorrente(input: {
  descricao: string
  valor_centavos: number
  categoria_id: string
  dia_vencimento: number
}) {
  const { data, error } = await requireSupabase()
    .from('despesas_recorrentes')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function desativarRecorrente(id: string) {
  const { error } = await requireSupabase()
    .from('despesas_recorrentes')
    .update({ ativa: false })
    .eq('id', id)
  if (error) throw error
}

/** Lança a recorrente como saída do mês de referência (1 clique). */
export async function lancarRecorrente(args: {
  recorrente: {
    id: string
    descricao: string
    valor_centavos: number
    categoria_id: string
    dia_vencimento: number
  }
  mes: string
}) {
  const dia = String(args.recorrente.dia_vencimento).padStart(2, '0')
  const { data, error } = await requireSupabase()
    .from('saidas_financeiras')
    .insert({
      descricao: args.recorrente.descricao,
      valor_centavos: args.recorrente.valor_centavos,
      categoria_id: args.recorrente.categoria_id,
      data_caixa: `${args.mes}-${dia}`,
      recorrente_id: args.recorrente.id,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listarCategoriasSaida() {
  const { data, error } = await requireSupabase()
    .from('categorias_saida')
    .select('*')
    .eq('ativa', true)
    .order('tipo')
    .order('nome')
  if (error) throw error
  return data
}

export async function criarCategoriaSaida(input: { nome: string; tipo: TipoSaida }) {
  const { data, error } = await requireSupabase()
    .from('categorias_saida')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function obterConfig() {
  const { data, error } = await requireSupabase()
    .from('config_financeiro')
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function atualizarConfig(patch: ConfigFinanceiroUpdate) {
  const { data, error } = await requireSupabase()
    .from('config_financeiro')
    .update(patch)
    .eq('id', true)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function obterMei() {
  const { data, error } = await requireSupabase()
    .from('vw_mei_acumulado')
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function obterSaldoCaixa() {
  const { data, error } = await requireSupabase()
    .from('vw_saldo_caixa')
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function listarReserva() {
  const { data, error } = await requireSupabase()
    .from('reserva_movimentos')
    .select('*')
    .order('data', { ascending: false })
  if (error) throw error
  return data
}

export async function criarReservaMovimento(input: ReservaMovimentoInsert) {
  const { data, error } = await requireSupabase()
    .from('reserva_movimentos')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Receita por categoria, mês a mês, dentro do período — alimenta os gráficos. */
export async function listarMixReceitaPeriodo(periodo: Periodo) {
  const { inicio, fim } = limitesDoPeriodo(periodo)
  const { data, error } = await requireSupabase()
    .from('vw_mix_receita_mensal')
    .select('*')
    .gte('mes', inicio)
    .lte('mes', fim)
    .order('mes')
  if (error) throw error
  return data
}

/** Últimos N meses (incl. o atual) de receita por categoria. Usado pelo Dashboard. */
export async function listarMixReceitaMensal(meses: number) {
  return listarMixReceitaPeriodo(ultimosMeses(meses))
}

/** Saída por tipo (recorrente/planejada/variável), mês a mês, dentro do período. */
export async function listarSaidasPeriodo(periodo: Periodo) {
  const { inicio, fim } = limitesDoPeriodo(periodo)
  const { data, error } = await requireSupabase()
    .from('vw_saidas_mensal')
    .select('*')
    .gte('mes', inicio)
    .lte('mes', fim)
    .order('mes')
  if (error) throw error
  return data
}

/** Últimos N meses de saída por tipo. Usado pelo Dashboard. */
export async function listarSaidasMensal(meses: number) {
  return listarSaidasPeriodo(ultimosMeses(meses))
}
