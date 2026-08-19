import { CheckCircle2 } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { cn } from '../../../components/ui/cn'
import { fmtCentavos } from '../../../lib/dinheiro'
import { LINHA_BASE, STATUS_FIN, statusDoBucket } from '../statusVisual'

export type BucketKey = 'atrasada' | 'hoje' | 'semana' | 'mes' | 'depois'

export type ItemAPagar = {
  id: string
  valor: number
  categoria: string
  descricao: string
  venc: string
  competencia: string | null
  bucket: BucketKey
  acao: () => void
}

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: 'atrasada', label: 'EM ATRASO' },
  { key: 'hoje', label: 'HOJE' },
  { key: 'semana', label: 'ESTA SEMANA' },
  { key: 'mes', label: 'ESTE MÊS' },
  { key: 'depois', label: 'MAIS ADIANTE' },
]

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function fmtDiaCurto(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${DIAS_SEMANA[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${MESES_ABREV[d.getMonth()]}`
}

function mesAno(iso: string) {
  const [ano, mes] = iso.slice(0, 7).split('-').map(Number)
  return `${MESES_ABREV[mes - 1]}/${ano}`
}

/**
 * Lista de contas em aberto de UM grupo de saída. Puramente de
 * apresentação: quem busca e agrupa é a SaidasPage, para os três grupos
 * dividirem a mesma consulta e o mesmo alternador Lista/Calendário —
 * repetir o toggle por grupo era exatamente o excesso de menu que a
 * reorganização veio tirar.
 */
export function ListaAPagar({ itens, modo }: { itens: ItemAPagar[]; modo: 'lista' | 'calendario' }) {
  if (itens.length === 0) {
    return <EmptyState icon={CheckCircle2} title="Nada em aberto" description="Nenhuma conta pendente aqui." />
  }

  if (modo === 'calendario') {
    const porDia = new Map<string, ItemAPagar[]>()
    for (const i of itens) porDia.set(i.venc, [...(porDia.get(i.venc) ?? []), i])
    const dias = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))

    return (
      <div className="flex flex-col gap-4">
        {dias.map(([dia, lista]) => (
          <div key={dia}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{fmtDiaCurto(dia)}</span>
              <span className="ml-auto text-sm font-semibold tabular-nums text-neutral-700">
                {fmtCentavos(lista.reduce((s, i) => s + i.valor, 0))}
              </span>
            </div>
            <Linhas itens={lista} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {BUCKETS.map((b) => {
        const lista = itens.filter((i) => i.bucket === b.key)
        if (lista.length === 0) return null
        return (
          <div key={b.key}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide',
                  STATUS_FIN[statusDoBucket(b.key)].chip,
                )}
              >
                {b.label}
              </span>
              <span className="text-xs text-neutral-400">{lista.length} conta(s)</span>
              <span className="ml-auto text-sm font-semibold tabular-nums text-neutral-700">
                {fmtCentavos(lista.reduce((s, i) => s + i.valor, 0))}
              </span>
            </div>
            <Linhas itens={lista} />
          </div>
        )
      })}
    </div>
  )
}

function Linhas({ itens }: { itens: ItemAPagar[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {itens.map((i) => {
        const competenciaDiferente = !!i.competencia && i.competencia.slice(0, 7) !== i.venc.slice(0, 7)
        const status = STATUS_FIN[statusDoBucket(i.bucket)]
        return (
          <li key={i.id} className={cn(LINHA_BASE, status.barra)}>
            <span className={cn('w-24 shrink-0 font-semibold tabular-nums', status.valor)}>{fmtCentavos(i.valor)}</span>
            <Badge variant="neutral">{i.categoria}</Badge>
            <span className="flex-1 truncate text-neutral-500">{i.descricao}</span>
            {competenciaDiferente && (
              <span className="hidden shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 sm:inline">
                competência {mesAno(i.competencia!)}
              </span>
            )}
            <span className="hidden shrink-0 text-xs text-neutral-400 sm:inline">
              vence {i.venc.split('-').reverse().join('/')}
            </span>
            <Button size="sm" variant="secondary" onClick={i.acao} title="Marcar como pago">
              <CheckCircle2 className="size-3.5" />
              <span className="hidden sm:inline">Marcar como pago</span>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
