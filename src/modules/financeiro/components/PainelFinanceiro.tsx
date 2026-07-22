import {
  ArrowRight,
  Banknote,
  Landmark,
  PiggyBank,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { KpiCard } from '../../../components/ui/KpiCard'
import { fmtCentavos } from '../../../lib/dinheiro'
import { nivelAlertaMei, ORDEM_TIPO_SAIDA, TIPO_SAIDA_LABEL, type Entrada, type MeiAcumulado, type Saida, type SaldoCaixa, type TipoSaida } from '../types'

const TIPO_COR: Record<TipoSaida, string> = {
  fixa: 'var(--color-chart-1)',
  fixa_planejada: 'var(--color-chart-2)',
  variavel: 'var(--color-chart-3)',
}

function FluxoEtapa({
  label,
  valor,
  tom = 'neutral',
  destaque = false,
}: {
  label: string
  valor: string
  tom?: 'positivo' | 'negativo' | 'neutral' | 'final'
  destaque?: boolean
}) {
  const valorCls =
    tom === 'positivo'
      ? 'text-success-600'
      : tom === 'negativo'
        ? 'text-danger-600'
        : tom === 'final'
          ? 'text-brand-700'
          : 'text-neutral-900'
  return (
    <div
      className={`flex min-w-[8rem] flex-1 flex-col items-center rounded-lg px-3 py-3 text-center ${
        destaque ? 'bg-white shadow-sm ring-1 ring-neutral-200/80' : 'bg-neutral-50'
      }`}
    >
      <span className="text-[11px] font-medium text-neutral-400">{label}</span>
      <span
        className={`mt-1 font-display font-bold ${destaque ? 'text-xl' : 'text-base'} ${valorCls}`}
      >
        {valor}
      </span>
    </div>
  )
}

export function PainelFinanceiro({
  entradas,
  saidas,
  mei,
  saldo,
  mes,
}: {
  entradas: Entrada[]
  saidas: (Saida & { categoria?: { tipo: TipoSaida; nome: string } | null })[]
  mei: MeiAcumulado | undefined
  saldo: SaldoCaixa | undefined
  mes: string
}) {
  const recebidoMes = entradas
    .filter((e) => e.status === 'recebida')
    .reduce((s, e) => s + e.valor_centavos, 0)

  const previstoMes = entradas
    .filter((e) => e.status === 'prevista' && (e.data_prevista ?? '').slice(0, 7) === mes)
    .reduce((s, e) => s + e.valor_centavos, 0)

  const porTipo = (tipo: TipoSaida) =>
    saidas.filter((s) => s.categoria?.tipo === tipo).reduce((s, x) => s + x.valor_centavos, 0)

  const custosRecorrentes = porTipo('fixa')
  const custosPlanejados = porTipo('fixa_planejada')
  const custosVariaveis = porTipo('variavel')
  const despesasPagas = custosRecorrentes + custosPlanejados + custosVariaveis
  const despesasPendentes = saldo?.recorrentes_pendentes_mes_centavos ?? 0

  const receitaTotalMes = recebidoMes + previstoMes
  const despesaTotalMes = despesasPagas + despesasPendentes
  const lucroProjetado = receitaTotalMes - despesaTotalMes
  const pontoEquilibrio = custosRecorrentes

  const pct = mei?.percentual_limite ?? 0
  const nivelMei = nivelAlertaMei(pct)
  const mostrarAlertaMei = nivelMei !== 'ok'

  return (
    <div className="mb-6 flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          size="lg"
          label="Saldo disponível"
          value={fmtCentavos(saldo?.saldo_atual_centavos ?? 0)}
          icon={Wallet}
          tone="brand"
          hint={
            saldo?.saldo_projetado_centavos != null
              ? `${fmtCentavos(saldo.saldo_projetado_centavos)} projetado`
              : undefined
          }
        />
        <KpiCard
          size="lg"
          label="Lucro projetado"
          value={fmtCentavos(lucroProjetado)}
          icon={Scale}
          tone={lucroProjetado >= 0 ? 'success' : 'danger'}
          hint="receita − despesas do mês"
        />
        <KpiCard
          size="lg"
          label="Receita do mês"
          value={fmtCentavos(receitaTotalMes)}
          icon={TrendingUp}
          tone="success"
          hint={`${fmtCentavos(recebidoMes)} recebido`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          label="Recebido no mês"
          value={fmtCentavos(recebidoMes)}
          icon={Banknote}
          tone="success"
        />
        <KpiCard
          label="Previsto no mês"
          value={fmtCentavos(previstoMes)}
          icon={Receipt}
          tone="brand"
        />
        <KpiCard
          label="A receber (geral)"
          value={fmtCentavos(saldo?.previsto_em_aberto_centavos ?? 0)}
          icon={TrendingUp}
          tone="brand"
          hint="todas as pendências"
        />
        <KpiCard
          label="Despesas pagas"
          value={fmtCentavos(despesasPagas)}
          icon={TrendingDown}
          tone="danger"
        />
        <KpiCard
          label="Despesas pendentes"
          value={fmtCentavos(despesasPendentes)}
          icon={Receipt}
          tone="warning"
          hint="recorrentes do mês"
        />
        <KpiCard
          label="Ponto de equilíbrio"
          value={fmtCentavos(pontoEquilibrio)}
          icon={Landmark}
          tone="neutral"
          hint="p/ cobrir custos fixos"
          className="col-span-2 md:col-span-1"
        />
      </div>

      {mostrarAlertaMei && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
            nivelMei === 'critico'
              ? 'bg-danger-50 text-danger-700'
              : nivelMei === 'alerta'
                ? 'bg-warning-100 text-warning-700'
                : 'bg-warning-50 text-warning-700'
          }`}
        >
          <PiggyBank className="size-4 shrink-0" />
          MEI em {pct}% do limite anual ({fmtCentavos(mei?.limite_mei_centavos)}) — projeção para
          dezembro: {fmtCentavos(mei?.projecao_dezembro_centavos)}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200/80 bg-white p-4">
        <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Fluxo do mês
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <FluxoEtapa label="Previsto" valor={fmtCentavos(receitaTotalMes)} />
          <ArrowRight className="hidden size-4 shrink-0 text-neutral-300 sm:block" />
          <FluxoEtapa label="Recebido" valor={fmtCentavos(recebidoMes)} tom="positivo" />
          <ArrowRight className="hidden size-4 shrink-0 text-neutral-300 sm:block" />
          <FluxoEtapa
            label="Fixo recorrente"
            valor={`− ${fmtCentavos(custosRecorrentes)}`}
            tom="negativo"
          />
          <ArrowRight className="hidden size-4 shrink-0 text-neutral-300 sm:block" />
          <FluxoEtapa
            label="Fixo planejado"
            valor={`− ${fmtCentavos(custosPlanejados)}`}
            tom="negativo"
          />
          <ArrowRight className="hidden size-4 shrink-0 text-neutral-300 sm:block" />
          <FluxoEtapa label="Variável" valor={`− ${fmtCentavos(custosVariaveis)}`} tom="negativo" />
          <ArrowRight className="hidden size-4 shrink-0 text-neutral-300 sm:block" />
          <FluxoEtapa
            label="Lucro"
            valor={fmtCentavos(lucroProjetado)}
            tom={lucroProjetado >= 0 ? 'positivo' : 'negativo'}
            destaque
          />
          <ArrowRight className="hidden size-4 shrink-0 text-neutral-300 sm:block" />
          <FluxoEtapa
            label="Saldo"
            valor={fmtCentavos(saldo?.saldo_atual_centavos ?? 0)}
            tom="final"
            destaque
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ORDEM_TIPO_SAIDA.map((tipo) => {
          const valor = porTipo(tipo)
          const pctDoTotal = despesasPagas > 0 ? Math.round((valor / despesasPagas) * 100) : 0
          return (
            <div key={tipo} className="rounded-lg border border-neutral-200/80 bg-white p-4">
              <div className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: TIPO_COR[tipo] }}
                />
                <span className="text-xs font-medium text-neutral-500">
                  {TIPO_SAIDA_LABEL[tipo]}
                </span>
              </div>
              <div className="mt-1.5 font-display text-lg font-bold text-neutral-900">
                {fmtCentavos(valor)}
              </div>
              <div className="mt-1 text-[11px] text-neutral-400">{pctDoTotal}% das despesas pagas</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
