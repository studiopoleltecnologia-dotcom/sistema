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
    },
  })
}
