import { useState } from 'react'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { SaidasTab } from '../components/SaidasTab'
import { mesAtual, periodoMes, type Periodo } from '../periodo'

export function SaidasPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(mesAtual()))
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <SeletorPeriodo periodo={periodo} onChange={setPeriodo} />
      </div>
      <SaidasTab periodo={periodo} />
    </div>
  )
}
