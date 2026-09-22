import { NavLink, Outlet } from 'react-router-dom'
import {
  CalendarCheck,
  CalendarDays,
  CreditCard,
  House,
  LogOut,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../components/ui/cn'
import { supabase } from '../../lib/supabase'
import { useMeuCliente } from './hooks/usePortalAluna'

type Item = {
  to: string
  /** Rótulo da coluna lateral (desktop) — há espaço para o nome inteiro. */
  label: string
  /** Rótulo da barra inferior (celular) — 1/5 de 320px não cabe "Aulas agendadas". */
  curto: string
  icone: LucideIcon
}

const ITENS: Item[] = [
  { to: '', label: 'Início', curto: 'Início', icone: House },
  { to: 'agenda', label: 'Agenda', curto: 'Agenda', icone: CalendarDays },
  { to: 'aulas', label: 'Aulas agendadas', curto: 'Agendadas', icone: CalendarCheck },
  { to: 'meu-plano', label: 'Meu plano', curto: 'Meu plano', icone: CreditCard },
  { to: 'perfil', label: 'Perfil', curto: 'Perfil', icone: UserRound },
]

/**
 * Casca do Portal do Aluno.
 *
 * Celular e tablet: barra inferior com as cinco áreas — é onde o polegar
 * está. Desktop (lg+): coluna lateral fixa, no mesmo ameixa-escuro do
 * sistema da equipe, e o conteúdo ganha a largura da tela. Antes o
 * desktop era o layout do celular centralizado em 448px, com uma barra
 * inferior atravessando um monitor inteiro.
 *
 * "Planos" (o catálogo para contratar) não está na barra: é uma tarefa
 * rara, e cabe melhor como caminho a partir de "Meu plano" e do Início.
 * No desktop, onde espaço não falta, ele aparece como item secundário.
 */
export function PortalLayout() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <MenuLateral />

      <main className="pb-24 lg:pb-10 lg:pl-60">
        <div className="mx-auto w-full max-w-md px-4 pt-6 sm:max-w-2xl sm:px-6 lg:max-w-6xl lg:px-10 lg:pt-10">
          <Outlet />
        </div>
      </main>

      <BarraInferior />
    </div>
  )
}

function BarraInferior() {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-2xl pb-[env(safe-area-inset-bottom)]">
        {ITENS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === ''}
            className={({ isActive }) =>
              cn(
                'flex min-w-0 flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium transition',
                isActive ? 'text-brand-700' : 'text-neutral-400 hover:text-neutral-600',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icone className="size-5" strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="truncate">{item.curto}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function MenuLateral() {
  const { data: cliente } = useMeuCliente()

  const itemCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition',
      'outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
      isActive
        ? 'bg-brand-600 font-semibold text-white shadow-sm'
        : 'text-brand-200 hover:bg-white/10 hover:text-white',
    )

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-brand-900 px-3 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-2 px-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white font-display text-sm font-bold text-brand-800">
          L
        </span>
        <span className="truncate font-display text-sm font-bold tracking-wide text-white">
          STUDIO POLE L
        </span>
      </div>

      <nav aria-label="Navegação principal" className="flex flex-col gap-0.5">
        {ITENS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === ''} className={itemCls}>
            <item.icone className="size-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 border-t border-white/10 pt-4">
        <NavLink to="planos" className={itemCls}>
          <Sparkles className="size-4 shrink-0" />
          Planos e aulas avulsas
        </NavLink>
      </div>

      <div className="mt-auto border-t border-white/10 px-3 pt-4">
        {cliente?.nome && (
          <p className="truncate text-sm font-semibold text-white" title={cliente.nome}>
            {cliente.nome}
          </p>
        )}
        {cliente?.email && <p className="truncate text-xs text-brand-300">{cliente.email}</p>}
        <button
          onClick={() => supabase?.auth.signOut()}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-300 transition hover:text-white"
        >
          <LogOut className="size-3.5" />
          Sair
        </button>
      </div>
    </aside>
  )
}

