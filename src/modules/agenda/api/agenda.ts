import { requireSupabase } from '../../../lib/supabase'
import type {
  CanalAula,
  CategoriaModalidade,
  CategoriaModalidadeInsert,
  CategoriaModalidadeUpdate,
  TurmaInsert,
  TurmaUpdate,
} from '../types'

export async function listarTurmas() {
  const sb = requireSupabase()
  // O nome da professora vem de vw_professoras_nomes (id/nome/ativa) e
  // não da tabela professoras, que virou gestão-only para não expor o
  // valor_por_aluna. A secretária opera a Agenda vendo só os nomes.
  //
  // A categoria chega em duas consultas (modalidades + categorias) e é
  // costurada aqui, no mesmo padrão de professora e sala. Um join
  // aninhado no PostgREST atravessaria duas RLS diferentes e devolveria
  // a turma sem cor quando uma delas recusasse — silenciosamente.
  const [turmasRes, nomesRes, salasRes, modsRes, catsRes] = await Promise.all([
    sb.from('turmas').select('*').eq('ativa', true).order('dia_semana').order('horario'),
    sb.from('vw_professoras_nomes').select('id, nome, ativa'),
    sb.from('salas').select('id, nome').eq('ativa', true),
    sb.from('modalidades').select('id, categoria_id'),
    sb.from('categorias_modalidade').select('*'),
  ])
  if (turmasRes.error) throw turmasRes.error
  if (nomesRes.error) throw nomesRes.error
  if (salasRes.error) throw salasRes.error
  if (modsRes.error) throw modsRes.error
  if (catsRes.error) throw catsRes.error

  const nomes = new Map((nomesRes.data ?? []).map((p) => [p.id, p]))
  const salas = new Map((salasRes.data ?? []).map((s) => [s.id, s]))
  const cats = new Map((catsRes.data ?? []).map((c) => [c.id, c]))
  const catDaModalidade = new Map(
    (modsRes.data ?? []).map((m) => [m.id, m.categoria_id ? cats.get(m.categoria_id) ?? null : null]),
  )

  return (turmasRes.data ?? []).map((t) => ({
    ...t,
    professora: nomes.get(t.professora_id) ?? { id: t.professora_id, nome: '—', ativa: true },
    sala: t.sala_id ? salas.get(t.sala_id) ?? null : null,
    categoria: t.modalidade_id ? catDaModalidade.get(t.modalidade_id) ?? null : null,
  }))
}

