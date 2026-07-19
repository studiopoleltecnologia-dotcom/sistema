import { fmtCentavos } from '../../../lib/dinheiro'
import { nivelAlertaMei, type MeiAcumulado } from '../types'

const CORES_MEI = {
  ok: 'bg-brand-500',
  atencao: 'bg-amber-500',
  alerta: 'bg-orange-500',
  critico: 'bg-red-600',
} as const

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-100 p-4">
      <div className="text-xs text-neutral-400">{titulo}</div>
      {children}
    </div>
  )
}

export function ResumoCards({
  recebidoMes,
  saidasMes,
  mei,
  saldoAtual,
  previstoAberto,
}: {
  recebidoMes: number
  saidasMes: number
  mei: MeiAcumulado | undefined
  saldoAtual: number | null | undefined
  previstoAberto: number | null | undefined
}) {
  const resultado = recebidoMes - saidasMes
  const pct = mei?.percentual_limite ?? 0
  const nivel = nivelAlertaMei(pct)

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Card titulo="Recebido no mês">
        <div className="mt-1 text-lg font-semibold text-neutral-900">
          {fmtCentavos(recebidoMes)}
        </div>
      </Card>

      <Card titulo="Saídas no mês">
        <div className="mt-1 text-lg font-semibold text-neutral-900">
          {fmtCentavos(saidasMes)}
        </div>
      </Card>

      <Card titulo="Resultado do mês">
        <div
          className={`mt-1 text-lg font-semibold ${
            resultado < 0 ? 'text-red-600' : 'text-neutral-900'
          }`}
        >
          {fmtCentavos(resultado)}
        </div>
      </Card>

      <Card titulo="Saldo de caixa">
        <div className="mt-1 text-lg font-semibold text-neutral-900">
          {fmtCentavos(saldoAtual ?? 0)}
        </div>
        <div className="mt-0.5 text-[11px] text-neutral-400">
          + {fmtCentavos(previstoAberto ?? 0)} previsto
        </div>
      </Card>

      <Card titulo={`MEI ${new Date().getFullYear()}`}>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-lg font-semibold text-neutral-900">{pct}%</span>
          <span className="text-[11px] text-neutral-400">
            de {fmtCentavos(mei?.limite_mei_centavos)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full rounded-full ${CORES_MEI[nivel]}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-neutral-400">
          projeção dez: {fmtCentavos(mei?.projecao_dezembro_centavos)}
          {nivel !== 'ok' && (
            <span className={`ml-1 font-medium ${nivel === 'critico' ? 'text-red-600' : nivel === 'alerta' ? 'text-orange-600' : 'text-amber-600'}`}>
              • alerta {nivel === 'atencao' ? '70%' : nivel === 'alerta' ? '85%' : '95%'}
            </span>
          )}
        </div>
      </Card>
    </div>
  )
}
