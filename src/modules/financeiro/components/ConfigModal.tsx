import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { useAtualizarConfig } from '../hooks/useFinanceiro'
import type { ConfigFinanceiro } from '../types'

export function ConfigModal({
  config,
  onFechar,
}: {
  config: ConfigFinanceiro
  onFechar: () => void
}) {
  const atualizar = useAtualizarConfig()
  const [limite, setLimite] = useState(String(config.limite_mei_centavos / 100))
  const [percentual, setPercentual] = useState(String(config.percentual_reserva))
  const [metaMeses, setMetaMeses] = useState(String(config.meta_reserva_meses))
  const [saldoInicial, setSaldoInicial] = useState(String(config.saldo_inicial_centavos / 100))
  const [saldoData, setSaldoData] = useState(config.saldo_inicial_data)
  const [metaMes, setMetaMes] = useState(String(config.meta_faturamento_mensal_centavos / 100))
  const [metaAno, setMetaAno] = useState(String(config.meta_faturamento_anual_centavos / 100))
  const [multa, setMulta] = useState(String(config.multa_atraso_pct ?? 0))
  const [juros, setJuros] = useState(String(config.juros_mes_atraso_pct ?? 0))

  function salvar(e: FormEvent) {
    e.preventDefault()
    const limiteCentavos = parseCentavos(limite)
    const saldoCentavos = saldoInicial.trim() === '0' ? 0 : parseCentavos(saldoInicial)
    const pct = Number(percentual.replace(',', '.'))
    const meses = Number(metaMeses)
    // Metas são opcionais: campo vazio ou "0" = sem meta (0 centavos).
    const metaMesCentavos = metaMes.trim() === '' || metaMes.trim() === '0' ? 0 : parseCentavos(metaMes)
    const metaAnoCentavos = metaAno.trim() === '' || metaAno.trim() === '0' ? 0 : parseCentavos(metaAno)
    if (!limiteCentavos || saldoCentavos === null || !Number.isFinite(pct) || !meses) return
    if (metaMesCentavos === null || metaAnoCentavos === null) return
    // O banco tem check de 0–2% e 0–1% (tetos do CDC para mensalidade).
    // Validar aqui também evita a ida e volta só para receber o erro.
    const multaPct = Number(multa.replace(',', '.')) || 0
    const jurosPct = Number(juros.replace(',', '.')) || 0
    if (multaPct < 0 || multaPct > 2 || jurosPct < 0 || jurosPct > 1) return
    atualizar.mutate(
      {
        limite_mei_centavos: limiteCentavos,
        percentual_reserva: pct,
        meta_reserva_meses: meses,
        saldo_inicial_centavos: saldoCentavos,
        saldo_inicial_data: saldoData,
        meta_faturamento_mensal_centavos: metaMesCentavos,
        meta_faturamento_anual_centavos: metaAnoCentavos,
        multa_atraso_pct: multaPct,
        juros_mes_atraso_pct: jurosPct,
      },
      { onSuccess: onFechar },
    )
  }

  return (
    <Modal title="Configurações financeiras" onFechar={onFechar} size="sm">
      <form onSubmit={salvar}>
        <div className="flex flex-col gap-3">
          <Input
            label={`Limite anual MEI (hoje ${fmtCentavos(config.limite_mei_centavos)})`}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
          />
          <Input
            label="% de reserva sobre a receita"
            value={percentual}
            onChange={(e) => setPercentual(e.target.value)}
          />
          <Input
            label="Meta da reserva (meses de despesa fixa)"
            value={metaMeses}
            onChange={(e) => setMetaMeses(e.target.value)}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              label="Meta faturamento/mês (R$)"
              value={metaMes}
              onChange={(e) => setMetaMes(e.target.value)}
              placeholder="0 = sem meta"
            />
            <Input
              label="Meta faturamento/ano (R$)"
              value={metaAno}
              onChange={(e) => setMetaAno(e.target.value)}
              placeholder="0 = sem meta"
            />
          </div>
          {/*
            Multa e juros só valem para cobrança emitida pelo gateway —
            é ele que recalcula o valor quando o aluno paga depois do
            vencimento. Zero desliga.

            Os tetos (2% e 1%/mês) são os do CDC para mensalidade e o
            banco tem `check` para eles; o aviso existe porque cobrar
            multa que não está no regulamento é problema, não automação.
          */}
          <div className="border-t border-neutral-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-neutral-700">Atraso no pagamento</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                label="Multa (%)"
                value={multa}
                onChange={(e) => setMulta(e.target.value)}
                placeholder="0 = sem multa"
              />
              <Input
                label="Juros ao mês (%)"
                value={juros}
                onChange={(e) => setJuros(e.target.value)}
                placeholder="0 = sem juros"
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-neutral-400">
              Aplicados pelo gateway quando o aluno paga depois do vencimento. Máximo 2% de
              multa e 1% de juros ao mês (CDC). <b>Só cobre o que estiver escrito no
              regulamento</b> que o aluno aceitou.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              label="Saldo inicial de caixa (R$)"
              value={saldoInicial}
              onChange={(e) => setSaldoInicial(e.target.value)}
            />
            <Input
              label="Na data"
              type="date"
              value={saldoData}
              onChange={(e) => setSaldoData(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={atualizar.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
