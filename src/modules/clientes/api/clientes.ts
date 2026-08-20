import { requireSupabase } from '../../../lib/supabase'
import type { ClienteInsert, ClienteUpdate, TipoInteracao } from '../types'

export async function listarClientes() {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .select('*')
    .order('criada_em', { ascending: false })
  if (error) throw error
  return data
}

export async function criarCliente(input: ClienteInsert) {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarCliente(id: string, patch: ClienteUpdate) {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listarSocias() {
  const { data, error } = await requireSupabase()
    .from('socias')
    .select('*')
    .order('nome')
  if (error) throw error
  return data
}

export async function listarInteracoes(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('interacoes_crm')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('criada_em', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Registra uma interação e, se foi contato real (WhatsApp/conversa),
 * atualiza a "última conversa" da cliente automaticamente — default
 * inteligente, um clique a menos (CLAUDE.md seção 4).
 */
export async function adicionarInteracao(input: {
  cliente_id: string
  tipo: TipoInteracao
  descricao: string
}) {
  const sb = requireSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('interacoes_crm')
    .insert({ ...input, socia_id: auth.user?.id ?? null })
    .select()
    .single()
  if (error) throw error

  if (input.tipo === 'whatsapp' || input.tipo === 'conversa') {
    const hoje = new Date().toISOString().slice(0, 10)
    const { error: upErr } = await sb
      .from('clientes')
      .update({ ultima_conversa: hoje })
      .eq('id', input.cliente_id)
    if (upErr) throw upErr
  }
  return data
}

// --- Ficha 360°: junta ao CRM a matrícula/créditos e a agenda do aluno ---

/** Matrículas atuais (ativa/inadimplente) do aluno, com saldo de créditos. */
export async function listarMatriculasDoCliente(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('vw_saldo_creditos')
    .select('*')
    .eq('cliente_id', clienteId)
    .in('status', ['ativa', 'inadimplente'])
    .order('data_fim')
  if (error) throw error
  return data
}

/**
 * "Aluno desde": data da primeira matrícula (qualquer status), base do tempo
 * de casa e dos marcos de fidelidade. null se nunca teve matrícula (ainda lead).
 */
export async function obterAlunoDesde(clienteId: string): Promise<string | null> {
  const { data, error } = await requireSupabase()
    .from('matriculas')
    .select('data_inicio')
    .eq('cliente_id', clienteId)
    .order('data_inicio', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.data_inicio ?? null
}

/** Nome dos produtos, para rotular a matrícula na ficha (vw_saldo_creditos só traz o id). */
export async function listarPlanosNomes() {
  const { data, error } = await requireSupabase().from('produtos').select('id, nome')
  if (error) throw error
  return data
}

/** Próximas aulas agendadas do aluno (de hoje em diante), com a turma e a professora. */
export async function listarProximasAulasDoCliente(clienteId: string) {
  const sb = requireSupabase()
  const hoje = new Date().toISOString().slice(0, 10)
  const [ags, nomes] = await Promise.all([
    sb
      .from('agendamentos')
      .select('id, data, canal, turma:turmas(dia_semana, horario, modalidade, professora_id)')
      .eq('cliente_id', clienteId)
      .eq('status', 'agendado')
      .gte('data', hoje)
      .order('data'),
    // nome da professora vem da view gestão/operação (sem dado financeiro)
    sb.from('vw_professoras_nomes').select('id, nome'),
  ])
  if (ags.error) throw ags.error
  if (nomes.error) throw nomes.error

  const nomeMap = new Map((nomes.data ?? []).map((p) => [p.id, p.nome]))
  return (ags.data ?? []).map((a) => ({
    id: a.id,
    data: a.data,
    canal: a.canal,
    turma: a.turma,
    professora: a.turma ? nomeMap.get(a.turma.professora_id) ?? null : null,
  }))
}

/**
 * Últimos pagamentos/cobranças do aluno. Dado financeiro — a RLS de
 * entradas_financeiras já recusa quem não é gestão; só chamar quando a
 * função for gestão evita pedir uma lista que sempre volta vazia.
 */
export async function listarPagamentosDoCliente(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('entradas_financeiras')
    .select('id, descricao, valor_centavos, categoria, status, data_competencia, data_caixa')
    .eq('cliente_id', clienteId)
    .order('data_competencia', { ascending: false })
    .limit(10)
  if (error) throw error
  return data
}

/** Se o aluno já criou login no portal (contas_aluna) — indicador simples. */
export async function verificarAcessoPortal(clienteId: string) {
  const { data, error } = await requireSupabase()
    .from('contas_aluna')
    .select('criada_em')
    .eq('cliente_id', clienteId)
    .maybeSingle()
  if (error) throw error
  return data
}
