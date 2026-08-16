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
    atualizar.mutate(
      {
        limite_mei_centavos: limiteCentavos,
        percentual_reserva: pct,
        meta_reserva_meses: meses,
        saldo_inicial_centavos: saldoCentavos,
        saldo_inicial_data: saldoData,
        meta_faturamento_mensal_centavos: metaMesCentavos,
        meta_faturamento_anual_centavos: metaAnoCentavos,
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
