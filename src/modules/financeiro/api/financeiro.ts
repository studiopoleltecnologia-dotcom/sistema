import { requireSupabase } from '../../../lib/supabase'
import type {
  ConfigFinanceiroUpdate,
  EntradaInsert,
  EntradaUpdate,
  ReservaMovimentoInsert,
  SaidaInsert,
  TipoSaida,
} from '../types'

/** Primeiro e último dia (ISO) do mês de referência. */
export function limitesDoMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fim = new Date(ano, m, 0).getDate()
  return { inicio, fim: `${mes}-${String(fim).padStart(2, '0')}` }
}

/** Entradas do mês (por data_caixa) + todas as previstas em aberto. */
export async function listarEntradas(mes: string) {
  const { inicio, fim } = limitesDoMes(mes)
  const { data, error } = await requireSupabase()
    .from('entradas_financeiras')
    .select('*')
    .or(
      `and(data_caixa.gte.${inicio},data_caixa.lte.${fim}),status.eq.prevista`,
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

export async function listarSaidas(mes: string) {
  const { inicio, fim } = limitesDoMes(mes)
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

/** Últimos N meses (incl. o atual) de receita por categoria — alimenta os gráficos. */
export async function listarMixReceitaMensal(meses: number) {
  const desde = new Date()
  desde.setMonth(desde.getMonth() - (meses - 1))
  desde.setDate(1)
  const { data, error } = await requireSupabase()
    .from('vw_mix_receita_mensal')
    .select('*')
    .gte('mes', desde.toISOString().slice(0, 10))
    .order('mes')
  if (error) throw error
  return data
}

/** Últimos N meses de saída por tipo (recorrente/planejada/variável). */
export async function listarSaidasMensal(meses: number) {
  const desde = new Date()
  desde.setMonth(desde.getMonth() - (meses - 1))
  desde.setDate(1)
  const { data, error } = await requireSupabase()
    .from('vw_saidas_mensal')
    .select('*')
    .gte('mes', desde.toISOString().slice(0, 10))
    .order('mes')
  if (error) throw error
  return data
}
