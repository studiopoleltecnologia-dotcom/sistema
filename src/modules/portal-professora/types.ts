import type { Tables } from '../../lib/database.types'

export type ContaProfessora = Tables<'contas_professora'>
export type Professora = Tables<'professoras'>
export type Turma = Tables<'turmas'>
export type AlunaDaAula = Tables<'vw_alunas_da_aula'>
export type PagamentoProfessora = Tables<'vw_pagamento_professoras'>

export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

/** "19:00:00" → "19:00" (mesma convenção do módulo Agenda). */
export function fmtHora(horario: string): string {
  return horario.slice(0, 5)
}

export function fmtDinheiro(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Datas em ISO local. new Date('2026-07-21') seria interpretado como UTC e
// no fuso do Brasil voltaria um dia — por isso tudo aqui monta a data pelos
// componentes, nunca pela string inteira.

export function hojeISO(): string {
  return paraISO(new Date())
}

export function paraISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function deISO(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

export function somarDias(iso: string, dias: number): string {
  const d = deISO(iso)
  d.setDate(d.getDate() + dias)
  return paraISO(d)
}

export function diaSemanaDe(iso: string): number {
  return deISO(iso).getDay()
}

export function fmtDataCurta(iso: string): string {
  const d = deISO(iso)
  return `${DIAS_CURTOS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(
    d.getMonth() + 1,
  ).padStart(2, '0')}`
}

/** "2026-07-01" (mês da view de pagamento) → "julho/2026" */
export function fmtMes(iso: string): string {
  const d = deISO(iso)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}
