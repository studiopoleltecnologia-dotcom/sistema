import { fmtData } from '../../../lib/datas'
import { ESTAGIO_LABEL, ORIGEM_LABEL, type Cliente, type Socia } from '../types'

/** Visão em tabela — complementar ao funil, boa para busca e conferência. */
export function ClientesLista({
  clientes,
  socias,
  onSelecionar,
}: {
  clientes: Cliente[]
  socias: Socia[]
  onSelecionar: (cliente: Cliente) => void
}) {
  const nomeSocia = (id: string | null) =>
    socias.find((s) => s.id === id)?.nome ?? '—'

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-neutral-100 text-xs text-neutral-400">
          <th className="py-2 pr-4 font-medium">Nome</th>
          <th className="py-2 pr-4 font-medium">Estágio</th>
          <th className="py-2 pr-4 font-medium">Origem</th>
          <th className="py-2 pr-4 font-medium">Telefone</th>
          <th className="py-2 pr-4 font-medium">Responsável</th>
          <th className="py-2 font-medium">Última conversa</th>
        </tr>
      </thead>
      <tbody>
        {clientes.map((cliente) => (
          <tr
            key={cliente.id}
            onClick={() => onSelecionar(cliente)}
            className="cursor-pointer border-b border-neutral-50 transition hover:bg-neutral-50"
          >
            <td className="py-2.5 pr-4 font-medium text-neutral-900">
              {cliente.nome}
              {cliente.vip && (
                <span className="ml-1.5 rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-600">
                  VIP
                </span>
              )}
            </td>
            <td className="py-2.5 pr-4 text-neutral-600">
              {ESTAGIO_LABEL[cliente.estagio]}
            </td>
            <td className="py-2.5 pr-4 text-neutral-500">
              {ORIGEM_LABEL[cliente.origem]}
            </td>
            <td className="py-2.5 pr-4 text-neutral-500">{cliente.telefone ?? '—'}</td>
            <td className="py-2.5 pr-4 text-neutral-500">
              {nomeSocia(cliente.responsavel_id)}
            </td>
            <td className="py-2.5 text-neutral-500">{fmtData(cliente.ultima_conversa)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
