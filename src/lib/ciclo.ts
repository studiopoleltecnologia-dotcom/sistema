/**
 * Como o ciclo de um plano é dito em português.
 *
 * Desde 22/09/2026 (A17) a assinatura renova por mês civil, sempre no
 * mesmo dia do mês — `periodicidade_meses`, que é como o Asaas cobra.
 * Compra única continua medida em dias (`periodicidade_dias`). As telas
 * não comparam `periodicidade_dias === 30` para decidir se é "mensal":
 * passam por aqui.
 */
type ComCiclo = { periodicidade_meses: number | null; periodicidade_dias: number }

/** "por mês", "a cada 2 meses", "a cada 40 dias". */
export function porCiclo(p: ComCiclo): string {
  if (p.periodicidade_meses === 1) return 'por mês'
  if (p.periodicidade_meses) return `a cada ${p.periodicidade_meses} meses`
  return `a cada ${p.periodicidade_dias} dias`
}

/** "/mês", "/2 meses", "/40 dias" — o sufixo do preço. */
export function sufixoCiclo(p: ComCiclo): string {
  if (p.periodicidade_meses === 1) return '/mês'
  if (p.periodicidade_meses) return `/${p.periodicidade_meses} meses`
  return `/${p.periodicidade_dias} dias`
}

/** "todo mês, sempre no mesmo dia" — o complemento de "Cobrança automática". */
export function cadaCiclo(p: ComCiclo): string {
  if (p.periodicidade_meses === 1) return 'todo mês, sempre no mesmo dia'
  if (p.periodicidade_meses) return `a cada ${p.periodicidade_meses} meses, sempre no mesmo dia`
  return `a cada ${p.periodicidade_dias} dias`
}

/**
 * "no dia 17" — quando o plano renova. Dia 29 a 31 ganha a ressalva,
 * porque em mês curto a renovação cai no último dia (regra do Asaas).
 */
export function diaDaRenovacao(dia: number): string {
  return dia > 28 ? `no dia ${dia} (ou no último dia, em mês mais curto)` : `no dia ${dia}`
}