/** Ocupação média por turma nas últimas 8 semanas (view vw_ocupacao_turma). */
export async function listarOcupacao() {
  const { data, error } = await requireSupabase()
    .from('vw_ocupacao_turma')
    .select('*')
    .order('ocupacao_pct', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Ocupação real de cada turma num intervalo [inicio, fim) — usada pela grade
 * para mostrar "2/6" da semana exibida.
 *
 * Reaproveita `fn_ocupacao_turma`, que já existia para as Análises: com a
 * janela de uma semana, `ocorrencias` é 1 por turma e `reservas` vira a
 * contagem daquela semana. Por isso a grade não precisou de view nova.
 */
export async function listarOcupacaoPeriodo(inicio: string, fim: string) {
  const { data, error } = await requireSupabase().rpc('fn_ocupacao_turma', {
    p_inicio: inicio,
    p_fim: fim,
  })
  if (error) throw error
  return data
}

export async function listarSalas() {
  const { data, error } = await requireSupabase()
    .from('salas')
    .select('*')
    .eq('ativa', true)
    .order('ordem')
  if (error) throw error
  return data
}

/**
 * Todas as salas, desativadas inclusive — só para a tela de cadastro.
 *
 * `listarSalas()` filtra `ativa = true` porque alimenta o seletor de turma.
 * No cadastro é o contrário, e pelo mesmo motivo das modalidades: sem ver a
 * desativada não há como reativá-la, e a pessoa acaba criando uma segunda
 * "Sala 2" ao lado da que já existe. `salas.nome` não tem unique, então a
 * duplicata passaria calada e a grade se dividiria em três colunas.
 */
export async function listarTodasSalas() {
  const { data, error } = await requireSupabase()
    .from('salas')
    .select('*')
    .order('ativa', { ascending: false })
    .order('ordem')
  if (error) throw error
  return data
}

export async function criarSala({ nome, ordem }: { nome: string; ordem: number }) {
  const { data, error } = await requireSupabase()
    .from('salas')
    .insert({ nome: nome.trim(), ordem })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Renomear, reordenar ou ativar/desativar uma sala. */
export async function atualizarSala(
  id: string,
  patch: { nome?: string; ativa?: boolean; ordem?: number },
) {
  const { data, error } = await requireSupabase()
    .from('salas')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** sala_id → nº de turmas ativas nela. Desativar sala com turma é o aviso. */
export async function contarTurmasPorSala() {
  const { data, error } = await requireSupabase().from('turmas').select('sala_id').eq('ativa', true)
  if (error) throw error
  const contagem = new Map<string, number>()
  for (const t of data ?? []) {
    if (t.sala_id) contagem.set(t.sala_id, (contagem.get(t.sala_id) ?? 0) + 1)
  }
  return contagem
}

export async function listarModalidades() {
  const { data, error } = await requireSupabase()
    .from('modalidades')
    .select('*')
    .eq('ativa', true)
    .order('ordem')
    .order('nome')
  if (error) throw error
  return data
}

/** "+ criar nova" no formulário de turma — cadastra e devolve para já selecionar. */
export async function criarModalidade({
  nome,
  categoriaId,
}: {
  nome: string
  categoriaId: string | null
}) {
  const { data, error } = await requireSupabase()
    .from('modalidades')
    .insert({ nome: nome.trim(), ordem: 99, categoria_id: categoriaId })
    .select('id, nome')
    .single()
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// Categorias de modalidade — o agrupamento visual da grade.
// Leitura liberada a qualquer conta autenticada (a cor também vale no
// portal do aluno); escrita é da operação, pela RLS.
// ------------------------------------------------------------

export async function listarCategorias() {
  const { data, error } = await requireSupabase()
    .from('categorias_modalidade')
    .select('*')
    .eq('ativa', true)
    .order('ordem')
    .order('nome')
  if (error) throw error
  return data
}

export async function criarCategoria(input: CategoriaModalidadeInsert) {
  const { data, error } = await requireSupabase()
    .from('categorias_modalidade')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarCategoria(id: string, patch: CategoriaModalidadeUpdate) {
  const { data, error } = await requireSupabase()
    .from('categorias_modalidade')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Arquiva em vez de apagar. Categoria some da grade e do cadastro, mas as
 * modalidades que apontam para ela continuam apontando — nada de histórico
 * é perdido e reativar devolve a cor de todas de uma vez.
 */
export async function arquivarCategoria(id: string) {
  const { error } = await requireSupabase()
    .from('categorias_modalidade')
    .update({ ativa: false })
    .eq('id', id)
  if (error) throw error
}

/** Move uma modalidade de categoria (ou a deixa sem categoria com null). */
export async function definirCategoriaDaModalidade(
  modalidadeId: string,
  categoriaId: string | null,
) {
  const { error } = await requireSupabase()
    .from('modalidades')
    .update({ categoria_id: categoriaId })
    .eq('id', modalidadeId)
  if (error) throw error
}

/**
 * Todas as modalidades, arquivadas inclusive — só para a tela de cadastro.
 *
 * `listarModalidades()` filtra `ativa = true` porque alimenta o seletor de
 * turma, onde modalidade arquivada não pode reaparecer. No cadastro é o
 * contrário: sem ver a arquivada, não há como reativá-la, e a pessoa acaba
 * criando uma duplicata com o mesmo nome.
 */
export async function listarTodasModalidades() {
  const { data, error } = await requireSupabase()
    .from('modalidades')
    .select('*')
    .order('ativa', { ascending: false })
    .order('ordem')
    .order('nome')
  if (error) throw error
  return data
}

/** Renomear, reordenar ou arquivar/reativar uma modalidade. */
export async function atualizarModalidade(
  id: string,
  patch: {
    nome?: string
    ativa?: boolean
    ordem?: number
    categoria_id?: string | null
    /** Regulamento 2.3.6 — se aceita Mensalidade por Turma Fixa. */
    elegivel_turma_fixa?: boolean
  },
) {
  const { data, error } = await requireSupabase()
    .from('modalidades')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Quantas turmas ATIVAS usam cada modalidade.
 *
 * É o que impede arquivar às cegas: a modalidade arquivada some do seletor,
 * mas as turmas que já a usam continuam na grade apontando para ela. Saber
 * "está em 9 turmas" antes de clicar é a diferença entre uma decisão e um
 * susto na segunda-feira.
 */
export async function contarTurmasPorModalidade() {
  const { data, error } = await requireSupabase()
    .from('turmas')
    .select('modalidade_id')
    .eq('ativa', true)
  if (error) throw error
  const contagem = new Map<string, number>()
  for (const t of data ?? []) {
    if (t.modalidade_id) contagem.set(t.modalidade_id, (contagem.get(t.modalidade_id) ?? 0) + 1)
  }
  return contagem
}

export type { CategoriaModalidade }

/** Nomes de professoras para o seletor de turma (sem dado financeiro). */
export async function listarNomesProfessoras() {
  const { data, error } = await requireSupabase()
    .from('vw_professoras_nomes')
    .select('id, nome, ativa')
    .eq('ativa', true)
    .order('nome')
  if (error) throw error
  return data
}

export async function criarTurma(input: TurmaInsert) {
  const { data, error } = await requireSupabase()
    .from('turmas')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarTurma(id: string, patch: TurmaUpdate) {
  const { data, error } = await requireSupabase()
    .from('turmas')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function desativarTurma(id: string) {
  const { error } = await requireSupabase()
    .from('turmas')
    .update({ ativa: false })
    .eq('id', id)
  if (error) throw error
}

/** Agendamentos ativos + presenças de uma data (para a visão do dia). */
export async function listarDia(data: string) {
  const sb = requireSupabase()
  const [ags, prs] = await Promise.all([
    sb
      .from('agendamentos')
      .select('*, cliente:clientes(*)')
      .eq('data', data)
      .eq('status', 'agendado'),
    sb.from('presencas').select('*').eq('data_aula', data),
  ])
  if (ags.error) throw ags.error
  if (prs.error) throw prs.error
  return { agendamentos: ags.data, presencas: prs.data }
}

export async function agendarAula(args: {
  cliente_id: string
  turma_id: string
  data: string
  canal: CanalAula
}) {
  const { data, error } = await requireSupabase().rpc('agendar_aula', {
    p_cliente: args.cliente_id,
    p_turma: args.turma_id,
    p_data: args.data,
    p_canal: args.canal,
  })
  if (error) throw error
  return data
}

export async function cancelarAgendamento(id: string) {
  const { data, error } = await requireSupabase().rpc('cancelar_agendamento', {
    p_agendamento: id,
    p_origem: 'socia',
  })
  if (error) throw error
  return data // true = crédito devolvido
}

export async function registrarPresenca(args: {
  turma_id: string
  data: string
  cliente_id: string
  presente: boolean
  canal?: CanalAula
}) {
  const { data, error } = await requireSupabase().rpc('registrar_presenca', {
    p_turma: args.turma_id,
    p_data: args.data,
    p_cliente: args.cliente_id,
    p_presente: args.presente,
    ...(args.canal ? { p_canal: args.canal } : {}),
  })
  if (error) throw error
  return data
}

export async function obterConfigAgendamento() {
  const { data, error } = await requireSupabase()
    .from('config_agendamento')
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function atualizarConfigAgendamento(patch: {
  horas_cancelamento?: number
  valor_checkin_wellhub_centavos?: number
  dias_antecedencia_cobranca?: number
  faltas_para_suspensao?: number
  dias_suspensao_faltas?: number
  minutos_tolerancia_atraso?: number
}) {
  const { data, error } = await requireSupabase()
    .from('config_agendamento')
    .update(patch)
    .eq('id', true)
    .select()
    .single()
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// Fila de check-ins sem turma atribuída (migration 20260808120000).
// Duas salas na mesma hora tornam o horário insuficiente para dizer
// a que turma o check-in pertence — o sistema enfileira em vez de
// adivinhar, porque turma errada paga a professora errada.
// ------------------------------------------------------------

/** Uma turma que o horário do check-in não conseguiu descartar. */
export type CandidataCheckin = {
  turma_id: string
  horario: string
  modalidade: string
  sala: string | null
  professora: string | null
}

export type CheckinPendente = {
  id: string
  cliente_id: string
  cliente: string
  gympass_id: string | null
  momento: string
  data_checkin: string
  dia_semana: number
  turmas_candidatas: string[]
  motivo: 'ambiguo' | 'sem_turma'
  candidatas: CandidataCheckin[]
}

export async function listarCheckinsPendentes() {
  const { data, error } = await requireSupabase()
    .from('vw_checkins_pendentes')
    .select('*')
    .order('data_checkin', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as CheckinPendente[]
}

/** `turma_id` nulo = descartar (aí a observação é obrigatória). */
export async function resolverCheckinPendente(args: {
  pendencia_id: string
  turma_id: string | null
  observacao?: string | null
}) {
  // `p_turma` e `p_observacao` são nuláveis no banco, mas o gerador de tipos
  // do Supabase declara todo argumento de RPC como não-nulo. O cast é só para
  // conseguir passar o null que a função espera (turma nula = descarte).
  const { data, error } = await requireSupabase().rpc('resolver_checkin_pendente', {
    p_pendencia: args.pendencia_id,
    p_turma: args.turma_id,
    p_observacao: args.observacao ?? null,
  } as unknown as { p_pendencia: string; p_turma: string; p_observacao?: string })
  if (error) throw error
  return data
}

/**
 * Suspensões por falta (regulamento 4.7). Traz também as revogadas e as
 * vencidas: o histórico é o que permite a equipe responder "por que ela
 * ficou suspensa em agosto".
 */
export async function listarSuspensoes() {
  const { data, error } = await requireSupabase()
    .from('suspensoes_agendamento')
    .select('*, clientes(nome)')
    .order('criada_em', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

export async function revogarSuspensao(args: { id: string; motivo?: string }) {
  const { data, error } = await requireSupabase().rpc('revogar_suspensao', {
    p_suspensao: args.id,
    p_motivo: args.motivo ?? undefined,
  })
  if (error) throw error
  return data
}

/**
 * Aulas que já aconteceram e ninguém marcou presença nem falta.
 * Existe porque falta NÃO é presumida (etapa 5): sem esta lista, a
 * marcação esquecida sumiria e a regra das 3 faltas furaria calada.
 */
export async function listarAulasSemPresenca() {
  const { data, error } = await requireSupabase()
    .from('vw_aulas_sem_presenca')
    .select('*')
    .order('data', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}
