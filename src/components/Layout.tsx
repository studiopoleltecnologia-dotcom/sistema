import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  Coins,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircleHeart,
  PanelLeftClose,
  PanelLeftOpen,
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
      { to: '/matriculas', label: 'Matrículas', icon: ClipboardList, funcoes: ['gestao', 'secretaria'] },
      { to: '/produtos', label: 'Produtos', icon: CreditCard, funcoes: ['gestao', 'secretaria'] },
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

/**
 * Lembra se a coluna de navegação está recolhida.
 *
 * Vive no navegador, não no banco: é postura de quem está olhando a tela,
 * não configuração do estúdio. Quem passa o dia na Grade de horários
 * recolhe e ganha 11rem de grade; quem navega entre módulos deixa aberto.
 */
function useMenuRecolhido() {
  const [recolhido, setRecolhido] = useState(() => {
    try {
      return localStorage.getItem('nav-recolhido') === '1'
    } catch {
      return false
    }
  })
  const alternar = () =>
    setRecolhido((atual) => {
      try {
        localStorage.setItem('nav-recolhido', atual ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !atual
    })
  return [recolhido, alternar] as const
}

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
function Menulateral({
  secoes,
  onNavegar,
  email,
  recolhido = false,
  onAlternarRecolhido,
}: {
  secoes: Secao[]
  onNavegar?: () => void
  email?: string
  /** Só ícones. A gaveta do celular nunca recolhe — lá o espaço é o menu. */
  recolhido?: boolean
  onAlternarRecolhido?: () => void
}) {
  const [fechados, alternar] = useGruposFechados()

  const itemCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'group relative flex items-center rounded-md py-2 text-sm transition',
      'outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
      recolhido ? 'justify-center px-0' : 'gap-2.5 px-3',
      isActive
        ? 'bg-brand-600 font-semibold text-white shadow-sm'
        : 'text-brand-200 hover:bg-white/10 hover:text-white',
    )

  return (
    <>
      <div
        className={cn(
          'mb-7 flex items-center',
          recolhido ? 'justify-center' : 'gap-2 px-3',
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white font-display text-sm font-bold text-brand-800">
          L
        </span>
        {!recolhido && (
          <span className="truncate font-display text-sm font-bold tracking-wide text-white">
            STUDIO POLE L
          </span>
        )}
      </div>

      <nav className={cn('flex flex-col', recolhido ? 'gap-1.5' : 'gap-5')}>
        {secoes.map((secao) => {
          // Recolhido não existe rótulo de seção para clicar, então o grupo
          // nunca fica escondido: um ícone sumido sem rótulo visível seria
          // um item que a pessoa não tem como reencontrar.
          const fechada =
            !recolhido && secao.titulo != null && fechados.includes(secao.titulo)
          return (
            <div key={secao.titulo ?? '__topo__'} className="flex flex-col gap-0.5">
              {secao.titulo &&
                (recolhido ? (
                  <span className="mx-auto my-1 h-px w-6 bg-white/10" aria-hidden />
                ) : (
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
                ))}
              {!fechada &&
                secao.itens.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavegar}
                    className={itemCls}
                    // Recolhido o ícone é tudo que sobra: sem o title, a
                    // navegação vira adivinhação.
                    title={recolhido ? item.label : undefined}
                    aria-label={recolhido ? item.label : undefined}
                  >
                    <item.icon className="size-4 shrink-0" strokeWidth={2} />
                    {!recolhido && <span className="truncate">{item.label}</span>}
                  </NavLink>
                ))}
            </div>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-white/10 pt-3">
        {!recolhido && email && (
          <p className="mb-1 truncate px-3 text-[11px] text-brand-300/70" title={email}>
            {email}
          </p>
        )}

        {onAlternarRecolhido && (
          <button
            onClick={onAlternarRecolhido}
            title={recolhido ? 'Expandir menu' : 'Recolher menu'}
            aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!recolhido}
            className={cn(
              'flex items-center rounded-md py-2 text-sm text-brand-200 transition hover:bg-white/10 hover:text-white',
              recolhido ? 'justify-center px-0' : 'w-full gap-2.5 px-3',
            )}
          >
            {recolhido ? (
              <PanelLeftOpen className="size-4 shrink-0" strokeWidth={2} />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" strokeWidth={2} />
            )}
            {!recolhido && 'Recolher menu'}
          </button>
        )}

        <button
          onClick={() => supabase?.auth.signOut()}
          title={recolhido ? 'Sair' : undefined}
          aria-label={recolhido ? 'Sair' : undefined}
          className={cn(
            'flex items-center rounded-md py-2 text-left text-sm text-brand-200 transition hover:bg-white/10 hover:text-white',
            recolhido ? 'justify-center px-0' : 'w-full gap-2.5 px-3',
          )}
        >
          <LogOut className="size-4 shrink-0" strokeWidth={2} />
          {!recolhido && 'Sair'}
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

  const [recolhido, alternarRecolhido] = useMenuRecolhido()

  return (
    // `overflow-x-clip`: nenhum filho pode empurrar a largura da página.
    // Rolagem horizontal, quando fizer falta, é da grade — não do layout.
    <div className="flex min-h-screen overflow-x-clip bg-neutral-50">
      <aside
        className={cn(
          'hidden shrink-0 flex-col bg-brand-900 py-6 transition-[width] duration-200 md:flex',
          recolhido ? 'w-16 px-2' : 'w-60 px-3',
        )}
      >
        <Menulateral
          secoes={secoes}
          email={email}
          recolhido={recolhido}
          onAlternarRecolhido={alternarRecolhido}
        />
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
