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

  function salvar(e: FormEvent) {
    e.preventDefault()
    const limiteCentavos = parseCentavos(limite)
    const saldoCentavos = saldoInicial.trim() === '0' ? 0 : parseCentavos(saldoInicial)
    const pct = Number(percentual.replace(',', '.'))
    const meses = Number(metaMeses)
    if (!limiteCentavos || saldoCentavos === null || !Number.isFinite(pct) || !meses) return
    atualizar.mutate(
      {
        limite_mei_centavos: limiteCentavos,
        percentual_reserva: pct,
        meta_reserva_meses: meses,
        saldo_inicial_centavos: saldoCentavos,
        saldo_inicial_data: saldoData,
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
          <div className="grid grid-cols-2 gap-2">
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
