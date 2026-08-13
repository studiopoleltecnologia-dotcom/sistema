import type { Tables } from '../../lib/database.types'

export type InscricaoEvento = Tables<'inscricoes_evento'>

/** Slug da edição corrente. A tabela serve às próximas sem migration nova. */
export const EVENTO_PICNIC = 'picnic-day-2026-08-30'

export type KpisInscricoes = {
  total: number
  confirmados: number
  pendentes: number
  /**
   * Acompanhantes é CONTAGEM, não soma: a constraint da tabela permite no
   * máximo um acompanhante por inscrição (individual exige null, dupla exige
   * um nome). Não existe campo de quantidade.
   */
  acompanhantes: number
  pessoasEsperadas: number
  porTipo: { individual: number; dupla: number }
}

export function calcularKpis(inscricoes: InscricaoEvento[]): KpisInscricoes {
  const confirmados = inscricoes.filter((i) => i.pago).length
  const dupla = inscricoes.filter((i) => i.tipo_ingresso === 'dupla').length
  return {
    total: inscricoes.length,
    confirmados,
    pendentes: inscricoes.length - confirmados,
    acompanhantes: dupla,
    pessoasEsperadas: inscricoes.length + dupla,
    porTipo: { individual: inscricoes.length - dupla, dupla },
  }
}
