import { diaDaSemana, jaComecou, somarDias } from './datas'
import { formatoDoPlano, planoVigente } from './plano'
import type { MotivoCancelamentoAula } from '../agenda/types'
import type {
  Agendamento,
  AulaCancelada,
  GradePublica,
  LoteCredito,
  MeuPlano,
  PosicaoFila,
  TurmaFixa,
  VagasTurma,
} from './types'

/**
 * Uma aula = uma turma da grade numa data. É a unidade que o aluno
 * procura ("quinta, 19h30, Jazz Funk"), e o que a Agenda, o Início e as
 * Aulas agendadas mostram.
 *
 * O ESTADO de cada aula é um espelho, para exibição, do que o banco vai
 * decidir: quem autoriza de verdade é `agendar_aula()`. O espelho existe
 * para o aluno não descobrir a regra levando um erro — ver "Abre em 05/10"
 * antes de tocar é melhor que tocar e ler "este plano agenda com até 14
 * dias de antecedência". Se os dois divergirem, vale o banco e a mensagem
 * dele aparece na tela.
 */

export type MotivoForaDoPlano = 'sem_plano' | 'so_turma_fixa' | 'sem_credito' | 'pagamento'

export type EstadoAula =
  | { tipo: 'cancelada'; motivo: MotivoCancelamentoAula; mensagem: string | null }
  | { tipo: 'turma_fixa' }
  | { tipo: 'agendada'; agendamentoId: string; canal: string }
  | { tipo: 'encerrada' }
  | { tipo: 'vaga_segurada'; filaId: string }
  | { tipo: 'na_fila'; filaId: string; posicao: number }
  | { tipo: 'lotada'; podeEntrarNaFila: boolean }
  | { tipo: 'fora_do_plano'; motivo: MotivoForaDoPlano }
  | { tipo: 'abre_em'; data: string }
  | { tipo: 'pausado'; ate: string }
  | { tipo: 'limite'; max: number }
  | { tipo: 'disponivel'; ultimas: boolean }

export type Aula = {
  chave: string
  turmaId: string
  data: string
  horario: string
  duracao: number
  modalidade: string
  modalidadeId: string | null
  professora: string
  sala: string | null
  cor: string | null
  categoria: string | null
  capacidade: number
  vagas: number
  estado: EstadoAula
}

/** Contexto do aluno que decide o estado de cada aula. */
export type ContextoAluno = {
  hoje: string
  agora: Date
  planos: MeuPlano[]
  lotes: LoteCredito[]
  reservas: Agendamento[]
  fila: PosicaoFila[]
  turmasFixas: TurmaFixa[]
  suspensaoAte: string | null
  /** Aulas que o estúdio cancelou (daqui para frente, sem as reabertas). */
  canceladas: AulaCancelada[]
  /** Agendamentos do aluno que o estúdio cancelou junto com a aula. */
  canceladosPeloEstudio: Agendamento[]
}

/** Mesmo limiar para "últimas vagas" em toda tela. */
const ULTIMAS_VAGAS = 2

/** Padrão do banco quando o produto não define antecedência (agendar_aula). */
const ANTECEDENCIA_PADRAO = 14

/**
 * Qual matrícula pagaria uma aula nesta data — o mesmo critério de
 * `agendar_aula()`: matrícula ativa com crédito que ainda vale na data,
 * escolhendo o lote que vence primeiro.
 */
export function planoQuePaga(data: string, ctx: ContextoAluno): MeuPlano | null {
  let melhor: { plano: MeuPlano; validade: string } | null = null
  for (const l of ctx.lotes) {
    if ((l.saldo ?? 0) <= 0 || !l.validade || l.validade < data) continue
    const plano = ctx.planos.find((p) => p.matricula_id === l.matricula_id)
    if (!plano || plano.status !== 'ativa') continue
    if (!melhor || l.validade < melhor.validade) melhor = { plano, validade: l.validade }
  }
  return melhor?.plano ?? null
}

