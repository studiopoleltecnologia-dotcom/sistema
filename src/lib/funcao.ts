import { useQuery } from '@tanstack/react-query'
import { requireSupabase } from './supabase'
import type { Enums } from './database.types'

export type FuncaoInterna = Enums<'funcao_interna'>

/**
 * Função da conta interna logada (gestao | secretaria | social).
 * É o que decide o menu e o que o painel mostra. A segurança de verdade
 * está na RLS (is_gestao no banco) — isto é só para não exibir à toa o
 * que o banco já recusaria.
 */
export function useMinhaFuncao() {
  return useQuery({
    queryKey: ['minha-funcao'],
    queryFn: async (): Promise<FuncaoInterna | null> => {
      const { data, error } = await requireSupabase().rpc('minha_funcao')
      if (error) throw error
      return data ?? null
    },
  })
}
