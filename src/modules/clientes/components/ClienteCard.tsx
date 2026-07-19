import { diasDesde } from '../../../lib/datas'
import { ORIGEM_LABEL, type Cliente } from '../types'

/**
 * Card do funil. Clique abre o detalhe; o select de estágio fica no
 * painel — o card mostra só o que ajuda a decidir quem contatar.
 */
export function ClienteCard({
  cliente,
  onClick,
}: {
  cliente: Cliente
  onClick: () => void
}) {
  const dias = diasDesde(cliente.ultima_conversa)

  return (
    <button
      onClick={onClick}
      className="w-full rounded-md border border-neutral-100 bg-white p-3 text-left shadow-sm transition hover:border-brand-100 hover:shadow"
    >
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium text-neutral-900">
          {cliente.nome}
        </span>
        {cliente.vip && (
          <span className="rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-600">
            VIP
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-neutral-400">
        <span>{ORIGEM_LABEL[cliente.origem]}</span>
        {dias !== null && (
          <span className={dias >= 15 ? 'text-amber-600' : ''}>
            {dias === 0 ? 'hoje' : `${dias}d sem conversa`}
          </span>
        )}
      </div>
    </button>
  )
}
