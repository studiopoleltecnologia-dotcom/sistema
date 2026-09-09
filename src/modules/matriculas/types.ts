import type { Tables } from '../../lib/database.types'
import type { Produto } from '../produtos/types'

/** Uma linha de `vw_saldo_creditos` — a assinatura com saldo e ciclo. */
export type SaldoMatricula = Tables<'vw_saldo_creditos'>
/** Um assento de turma fixa, com a turma já resolvida. */
export type MatriculaTurma = Tables<'vw_matricula_turmas'>

export type StatusMatricula = 'ativa' | 'pausada' | 'cancelada' | 'inadimplente'

export const DIAS_SEMANA = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
] as const

/** "19:00:00" → "19h" / "19:30:00" → "19h30" */
export function fmtHoraCurta(horario: string | null): string {
  if (!horario) return ''
  const [h, m] = horario.split(':')
  return m === '00' ? `${h}h` : `${h}h${m}`
}

/**
 * "Calistenia · Segunda · 09h · Prof. Ana" — a frase que responde
 * "qual turma essa pessoa contratou" sem deixar dúvida. É a mesma
 * composição em toda tela (matrículas, ficha do aluno, seletor de
 * turma), de propósito: a equipe reconhece o padrão em vez de reler.
 */
export function descreverTurma(
  t: Pick<MatriculaTurma, 'modalidade' | 'dia_semana' | 'horario' | 'professora'>,
  opcoes: { comProfessora?: boolean } = {},
): string {
  const partes = [
    t.modalidade ?? '—',
    t.dia_semana !== null ? DIAS_SEMANA[t.dia_semana] : '—',
    fmtHoraCurta(t.horario),
  ]
  if (opcoes.comProfessora !== false && t.professora) partes.push(`Prof. ${t.professora}`)
  return partes.filter(Boolean).join(' · ')
}

/**
 * A matrícula com tudo que a tela precisa numa estrutura só: a
 * assinatura, o produto contratado e os assentos de turma fixa.
 *
 * Montada no cliente a partir de três consultas em vez de uma view
 * `vw_matriculas_completa`. É o mesmo motivo pelo qual a Agenda costura
 * turma + professora + categoria à mão: um join aninhado no PostgREST
 * atravessaria RLS diferentes e devolveria a matrícula sem o produto
 * (ou sem a turma) em silêncio, o que é pior que uma consulta a mais.
 */
export type MatriculaCompleta = {
  saldo: SaldoMatricula
  produto: Produto | null
  clienteNome: string
  clienteId: string
  /** Assentos vigentes hoje. */
  turmas: MatriculaTurma[]
  /** Assentos que já começam agendados para a próxima renovação (6.5). */
  turmasFuturas: MatriculaTurma[]
  /** Assentos encerrados — histórico de troca. */
  turmasEncerradas: MatriculaTurma[]
  /** `turmas_fixas > 0` no produto contratado. */
  ehTurmaFixa: boolean
}

/** Quantos assentos ainda cabem nesta matrícula (regulamento 6.3). */
export function assentosDisponiveis(m: MatriculaCompleta): number {
  if (!m.ehTurmaFixa || !m.produto) return 0
  return m.produto.turmas_fixas - (m.turmas.length + m.turmasFuturas.length)
}
