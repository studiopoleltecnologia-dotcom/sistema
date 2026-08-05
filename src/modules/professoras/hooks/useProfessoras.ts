import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '../../../lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '../../../lib/database.types'

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

export function useAtualizarProfessora() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'professoras'> }) => {
      const { data, error } = await requireSupabase()
        .from('professoras')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['professoras'] })
      qc.invalidateQueries({ queryKey: ['pagamento-professoras'] })
    },
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

// O lançamento da folha no Financeiro deixou de ser manual: a aprovação do
// fechamento dispara o trigger sync_folha_financeiro (migration
// 20260724170000), que cria a saída "Professoras" vencendo dia 15 do mês
// seguinte. Os hooks manuais (useLancarPagamento/usePagamentosLancados) foram
// removidos por isso.