function motivoSemCredito(ctx: ContextoAluno): MotivoForaDoPlano {
  const vigentes = ctx.planos.filter((p) => planoVigente(p, ctx.hoje))
  if (vigentes.some((p) => p.status === 'inadimplente')) return 'pagamento'
  const temCreditos = vigentes.some((p) => formatoDoPlano(p) !== 'turma_fixa' && p.gera_credito)
  if (temCreditos) return 'sem_credito'
  if (vigentes.some((p) => formatoDoPlano(p) === 'turma_fixa')) return 'so_turma_fixa'
  return 'sem_plano'
}

export function canceladaNaData(turmaId: string, data: string, ctx: ContextoAluno): AulaCancelada | null {
  return ctx.canceladas.find((c) => c.turma_id === turmaId && c.data === data) ?? null
}

/** O assento fixo vale nesta data? (vínculo vigente e plano não encerrado) */
export function temTurmaFixaNaData(turmaId: string, data: string, ctx: ContextoAluno): boolean {
  return ctx.turmasFixas.some((t) => {
    if (t.turma_id !== turmaId || !t.inicio || t.inicio > data) return false
    if (t.fim && t.fim < data) return false
    const plano = ctx.planos.find((p) => p.matricula_id === t.matricula_id)
    if (!plano || plano.status === 'cancelada') return false
    return !plano.cancelamento_efetivo_em || plano.cancelamento_efetivo_em >= data
  })
}

function reservasFuturas(ctx: ContextoAluno) {
  return ctx.reservas.filter((r) => r.data >= ctx.hoje).length
}

function estadoDaAula(
  t: GradePublica,
  data: string,
  vagas: number,
  ctx: ContextoAluno,
): EstadoAula {
  const turmaId = t.turma_id!
  // Cancelada pelo estúdio vem antes de tudo: é a informação que muda o
  // dia do aluno, inclusive de quem tinha turma fixa ou agendamento.
  const cancelada = canceladaNaData(turmaId, data, ctx)
  if (cancelada) return { tipo: 'cancelada', motivo: cancelada.motivo, mensagem: cancelada.mensagem }

  // Aula que já começou não oferece nada — nem para quem é da turma: "Sua
  // turma fixa" às 20h numa aula das 9h faria parecer que ainda dá tempo.
  if (jaComecou(data, t.horario, ctx.agora)) return { tipo: 'encerrada' }

  if (temTurmaFixaNaData(turmaId, data, ctx)) return { tipo: 'turma_fixa' }

  const reserva = ctx.reservas.find((r) => r.turma_id === turmaId && r.data === data)
  if (reserva) return { tipo: 'agendada', agendamentoId: reserva.id, canal: reserva.canal }

  const fila = ctx.fila.find((f) => f.turma_id === turmaId && f.data === data)
  if (fila?.status === 'notificada') return { tipo: 'vaga_segurada', filaId: fila.id! }
  if (fila) return { tipo: 'na_fila', filaId: fila.id!, posicao: fila.posicao ?? 0 }

  const plano = planoQuePaga(data, ctx)
  if (!plano) {
    // Lotada continua sendo a informação mais útil para quem tem plano de
    // turma fixa olhando outra aula; para quem não tem plano nenhum, o que
    // importa é o motivo.
    return { tipo: 'fora_do_plano', motivo: motivoSemCredito(ctx) }
  }

  const janela = plano.dias_antecedencia_agendamento ?? ANTECEDENCIA_PADRAO
  if (data > somarDias(ctx.hoje, janela)) {
    return { tipo: 'abre_em', data: somarDias(data, -janela) }
  }

  if (ctx.suspensaoAte && data > ctx.hoje) return { tipo: 'pausado', ate: ctx.suspensaoAte }

  if (vagas <= 0) return { tipo: 'lotada', podeEntrarNaFila: true }

  const max = plano.max_agendamentos_simultaneos
  if (max !== null && reservasFuturas(ctx) >= max) return { tipo: 'limite', max }

  return { tipo: 'disponivel', ultimas: vagas <= ULTIMAS_VAGAS }
}

