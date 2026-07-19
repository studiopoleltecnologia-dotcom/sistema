import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { flags } from '../lib/flags'

type NavItem = { to: string; label: string; flag?: keyof typeof flags }

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/financeiro', label: 'Financeiro' },
  { to: '/followup', label: 'Follow-up' },
  { to: '/agenda', label: 'Agenda' },
  { to: '/planos', label: 'Planos' },
  { to: '/professoras', label: 'Professoras' },
  { to: '/conteudo', label: 'Conteúdo' },
  { to: '/tarefas', label: 'Tarefas' },
  { to: '/investimentos', label: 'Investimentos' },
]

export function Layout() {
  const items = NAV.filter((i) => !i.flag || flags[i.flag])

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r border-neutral-100 px-4 py-6">
        <div className="mb-8 px-2 text-sm font-semibold tracking-wide text-brand-600">
          STUDIO POLE L
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-md px-2 py-1.5 text-sm transition ${
                  isActive
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => supabase?.auth.signOut()}
          className="mt-auto rounded-md px-2 py-1.5 text-left text-sm text-neutral-400 transition hover:text-neutral-700"
        >
          Sair
        </button>
      </aside>
      <main className="flex-1 px-10 py-8">
        <Outlet />
      </main>
    </div>
  )
}
