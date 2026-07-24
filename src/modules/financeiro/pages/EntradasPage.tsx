import { useState } from 'react'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { EntradasTab } from '../components/EntradasTab'
import { mesAtual, periodoMes, type Periodo } from '../periodo'

export function EntradasPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(mesAtual()))
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <SeletorPeriodo periodo={periodo} onChange={setPeriodo} />
      </div>
      <EntradasTab periodo={periodo} />
    </div>
  )
}
