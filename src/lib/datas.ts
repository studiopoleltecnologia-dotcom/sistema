/** Datas em ISO no banco (CLAUDE.md seção 7); exibição em pt-BR. */

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Dias corridos desde a data (0 = hoje); null se não informada. */
export function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null
  const data = new Date(iso.slice(0, 10) + 'T00:00:00')
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.round((hoje.getTime() - data.getTime()) / 86_400_000)
}
