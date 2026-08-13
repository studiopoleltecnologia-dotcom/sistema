import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Casca própria da página de evento, fora do Layout do sistema.
 *
 * Quem confere as inscrições no WhatsApp recebe o link direto e não tem o
 * que fazer no resto do ERP — o menu ao lado seria só ruído e convite a
 * clicar. Traz o botão Sair porque, sem a barra lateral, não haveria outro
 * jeito de encerrar a sessão.
 *
 * ⚠️ Isto é enquadramento, não permissão. Some com o menu, não com o
 * acesso: uma conta `secretaria` que digite /clientes continua entrando,
 * porque a RLS dessas tabelas responde a `is_operacional()` e `is_socia()`,
 * não à ausência de um link na tela.
 */
export function EventoShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex h-14 items-center justify-between border-b border-neutral-200/80 bg-white px-6">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-brand-600 font-display text-sm font-bold text-white">
            L
          </span>
          <span className="font-display text-sm font-bold tracking-wide text-neutral-900">
            STUDIO POLE L
          </span>
        </div>
        <button
          onClick={() => supabase?.auth.signOut()}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
        >
          <LogOut className="size-4" strokeWidth={2} />
          Sair
        </button>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
