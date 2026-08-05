import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardHeader } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useAlertas } from '../hooks/useAnalises'
import { SEVERIDADE_TOM, type Severidade } from '../types'

const ICONE: Record<Severidade, typeof AlertTriangle> = {
  vermelho: XCircle,
  amarelo: AlertTriangle,
  verde: CheckCircle2,
}

export function CentralAlertas({
  onSelecionar,
}: {
  onSelecionar: (origemTipo: string, origemId: string) => void
}) {
  const { data: alertas, isLoading } = useAlertas()

  return (
    <Card>
      <CardHeader
        title="Central de alertas"
        subtitle="Regras automáticas sobre ocupação e tendência — clique para ver a origem"
      />
      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : !alertas || alertas.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nenhum alerta no momento"
          description="Nada fora do padrão nas últimas semanas."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {alertas.map((a, i) => {
            const sev = (a.severidade ?? 'amarelo') as Severidade
            const Icone = ICONE[sev]
            const tom = SEVERIDADE_TOM[sev]
            return (
              <li key={i}>
                <button
                  onClick={() =>
                    a.origem_tipo && a.origem_id && onSelecionar(a.origem_tipo, a.origem_id)
                  }
                  className={`flex w-full items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm transition hover:opacity-80 ${tom.chip}`}
                >
                  <Icone className="mt-0.5 size-4 shrink-0" />
                  <span className="flex-1">
                    {a.texto}
                    {a.acao_sugerida && (
                      <span className="ml-2 inline-block rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-semibold">
                        → {a.acao_sugerida}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