/** Todas as aulas de uma lista de dias, já com estado. */
export function montarAulas(
  dias: string[],
  grade: GradePublica[],
  vagas: VagasTurma[],
  ctx: ContextoAluno,
): Aula[] {
  const ocupadasPor = new Map<string, number>()
  for (const v of vagas) {
    if (v.turma_id && v.data) ocupadasPor.set(`${v.turma_id}|${v.data}`, v.ocupadas ?? 0)
  }

  const aulas: Aula[] = []
  for (const data of dias) {
    const dow = diaDaSemana(data)
    for (const t of grade) {
      if (t.dia_semana !== dow || !t.turma_id) continue
      const chave = `${t.turma_id}|${data}`
      const capacidade = t.capacidade ?? 0
      const livres = Math.max(capacidade - (ocupadasPor.get(chave) ?? 0), 0)
      aulas.push({
        chave,
        turmaId: t.turma_id,
        data,
        horario: t.horario ?? '',
        duracao: t.duracao_minutos ?? 60,
        modalidade: t.modalidade ?? 'Aula',
        modalidadeId: t.modalidade_id,
        professora: t.professora_nome ?? '',
        sala: t.sala_nome,
        cor: t.categoria_cor,
        categoria: t.categoria_nome,
        capacidade,
        vagas: livres,
        estado: estadoDaAula(t, data, livres, ctx),
      })
    }
  }
  return aulas.sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario))
}

// ------------------------------------------------------------
// "Minhas aulas": o que está marcado na agenda do aluno
// ------------------------------------------------------------

export type MinhaAula = {
  chave: string
  data: string
  horario: string
  modalidade: string
  professora: string
  sala: string | null
  cor: string | null
  /** Turma fixa não tem agendamento: a vaga já é do aluno. */
  origem: 'agendamento' | 'turma_fixa'
  agendamentoId: string | null
  canal: string | null
  matriculaId: string | null
  turmaId: string
}

/**
 * Agendamentos + ocorrências de turma fixa nos próximos `dias`, em ordem.
 * Para quem tem turma fixa, "minhas aulas da semana" inclui a turma dela —
 * mostrar só os agendamentos daria uma semana vazia para quem mais treina.
 */
export function minhasProximasAulas(
  grade: GradePublica[],
  ctx: ContextoAluno,
  dias = 14,
): MinhaAula[] {
  const porTurma = new Map(grade.filter((t) => t.turma_id).map((t) => [t.turma_id!, t]))
  const itens: MinhaAula[] = []

  for (const r of ctx.reservas) {
    const t = porTurma.get(r.turma_id)
    if (!t || r.data < ctx.hoje || jaComecou(r.data, t.horario, ctx.agora)) continue
    itens.push({
      chave: `a-${r.id}`,
      data: r.data,
      horario: t.horario ?? '',
      modalidade: t.modalidade ?? 'Aula',
      professora: t.professora_nome ?? '',
      sala: t.sala_nome,
      cor: t.categoria_cor,
      origem: 'agendamento',
      agendamentoId: r.id,
      canal: r.canal,
      matriculaId: r.matricula_id,
      turmaId: r.turma_id,
    })
  }

  for (let i = 0; i < dias; i++) {
    const data = somarDias(ctx.hoje, i)
    const dow = diaDaSemana(data)
    for (const tf of ctx.turmasFixas) {
      if (tf.dia_semana !== dow || !tf.turma_id) continue
      if (!temTurmaFixaNaData(tf.turma_id, data, ctx)) continue
      if (canceladaNaData(tf.turma_id, data, ctx)) continue
      if (jaComecou(data, tf.horario, ctx.agora)) continue
      if (itens.some((x) => x.turmaId === tf.turma_id && x.data === data)) continue
      const t = porTurma.get(tf.turma_id)
      itens.push({
        chave: `f-${tf.vinculo_id}-${data}`,
        data,
        horario: tf.horario ?? '',
        modalidade: tf.modalidade ?? 'Aula',
        professora: tf.professora ?? '',
        sala: tf.sala,
        cor: t?.categoria_cor ?? null,
        origem: 'turma_fixa',
        agendamentoId: null,
        canal: null,
        matriculaId: tf.matricula_id,
        turmaId: tf.turma_id,
      })
    }
  }

  return itens.sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario))
}

