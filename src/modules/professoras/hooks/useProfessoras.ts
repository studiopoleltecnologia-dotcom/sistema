import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '../../../lib/supabase'
import type { Tables, TablesInsert } from '../../../lib/database.types'

export type Professora = Tables<'professoras'>
export type PagamentoProfessora = Tables<'vw_pagamento_professoras'>

export function useProfessoras() {
  return useQuery({
    queryKey: ['professoras'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('professoras')
        .select('*')
        .eq('ativa', true)
        .order('nome')
      if (error) throw error
      return data
    },
  })
}

/**
 * Quais professoras já criaram o acesso ao portal delas. O vínculo nasce
 * em handle_new_user(), casando o e-mail do signup com professoras.email —
 * então "sem e-mail cadastrado" = "não consegue criar acesso".
 */
export function useContasProfessora() {
  return useQuery({
    queryKey: ['contas-professora'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('contas_professora')
        .select('professora_id')
      if (error) throw error
      return new Set((data ?? []).map((c) => c.professora_id))
    },
  })
}

export function usePagamentoProfessoras(mes: string) {
  return useQuery({
    queryKey: ['pagamento-professoras', mes],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('vw_pagamento_professoras')
        .select('*')
        .eq('mes', `${mes}-01`)
      if (error) throw error
      return data
    },
  })
}

export function useCriarProfessora() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TablesInsert<'professoras'>) => {
      const { data, error } = await requireSupabase()
        .from('professoras')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professoras'] }),
  })
}

export function useDesativarProfessora() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase()
        .from('professoras')
        .update({ ativa: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professoras'] }),
  })
}

/**
 * Descrições já lançadas como saída "Professoras" no mês (evita pagar a
 * mesma professora duas vezes — a view de pagamento é recomputada ao vivo
 * e não tem flag de "já pago").
 */
export function usePagamentosLancados(mes: string) {
  return useQuery({
    queryKey: ['pagamentos-professoras-lancados', mes],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('saidas_financeiras')
        .select('descricao, categoria:categorias_saida(nome)')
        .ilike('descricao', `%(${mes})`)
      if (error) throw error
      return new Set(
        (data ?? [])
          .filter((d) => d.categoria?.nome === 'Professoras')
          .map((d) => d.descricao),
      )
    },
  })
}

/** Lança o pagamento do mês como saída na categoria "Professoras". */
export function useLancarPagamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { professora: string; mes: string; total_centavos: number }) => {
      const sb = requireSupabase()
      const { data: cat, error: catErr } = await sb
        .from('categorias_saida')
        .select('id')
        .eq('nome', 'Professoras')
        .single()
      if (catErr) throw catErr
      const { error } = await sb.from('saidas_financeiras').insert({
        descricao: `Pagamento ${args.professora} (${args.mes})`,
        valor_centavos: args.total_centavos,
        categoria_id: cat.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saidas'] })
      qc.invalidateQueries({ queryKey: ['saldo-caixa'] })
      qc.invalidateQueries({ queryKey: ['pagamentos-professoras-lancados'] })
    },
  })
}
