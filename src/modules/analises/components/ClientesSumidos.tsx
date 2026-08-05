import { useState } from 'react'
import { MessageCircle, UserX } from 'lucide-react'
import { Card, CardHeader } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { fmtData } from '../../../lib/datas'
import { useClientesSumidos, usePlanosNomes } from '../hooks/useAnalises'
import { linkWhatsapp } from '../types'

const OPCOES_DIAS = [14, 20, 30, 45, 60]

export function ClientesSumidos() {
  const [dias, setDias] = useState(20)
  const { data, isLoading } = useClientesSumidos(dias)
  const { data: planosNomes } = usePlanosNomes()
  const linhas = data ?? []

  const nomePlano = (id: string | null) =>
    (planosNomes ?? []).find((p) => p.id === id)?.nome ?? 'Plano'

  return (
    <Card>
      <CardHeader
        title="Clientes sumidos"
        subtitle="Plano ativo, sem aula há um tempo — pagando e não usando"
        action={
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 outline-none transition focus:border-brand-500"
          >
            {OPCOES_DIAS.map((d) => (
              <option key={d} value={d}>
                sem aula há {d}+ dias
              </option>
            ))}
          </select>
        }
      />
      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : linhas.length === 0 ? (
        <EmptyState icon={UserX} title="Ninguém sumido nesse período." />
      ) : (
        <ul className="flex flex-col gap-2">
          {linhas.map((c) => {
            const wa = linkWhatsapp(c.telefone)
            return (
              <li
                key={c.cliente_id}
                className="flex items-center gap-3 rounded-lg border border-neutral-100 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-neutral-800">{c.nome}</span>
                    <span className="rounded bg-danger-50 px-1.5 py-0.5 text-[10px] font-semibold text-danger-700">
                      {c.dias_sem_aula} dias sem aula
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400">
                    <span>{nomePlano(c.plano_id)}</span>
                    <span>{c.saldo_creditos} crédito(s)</span>
                    <span>última aula {fmtData(c.ultima_aula)}</span>
                  </div>
                </div>
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700"
                  >
                    <MessageCircle className="size-3.5" />
                    Entrar em contato
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
