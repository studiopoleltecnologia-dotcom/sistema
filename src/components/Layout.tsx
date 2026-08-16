import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  Coins,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircleHeart,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  X,
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
  { to: '/analises', label: 'Análises', icon: BarChart3, funcoes: ['gestao', 'secretaria'] },
  { to: '/planos', label: 'Planos', icon: CreditCard, funcoes: ['gestao', 'secretaria'] },
  { to: '/professoras', label: 'Professoras', icon: GraduationCap, funcoes: ['gestao'] },
  { to: '/fechamento', label: 'Fechamento', icon: Coins, funcoes: ['gestao'] },
  { to: '/conteudo', label: 'Conteúdo', icon: FileText, funcoes: ['gestao', 'social'] },
  { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, funcoes: ['gestao', 'secretaria'] },
  { to: '/investimentos', label: 'Investimentos', icon: TrendingUp, funcoes: ['gestao'] },
  { to: '/equipe', label: 'Equipe & Acessos', icon: ShieldCheck, funcoes: ['gestao'] },
]

/** Conteúdo do menu — o mesmo na coluna fixa (desktop) e na gaveta (mobile). */
function Menulateral({ items, onNavegar }: { items: NavItem[]; onNavegar?: () => void }) {
  return (
    <>
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
            onClick={onNavegar}
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
    </>
  )
}

export function Layout() {
  const { data: funcao } = useMinhaFuncao()
  const items = NAV.filter(
    (i) =>
      (!i.flag || flags[i.flag]) &&
      (!i.funcoes || (funcao != null && i.funcoes.includes(funcao))),
  )
  const { pathname } = useLocation()
  const atual = items.find((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)))

  // No mobile o menu vira gaveta: a coluna de 240px não cabe numa tela de
  // 360px — comia dois terços do conteúdo. Fecha sozinha ao navegar, senão
  // troca-se de tela e continua-se olhando para o menu.
  const [gavetaAberta, setGavetaAberta] = useState(false)
  useEffect(() => setGavetaAberta(false), [pathname])
  useEffect(() => {
    if (!gavetaAberta) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setGavetaAberta(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [gavetaAberta])

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200/80 bg-white px-3 py-6 md:flex">
        <Menulateral items={items} />
      </aside>

      {gavetaAberta && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={() => setGavetaAberta(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col overflow-y-auto border-r border-neutral-200/80 bg-white px-3 py-6 shadow-lg">
            <button
              onClick={() => setGavetaAberta(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-5 rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="size-4" />
            </button>
            <Menulateral items={items} onNavegar={() => setGavetaAberta(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-neutral-200/80 bg-white px-4 md:px-8">
          <button
            onClick={() => setGavetaAberta(true)}
            aria-label="Abrir menu"
            className="-ml-1.5 rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="truncate font-display text-sm font-semibold text-neutral-800">
            {atual?.label ?? 'Studio Pole L'}
          </h1>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
