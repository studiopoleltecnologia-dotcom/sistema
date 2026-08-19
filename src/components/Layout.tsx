import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  ChevronDown,
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
import { cn } from './ui/cn'
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

type Secao = {
  /** null = itens soltos no topo, antes de qualquer rótulo (o "Início"). */
  titulo: string | null
  itens: NavItem[]
}

// Financeiro e Investimentos (dinheiro) e Professoras (mostra o valor
// pago a cada uma) são gestão-only. Conteúdo é de gestão + social. O
// resto é operação, que gestão e secretária compartilham. A trava real
// está na RLS; aqui é só o menu.
//
// O agrupamento espelha as camadas do CLAUDE.md §5 e casa com os papéis:
// a secretária enxerga praticamente só OPERAÇÃO, então o menu dela fica
// curto sozinho, sem regra extra.
const SECOES: Secao[] = [
  {
    titulo: null,
    itens: [{ to: '/', label: 'Início', icon: LayoutDashboard }],
  },
  {
    titulo: 'Operação',
    itens: [
      { to: '/clientes', label: 'Clientes', icon: Users, funcoes: ['gestao', 'secretaria'] },
      { to: '/agenda', label: 'Grade de horários', icon: CalendarDays, funcoes: ['gestao', 'secretaria'] },
      { to: '/followup', label: 'Follow-up', icon: MessageCircleHeart, funcoes: ['gestao', 'secretaria'] },
      { to: '/planos', label: 'Planos', icon: CreditCard, funcoes: ['gestao', 'secretaria'] },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { to: '/financeiro', label: 'Financeiro', icon: Wallet, funcoes: ['gestao'] },
      { to: '/fechamento', label: 'Fechamento', icon: Coins, funcoes: ['gestao'] },
      { to: '/investimentos', label: 'Investimentos', icon: TrendingUp, funcoes: ['gestao'] },
    ],
  },
  {
    titulo: 'Conteúdo',
    itens: [
      { to: '/conteudo', label: 'Conteúdo', icon: FileText, funcoes: ['gestao', 'social'] },
      { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, funcoes: ['gestao', 'secretaria'] },
    ],
  },
  {
    titulo: 'Gestão',
    itens: [
      { to: '/analises', label: 'Análises', icon: BarChart3, funcoes: ['gestao', 'secretaria'] },
      { to: '/professoras', label: 'Professoras', icon: GraduationCap, funcoes: ['gestao'] },
      { to: '/equipe', label: 'Equipe & Acessos', icon: ShieldCheck, funcoes: ['gestao'] },
    ],
  },
]

/** Lembra grupos recolhidos entre sessões (mesma ideia do CardColapsavel). */
function useGruposFechados() {
  const [fechados, setFechados] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('nav-grupos-fechados') ?? '[]')
    } catch {
      return []
    }
  })
  const alternar = (titulo: string) =>
    setFechados((atual) => {
      const novo = atual.includes(titulo)
        ? atual.filter((t) => t !== titulo)
        : [...atual, titulo]
      try {
        localStorage.setItem('nav-grupos-fechados', JSON.stringify(novo))
      } catch {
        /* ignore */
      }
      return novo
    })
  return [fechados, alternar] as const
}

/**
 * Conteúdo do menu — o mesmo na coluna fixa (desktop) e na gaveta (mobile).
 *
 * Fundo ameixa escuro de propósito: é o recurso mais barato de hierarquia
 * do app inteiro, porque separa "onde eu navego" de "onde eu trabalho" sem
 * depender de mais nenhum enfeite. A cor é `brand-900` do Guia de Marca.
 */
function Menulateral({ secoes, onNavegar, email }: { secoes: Secao[]; onNavegar?: () => void; email?: string }) {
  const [fechados, alternar] = useGruposFechados()

  const itemCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition',
      'outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
      isActive
        ? 'bg-brand-600 font-semibold text-white shadow-sm'
        : 'text-brand-200 hover:bg-white/10 hover:text-white',
    )

  return (
    <>
      <div className="mb-7 flex items-center gap-2 px-3">
        <span className="flex size-7 items-center justify-center rounded-md bg-white font-display text-sm font-bold text-brand-800">
          L
        </span>
        <span className="font-display text-sm font-bold tracking-wide text-white">
          STUDIO POLE L
        </span>
      </div>

      <nav className="flex flex-col gap-5">
        {secoes.map((secao) => {
          const fechada = secao.titulo != null && fechados.includes(secao.titulo)
          return (
            <div key={secao.titulo ?? '__topo__'} className="flex flex-col gap-0.5">
              {secao.titulo && (
                <button
                  onClick={() => alternar(secao.titulo!)}
                  aria-expanded={!fechada}
                  className="mb-1 flex items-center gap-1 px-3 text-[10px] font-bold uppercase tracking-widest text-brand-300/80 transition hover:text-brand-200"
                >
                  {secao.titulo}
                  <ChevronDown
                    className={cn('size-3 transition-transform', fechada ? '-rotate-90' : '')}
                  />
                </button>
              )}
              {!fechada &&
                secao.itens.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavegar}
                    className={itemCls}
                  >
                    <item.icon className="size-4 shrink-0" strokeWidth={2} />
                    {item.label}
                  </NavLink>
                ))}
            </div>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 pt-3">
        {email && (
          <p className="mb-1 truncate px-3 text-[11px] text-brand-300/70" title={email}>
            {email}
          </p>
        )}
        <button
          onClick={() => supabase?.auth.signOut()}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-brand-200 transition hover:bg-white/10 hover:text-white"
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
  const [email, setEmail] = useState<string>()

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? undefined))
  }, [])

  // Seção sem nenhum item visível some inteira — senão a secretária veria o
  // rótulo "FINANCEIRO" pairando sobre o nada.
  const secoes = SECOES.map((s) => ({
    ...s,
    itens: s.itens.filter(
      (i) =>
        (!i.flag || flags[i.flag]) &&
        (!i.funcoes || (funcao != null && i.funcoes.includes(funcao))),
    ),
  })).filter((s) => s.itens.length > 0)

  const items = secoes.flatMap((s) => s.itens)
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
      <aside className="hidden w-60 shrink-0 flex-col bg-brand-900 px-3 py-6 md:flex">
        <Menulateral secoes={secoes} email={email} />
      </aside>

      {gavetaAberta && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={() => setGavetaAberta(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col overflow-y-auto bg-brand-900 px-3 py-6 shadow-lg">
            <button
              onClick={() => setGavetaAberta(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-5 rounded-md p-1.5 text-brand-200 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
            <Menulateral secoes={secoes} email={email} onNavegar={() => setGavetaAberta(false)} />
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
          {/* Era text-sm — menor que o texto do conteúdo. O nome da tela é o
              primeiro ponto de ancoragem; precisa pesar mais que tudo à volta. */}
          <h1 className="truncate font-display text-base font-bold uppercase tracking-wide text-ink">
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
