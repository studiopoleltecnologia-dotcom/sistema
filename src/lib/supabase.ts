import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Cliente Supabase. Apenas a anon key entra no front — a segurança real
 * dos dados é garantida pelo RLS no banco (ver CLAUDE.md, seção 3).
 * `null` quando o ambiente ainda não foi configurado (.env ausente).
 */
export const supabase: SupabaseClient<Database> | null =
  url && anonKey ? createClient<Database>(url, anonKey) : null

/** Cliente para uso dentro das rotas protegidas (AuthGate já garantiu env). */
export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) throw new Error('Supabase não configurado (.env ausente)')
  return supabase
}
