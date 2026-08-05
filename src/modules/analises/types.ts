import type { Database, Tables } from '../../lib/database.types'

export type Alerta = Tables<'vw_alertas'>
export type OcupacaoTendencia = Tables<'vw_ocupacao_turma_tendencia'>
export type AnaliseModalidade = Tables<'vw_analise_modalidade'>
export type AnaliseProfessora = Tables<'vw_analise_professora'>
export type AnaliseResumo = Tables<'vw_analise_resumo'>
export type ClienteRisco = Tables<'vw_analise_clientes_risco'>
export type ClienteRanking = Tables<'vw_analise_clientes_ranking'>
export type ClienteSumido =
  Database['public']['Functions']['fn_analise_clientes_sumidos']['Returns'][number]

export type Prioridade = 'alta' | 'media' | 'baixa'

export type Severidade = 'verde' | 'amarelo' | 'vermelho'
export type Tendencia = 'crescendo' | 'caindo' | 'estavel' | 'insuficiente'

export const DIAS_SEMANA = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
] as const

/** "19:00:00" → "19:00" */
export function fmtHora(horario: string): string {
  return horario.slice(0, 5)
}

export const SEVERIDADE_TOM: Record<Severidade, { chip: string; barra: string; texto: string }> = {
  vermelho: { chip: 'bg-danger-50 text-danger-700', barra: 'bg-danger-500', texto: 'text-danger-700' },
  amarelo: { chip: 'bg-warning-50 text-warning-700', barra: 'bg-warning-500', texto: 'text-warning-700' },
  verde: { chip: 'bg-success-50 text-success-700', barra: 'bg-success-500', texto: 'text-success-700' },
}

export function labelTendencia(t: string | null): string {
  if (t === 'crescendo') return 'Crescendo'
  if (t === 'caindo') return 'Caindo'
  if (t === 'estavel') return 'Estável'
  return 'Dados insuficientes'
}

export const PRIORIDADE_TOM: Record<Prioridade, { chip: string; label: string }> = {
  alta: { chip: 'bg-danger-50 text-danger-700', label: 'Alta' },
  media: { chip: 'bg-warning-50 text-warning-700', label: 'Média' },
  baixa: { chip: 'bg-neutral-100 text-neutral-600', label: 'Baixa' },
}

/** wa.me a partir do telefone salvo (BR: completa o DDI 55 se faltar). */
export function linkWhatsapp(telefone: string | null): string | null {
  if (!telefone) return null
  const digitos = telefone.replace(/\D/g, '')
  if (!digitos) return null
  const comDdi = digitos.length <= 11 ? `55${digitos}` : digitos
  return `https://wa.me/${comDdi}`
}
