import { Card, CardHeader } from '../../../components/ui/Card'
import { ESTAGIOS } from '../../clientes/types'
import type { ContagemFunil } from '../api/dashboard'

/**
 * Funil na ordem real das etapas (ESTAGIOS), não por volume — a leitura
 * que importa é "onde as pessoas estão travando", e isso exige a sequência.
 */
export function FunilResumo({ contagens }: { contagens: ContagemFunil[] }) {
  const mapa = new Map(contagens.map((c) => [c.estagio, c.total]))
  const total = contagens.reduce((s, c) => s + c.total, 0)
  const max = Math.max(1, ...contagens.map((c) => c.total))

  return (
    <Card>
      <CardHeader title="Funil de relacionamento" subtitle={`${total} pessoas no CRM`} />
      <ul className="flex flex-col gap-1.5">
        {ESTAGIOS.map((e) => {
          const n = mapa.get(e.value) ?? 0
          const ativa = e.value === 'ativa'
          return (
            <li key={e.value} className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0 truncate text-xs text-neutral-500">{e.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`h-full rounded-full ${ativa ? 'bg-success-500' : 'bg-brand-300'}`}
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </div>
              <span
                className={`w-6 shrink-0 text-right font-medium tabular-nums ${
                  ativa ? 'text-success-700' : 'text-neutral-600'
                }`}
              >
                {n}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
