import { ESTAGIOS, type Cliente } from '../types'
import { ClienteCard } from './ClienteCard'

/** Funil visual: uma coluna por estágio da jornada, na ordem do negócio. */
export function FunilBoard({
  clientes,
  onSelecionar,
}: {
  clientes: Cliente[]
  onSelecionar: (cliente: Cliente) => void
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {ESTAGIOS.map((estagio) => {
        const doEstagio = clientes.filter((c) => c.estagio === estagio.value)
        return (
          <div key={estagio.value} className="w-56 shrink-0">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <span className="text-xs font-medium tracking-wide text-neutral-500">
                {estagio.label}
              </span>
              <span className="text-xs text-neutral-300">{doEstagio.length}</span>
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-neutral-50/70 p-2">
              {doEstagio.map((cliente) => (
                <ClienteCard
                  key={cliente.id}
                  cliente={cliente}
                  onClick={() => onSelecionar(cliente)}
                />
              ))}
              {doEstagio.length === 0 && (
                <div className="py-3 text-center text-xs text-neutral-300">—</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
