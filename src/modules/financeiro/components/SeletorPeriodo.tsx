import { cn } from '../../../components/ui/cn'
import {
  anoCorrente,
  mesAtual,
  mesmoPeriodo,
  periodoMes,
  ultimosMeses,
  type Periodo,
} from '../periodo'

// Presets relativos a hoje. A faixa "de / até" ao lado permite qualquer
// intervalo personalizado — é o "poder escolher os meses que quero ver".
const PRESETS: { label: string; make: () => Periodo }[] = [
  { label: 'Mês', make: () => periodoMes(mesAtual()) },
  { label: 'Trimestre', make: () => ultimosMeses(3) },
  { label: 'Semestre', make: () => ultimosMeses(6) },
  { label: 'Ano', make: () => anoCorrente() },
]

const inputCls =
  'rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

export function SeletorPeriodo({
  periodo,
  onChange,
}: {
  periodo: Periodo
  onChange: (p: Periodo) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {PRESETS.map((p) => {
          const ativo = mesmoPeriodo(periodo, p.make())
          return (
            <button
              key={p.label}
              onClick={() => onChange(p.make())}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition',
                ativo
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-800',
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <span>de</span>
        <input
          type="month"
          value={periodo.inicio}
          max={periodo.fim}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            // se o novo início passar do fim, arrasta o fim junto
            onChange({ inicio: v, fim: v > periodo.fim ? v : periodo.fim })
          }}
          className={inputCls}
        />
        <span>até</span>
        <input
          type="month"
          value={periodo.fim}
          min={periodo.inicio}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            onChange({ inicio: v < periodo.inicio ? v : periodo.inicio, fim: v })
          }}
          className={inputCls}
        />
      </div>
    </div>
  )
}
