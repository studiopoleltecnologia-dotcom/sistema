import { requireSupabase } from '../../../lib/supabase'
import { limitesDoPeriodo, ultimosMeses, type Periodo } from '../periodo'
import type {
  ConfigFinanceiroUpdate,
  DespesaRecorrenteUpdate,
  DividaInsert,
  DividaUpdate,
  EntradaInsert,
  EntradaUpdate,
  MovimentoDivida,
  ReservaMovimentoInsert,
  SaidaInsert,
  SaidaUpdate,
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

/**
 * Saídas já pagas no período. Só as pagas: as previstas vivem em
 * vw_contas_a_pagar (seção "A pagar"), e como data_caixa é NOT NULL com
 * default, sem o filtro de status uma parcela programada apareceria nas
 * duas seções ao mesmo tempo.
 */
export async function listarSaidas(periodo: Periodo) {
  const { inicio, fim } = limitesDoPeriodo(periodo)
  const { data, error } = await requireSupabase()
    .from('saidas_financeiras')
    .select('*, categoria:categorias_saida(*)')
    .eq('status_saida', 'paga')
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

export async function atualizarSaida(id: string, patch: SaidaUpdate) {
  const { data, error } = await requireSupabase()
    .from('saidas_financeiras')
    .update(patch)
    .eq('id', id)
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

/**
 * Devolve uma saída paga para "a pagar" — o desfazer de um clique errado.
 *
 * Não apaga nada: só troca o status. `data_prevista` recebe a data de
 * caixa quando ainda está vazia, senão a linha voltaria para a fila sem
 * vencimento (vw_contas_a_pagar cai em coalesce(data_prevista, data_caixa),
 * mas deixar explícito evita que uma edição futura de data_caixa mova o
 * vencimento junto).
 */
export async function reverterPagamentoSaida(id: string) {
  const supabase = requireSupabase()
  const { data: atual, error: erroLeitura } = await supabase
    .from('saidas_financeiras')
    .select('data_caixa, data_prevista')
    .eq('id', id)
    .single()
  if (erroLeitura) throw erroLeitura

  const { error } = await supabase
    .from('saidas_financeiras')
    .update({
      status_saida: 'prevista',
      data_prevista: atual.data_prevista ?? atual.data_caixa,
    })
    .eq('id', id)
  if (error) throw error
}

export async function atualizarRecorrente(id: string, patch: DespesaRecorrenteUpdate) {
  const { data, error } = await requireSupabase()
    .from('despesas_recorrentes')
    .update(patch)
    .eq('id', id)
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
      data_competencia: `${args.mes}-01`,
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

/** Receita recorrente dos mensalistas (MRR) — resumo de 1 linha, gestão-only. */
export async function obterMrr() {
  const { data, error } = await requireSupabase()
    .from('vw_mrr')
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

/** DRE por mês de COMPETÊNCIA (não caixa) — receita e despesa geradas no mês, recebidas ou não. */
export async function listarDreCompetencia(periodo: Periodo) {
  const { inicio, fim } = limitesDoPeriodo(periodo)
  const { data, error } = await requireSupabase()
    .from('vw_dre_competencia')
    .select('*')
    .gte('mes', inicio)
    .lte('mes', fim)
  if (error) throw error
  return data
}

/** Recorrentes pendentes + saídas 'prevista' (inclui a folha automática de professora). */
export async function listarContasAPagar() {
  const { data, error } = await requireSupabase()
    .from('vw_contas_a_pagar')
    .select('*')
    .order('vencimento')
  if (error) throw error
  return data
}

/**
 * Dívidas com o quanto já foi abatido e o extrato de cada uma. O total pago
 * é derivado das saídas (`divida_id`), nunca guardado numa coluna: assim o
 * saldo restante e o histórico não têm como divergir um do outro.
 *
 * O extrato vem junto — e não numa consulta por dívida aberta na tela —
 * porque a visão é agrupada por pessoa: um card precisa somar as parcelas e
 * os pagamentos de *todos* os empréstimos dela para mostrar o andamento.
 * Buscar por dívida faria N consultas para desenhar um card só.
 */
export async function listarDividas() {
  const supabase = requireSupabase()
  const [{ data: dividas, error }, { data: pagamentos, error: erroPagamentos }] = await Promise.all([
    supabase.from('dividas').select('*').order('quitada').order('criada_em'),
    supabase
      .from('saidas_financeiras')
      .select('id, divida_id, descricao, valor_centavos, status_saida, data_caixa, data_prevista')
      .not('divida_id', 'is', null),
  ])
  if (error) throw error
  if (erroPagamentos) throw erroPagamentos

  const pago = new Map<string, number>()
  const programado = new Map<string, number>()
  const extrato = new Map<string, MovimentoDivida[]>()
  for (const p of pagamentos ?? []) {
    if (!p.divida_id) continue
    const alvo = p.status_saida === 'paga' ? pago : p.status_saida === 'prevista' ? programado : null
    if (!alvo) continue
    alvo.set(p.divida_id, (alvo.get(p.divida_id) ?? 0) + p.valor_centavos)
    const lista = extrato.get(p.divida_id) ?? []
    lista.push({ ...p, divida_id: p.divida_id })
    extrato.set(p.divida_id, lista)
  }

  return (dividas ?? []).map((d) => ({
    ...d,
    pago_centavos: pago.get(d.id) ?? 0,
    programado_centavos: programado.get(d.id) ?? 0,
    movimentos: extrato.get(d.id) ?? [],
  }))
}

async function categoriaDivida() {
  const { data, error } = await requireSupabase()
    .from('categorias_saida')
    .select('id')
    .eq('nome', 'Pagamento de dívida')
    .single()
  if (error) throw error
  return data.id
}

/** Abatimento avulso: dinheiro que já saiu, sem ter sido programado antes. */
export async function registrarPagamentoDivida(args: {
  dividaId: string
  descricao: string
  valorCentavos: number
  data: string
}) {
  const { error } = await requireSupabase()
    .from('saidas_financeiras')
    .insert({
      descricao: args.descricao,
      valor_centavos: args.valorCentavos,
      categoria_id: await categoriaDivida(),
      divida_id: args.dividaId,
      data_caixa: args.data,
      data_competencia: `${args.data.slice(0, 7)}-01`,
      status_saida: 'paga',
    })
  if (error) throw error
}

/**
 * Cronograma: cada parcela nasce como saída 'prevista' no mês dela, então
 * aparece sozinha em Saídas → Dívidas → A pagar, sem cadastro duplicado.
 */
export async function programarParcelasDivida(args: {
  dividaId: string
  descricao: string
  parcelas: { mes: string; valorCentavos: number }[]
}) {
  const categoriaId = await categoriaDivida()
  const { error } = await requireSupabase().from('saidas_financeiras').insert(
    args.parcelas.map((p) => ({
      descricao: args.descricao,
      valor_centavos: p.valorCentavos,
      categoria_id: categoriaId,
      divida_id: args.dividaId,
      data_competencia: `${p.mes}-01`,
      data_prevista: `${p.mes}-05`,
      // data_caixa é NOT NULL: sem valor explícito viria current_date, o que
      // faria a parcela de outubro parecer paga hoje em qualquer tela que
      // ordene por ela. Enquanto 'prevista' o número é ignorado (as views
      // filtram por status), mas fica coerente com o vencimento.
      data_caixa: `${p.mes}-05`,
      status_saida: 'prevista' as const,
    })),
  )
  if (error) throw error
}

export async function criarDivida(input: DividaInsert) {
  const { data, error } = await requireSupabase()
    .from('dividas')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarDivida(id: string, patch: DividaUpdate) {
  const { data, error } = await requireSupabase()
    .from('dividas')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
