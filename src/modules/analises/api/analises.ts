import { requireSupabase } from '../../../lib/supabase'

export async function listarResumo() {
  const { data, error } = await requireSupabase().from('vw_analise_resumo').select('*').single()
  if (error) throw error
  return data
}

const PRIORIDADE_SEVERIDADE: Record<string, number> = { vermelho: 0, amarelo: 1, verde: 2 }

export async function listarAlertas() {
  const { data, error } = await requireSupabase().from('vw_alertas').select('*')
  if (error) throw error
  return (data ?? []).sort(
    (a, b) =>
      (PRIORIDADE_SEVERIDADE[a.severidade ?? ''] ?? 9) -
      (PRIORIDADE_SEVERIDADE[b.severidade ?? ''] ?? 9),
  )
}

/** Ocupação + tendência (4 semanas vs. 4 anteriores) por turma. */
export async function listarOcupacaoTendencia() {
  const { data, error } = await requireSupabase()
    .from('vw_ocupacao_turma_tendencia')
    .select('*')
    .order('ocupacao_atual_pct', { ascending: false })
  if (error) throw error
  return data
}

export async function listarAnaliseModalidade() {
  const { data, error } = await requireSupabase()
    .from('vw_analise_modalidade')
    .select('*')
    .order('ocupacao_atual_pct', { ascending: false })
  if (error) throw error
  return data
}

export async function listarAnaliseProfessora() {
  const { data, error } = await requireSupabase()
    .from('vw_analise_professora')
    .select('*')
    .order('ocupacao_atual_pct', { ascending: false })
  if (error) throw error
  return data
}

/** Série semanal (ocupação, novos alunos, cancelamentos, presenças/faltas). */
export async function listarEvolucaoSemanal(semanas: number) {
  const { data, error } = await requireSupabase().rpc('fn_evolucao_semanal', {
    p_semanas: semanas,
  })
  if (error) throw error
  return data
}

// --- Inteligência de Clientes (destravada pela ficha 360°, C1) ---

export async function listarClientesRisco() {
  const { data, error } = await requireSupabase().from('vw_analise_clientes_risco').select('*')
  if (error) throw error
  return (data ?? []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

/** Matrícula ativa/inadimplente sem aula há `dias` (padrão 20, configurável na tela). */
export async function listarClientesSumidos(dias: number) {
  const { data, error } = await requireSupabase().rpc('fn_analise_clientes_sumidos', {
    p_dias: dias,
  })
  if (error) throw error
  return data
}

/** Dado financeiro (faturamento) — chamar só quando a função for gestão. */
export async function listarClientesRanking() {
  const { data, error } = await requireSupabase()
    .from('vw_analise_clientes_ranking')
    .select('*')
    .order('faturamento_centavos', { ascending: false })
    .limit(10)
  if (error) throw error
  return data
}

export async function listarPlanosNomes() {
  const { data, error } = await requireSupabase().from('planos').select('id, nome')
  if (error) throw error
  return data
}
