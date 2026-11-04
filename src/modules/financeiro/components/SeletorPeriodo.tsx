import { useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { cn } from '../../../components/ui/cn'
import {
  anoCorrente,
  contemMes,
  deslocarMes,
  ehMesUnico,
  mesAtual,
  mesmoPeriodo,
  periodoMes,
  qtdMeses,
  rotuloPeriodo,
  ultimosMeses,
  type Periodo,
} from '../periodo'

/**
 * Escolher o recorte do Financeiro.
 *
 * Antes era só a fileira de presets mais dois `input type="month"`. O que
 * faltava é o movimento que a gestão faz toda hora: **o mês do lado**. Ir de
 * novembro a dezembro exigia abrir o seletor nativo do navegador (que no
 * Windows é um spinner de ano/mês) e acertar dois campos — para andar um mês.
 *
 * Agora a seta anda uma JANELA inteira: num mês único vai para o mês
 * seguinte; num trimestre, para o trimestre seguinte. A faixa manual continua
 * existindo, mas recolhida — ela é o caso raro, e aberta o tempo todo só
 * poluía a barra.
 */

// Presets relativos a hoje.
const PRESETS: { label: string; make: () => Periodo }[] = [
  { label: 'Mês', make: () => periodoMes(mesAtual()) },
  { label: 'Trimestre', make: () => ultimosMeses(3) },
  { label: 'Semestre', make: () => ultimosMeses(6) },
  { label: 'Ano', make: () => anoCorrente() },
]

const inputCls =
  'rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

const setaCls =
  'grid size-7 place-items-center rounded-md text-neutral-400 transition hover:bg-white hover:text-neutral-800'

export function SeletorPeriodo({
  periodo,
  onChange,
}: {
  periodo: Periodo
  onChange: (p: Periodo) => void
}) {
  // Abre já aberta quando o período não é nenhum preset nem um mês único:
  // quem chegou numa faixa personalizada precisa ver qual é.
  const [faixaAberta, setFaixaAberta] = useState(
    () => !ehMesUnico(periodo) && !PRESETS.some((p) => mesmoPeriodo(periodo, p.make())),
  )

  const janela = qtdMeses(periodo)
  const incluiHoje = contemMes(periodo, mesAtual())

  function andar(passos: number) {
    const delta = passos * janela
    onChange({
      inicio: deslocarMes(periodo.inicio, delta),
      fim: deslocarMes(periodo.fim, delta),
    })
  }

  const rotuloJanela = janela === 1 ? 'mês' : `${janela} meses`

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* O controle principal: anda uma janela por clique. */}
        <div className="flex items-center gap-0.5 rounded-lg bg-neutral-100 p-1">
          <button
            type="button"
            onClick={() => andar(-1)}
            title={`${rotuloJanela} anterior`}
            aria-label={`${rotuloJanela} anterior`}
            className={setaCls}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-28 text-center text-sm font-medium tabular-nums text-neutral-800">
            {rotuloPeriodo(periodo)}
          </span>
          <button
            type="button"
            onClick={() => andar(1)}
            title={`${rotuloJanela} seguinte`}
            aria-label={`${rotuloJanela} seguinte`}
            className={setaCls}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Só aparece quando serve: o caminho de volta depois de navegar longe. */}
        {!incluiHoje && (
          <button
            type="button"
            onClick={() => onChange(periodoMes(mesAtual()))}
            title="Voltar para o mês corrente"
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-brand-50"
          >
            <RotateCcw className="size-3.5" />
            Hoje
          </button>
        )}

        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
          {PRESETS.map((p) => {
            const ativo = mesmoPeriodo(periodo, p.make())
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setFaixaAberta(false)
                  onChange(p.make())
                }}
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

        <button
          type="button"
          onClick={() => setFaixaAberta((v) => !v)}
          title="Escolher uma faixa de meses"
          aria-expanded={faixaAberta}
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
            faixaAberta
              ? 'bg-neutral-100 text-neutral-800'
              : 'text-neutral-400 hover:text-neutral-700',
          )}
        >
          <CalendarRange className="size-3.5" />
          Faixa
        </button>
      </div>

      {faixaAberta && (
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
      )}
    </div>
  )
}
