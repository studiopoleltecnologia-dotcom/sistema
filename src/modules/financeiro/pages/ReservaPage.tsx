import { ReservaTab } from '../components/ReservaTab'
import { mesAtual, periodoMes } from '../periodo'
import { useEntradas } from '../hooks/useFinanceiro'

export function ReservaPage() {
  const { data: entradas } = useEntradas(periodoMes(mesAtual()))
  const recebidoMes = (entradas ?? [])
    .filter((e) => e.status === 'recebida')
    .reduce((s, e) => s + e.valor_centavos, 0)
  return <ReservaTab recebidoMes={recebidoMes} />
}
