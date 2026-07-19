/** Dinheiro sempre em centavos (inteiro) no banco — CLAUDE.md seção 7. */

export function fmtCentavos(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '—'
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/** "1.234,56" | "1234,56" | "1234.56" | "1234" → centavos (null se inválido). */
export function parseCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, '')
  if (!limpo) return null
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo
  const valor = Number(normalizado)
  if (!Number.isFinite(valor) || valor <= 0) return null
  return Math.round(valor * 100)
}