// ------------------------------------------------------------
// Minhas aulas que o estúdio cancelou
// ------------------------------------------------------------

export type MinhaAulaCancelada = {
  chave: string
  data: string
  horario: string
  modalidade: string
  professora: string
  cor: string | null
  motivo: MotivoCancelamentoAula
  mensagem: string | null
  /** O que aconteceu com o aluno: crédito devolvido ou reposição de turma fixa. */
  origem: 'agendamento' | 'turma_fixa'
  reposicao: boolean
}

/**
 * Aulas do aluno canceladas pelo estúdio nos próximos `dias`: as que ele
 * tinha agendado (o crédito voltou) e as da turma fixa (reposição, se a
 * equipe deu). Sem isto a aula só sumiria da lista — e a pessoa chegaria
 * no estúdio fechado.
 */
export function minhasAulasCanceladas(
  grade: GradePublica[],
  ctx: ContextoAluno,
  dias = 14,
): MinhaAulaCancelada[] {
  const porTurma = new Map(grade.filter((t) => t.turma_id).map((t) => [t.turma_id!, t]))
  const limite = somarDias(ctx.hoje, dias)
  const itens: MinhaAulaCancelada[] = []

  for (const c of ctx.canceladas) {
    if (c.data < ctx.hoje || c.data > limite) continue
    const t = porTurma.get(c.turma_id)
    if (!t) continue
    const agendada = ctx.canceladosPeloEstudio.some((a) => a.turma_id === c.turma_id && a.data === c.data)
    const fixa = temTurmaFixaNaData(c.turma_id, c.data, ctx)
    if (!agendada && !fixa) continue
    itens.push({
      chave: c.id,
      data: c.data,
      horario: t.horario ?? '',
      modalidade: t.modalidade ?? 'Aula',
      professora: t.professora_nome ?? '',
      cor: t.categoria_cor,
      motivo: c.motivo,
      mensagem: c.mensagem,
      origem: fixa ? 'turma_fixa' : 'agendamento',
      reposicao: fixa && c.repor_turma_fixa,
    })
  }
  return itens.sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario))
}

// ------------------------------------------------------------
// Mensagens do banco em linguagem de aluno
// ------------------------------------------------------------

/**
 * As RPCs devolvem o motivo em português técnico ("turma lotada (8 vagas,
 * 2 reservada(s) por mensalidade de turma fixa)"). O que o aluno precisa
 * é saber o que fazer — então os casos conhecidos viram frase de gente e o
 * resto passa como veio, que ainda é melhor que um erro genérico.
 */
export function mensagemDoBanco(e: unknown, padrao: string): string {
  const texto = (e as { message?: string } | null)?.message ?? ''
  if (!texto) return padrao
  if (texto.includes('cancelada pelo estúdio')) return 'Essa aula foi cancelada pelo estúdio.'
  if (texto.includes('turma lotada')) return 'Essa aula acabou de lotar. Você pode entrar na lista de espera.'
  if (texto.includes('sem créditos')) return 'Você não tem créditos válidos para essa data.'
  if (texto.includes('pagamento em aberto')) return 'Seu plano está com pagamento em aberto. Regularize na recepção para voltar a agendar.'
  if (texto.includes('vaga fixa')) return 'Você já tem vaga fixa nessa turma — não precisa agendar.'
  if (texto.includes('Turma Fixa dá acesso só')) return 'Seu plano de turma fixa não inclui essa aula. Para fazê-la, é preciso uma aula avulsa ou crédito extra.'
  if (texto.includes('duplicate key') || texto.includes('já existe')) return 'Você já está nessa aula.'
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
