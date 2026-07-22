import { NavLink, Outlet } from 'react-router-dom'

const ITENS = [
  { to: '', label: 'Aulas', icone: '📋' },
  { to: 'pagamentos', label: 'Pagamentos', icone: '💰' },
  { to: 'perfil', label: 'Perfil', icone: '👤' },
]

export function ProfessoraLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-md">
          {ITENS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === ''}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition ${
                  isActive ? 'text-brand-700' : 'text-neutral-400'
                }`
              }
            >
              <span className="text-lg">{item.icone}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
