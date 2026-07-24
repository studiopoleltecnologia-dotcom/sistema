import { useState } from 'react'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { GraficosFinanceiro } from '../components/GraficosFinanceiro'
import { deslocarMes, mesAtual, periodoMes, qtdMeses, type Periodo } from '../periodo'
import { useEntradas, useMixReceitaPeriodo, useSaidas, useSaidasPeriodo } from '../hooks/useFinanceiro'

export function FluxoPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(mesAtual()))
  const janela: Periodo =
    qtdMeses(periodo) >= 2 ? periodo : { inicio: deslocarMes(periodo.fim, -5), fim: periodo.fim }

  const { data: entradas } = useEntradas(periodo)
  const { data: saidas } = useSaidas(periodo)
  const { data: mixMensal } = useMixReceitaPeriodo(janela)
  const { data: saidasMensal } = useSaidasPeriodo(janela)

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <SeletorPeriodo periodo={periodo} onChange={setPeriodo} />
      </div>
      <GraficosFinanceiro
        entradas={entradas ?? []}
        saidas={saidas ?? []}
        periodo={periodo}
        mixMensal={mixMensal ?? []}
        saidasMensal={saidasMensal ?? []}
      />
    </div>
  )
}
