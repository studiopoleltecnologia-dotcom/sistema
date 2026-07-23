import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  CheckSquare,
  Coins,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MessageCircleHeart,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { flags } from '../lib/flags'
import { useMinhaFuncao, type FuncaoInterna } from '../lib/funcao'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  flag?: keyof typeof flags
  // Funções que veem o item. Ausente = todas as contas internas.
  funcoes?: FuncaoInterna[]
}

// Financeiro e Investimentos (dinheiro) e Professoras (mostra o valor
// pago a cada uma) são gestão-only. Conteúdo é de gestão + social. O
// resto é operação, que gestão e secretária compartilham. A trava real
// está na RLS; aqui é só o menu.
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clientes', label: 'Clientes', icon: Users, funcoes: ['gestao', 'secretaria'] },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, funcoes: ['gestao'] },
  { to: '/followup', label: 'Follow-up', icon: MessageCircleHeart, funcoes: ['gestao', 'secretaria'] },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, funcoes: ['gestao', 'secretaria'] },
  { to: '/planos', label: 'Planos', icon: CreditCard, funcoes: ['gestao', 'secretaria'] },
  { to: '/professoras', label: 'Professoras', icon: GraduationCap, funcoes: ['gestao'] },
  { to: '/fechamento', label: 'Fechamento', icon: Coins, funcoes: ['gestao'] },
  { to: '/conteudo', label: 'Conteúdo', icon: FileText, funcoes: ['gestao', 'social'] },
  { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, funcoes: ['gestao', 'secretaria'] },
  { to: '/investimentos', label: 'Investimentos', icon: TrendingUp, funcoes: ['gestao'] },
  { to: '/equipe', label: 'Equipe & Acessos', icon: ShieldCheck, funcoes: ['gestao'] },
]

export function Layout() {
  const { data: funcao } = useMinhaFuncao()
  const items = NAV.filter(
    (i) =>
      (!i.flag || flags[i.flag]) &&
      (!i.funcoes || (funcao != null && i.funcoes.includes(funcao))),
  )
  const { pathname } = useLocation()
  const atual = items.find((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)))

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200/80 bg-white px-3 py-6">
        <div className="mb-8 flex items-center gap-2 px-3">
          <span className="flex size-7 items-center justify-center rounded-md bg-brand-600 font-display text-sm font-bold text-white">
            L
          </span>
          <span className="font-display text-sm font-bold tracking-wide text-neutral-900">
            STUDIO POLE L
          </span>
        </div>
        <nav className="flex flex-col gap-0.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand-600" />
                  )}
                  <item.icon className="size-4 shrink-0" strokeWidth={2} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-neutral-100 pt-3">
          <button
            onClick={() => supabase?.auth.signOut()}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
          >
            <LogOut className="size-4" strokeWidth={2} />
            Sair
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-neutral-200/80 bg-white px-8">
          <h1 className="font-display text-sm font-semibold text-neutral-800">
            {atual?.label ?? 'Studio Pole L'}
          </h1>
        </header>
        <main className="flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
