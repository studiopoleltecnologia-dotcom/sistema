import { useMemo, useState } from 'react'
import { CheckCircle2, Inbox } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { cn } from '../../../components/ui/cn'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos } from '../../../lib/dinheiro'
import { mesAtual, periodoMes } from '../periodo'
import {
  useAtualizarEntrada,
  useEntradas,
  useLancarRecorrente,
  useRecorrentes,
  useSaidas,
} from '../hooks/useFinanceiro'
import { CATEGORIA_ENTRADA_LABEL } from '../types'

type BucketKey = 'atrasada' | 'hoje' | 'semana' | 'mes' | 'depois'

const BUCKETS: { key: BucketKey; label: string; tom: 'danger' | 'warning' | 'brand' | 'neutral' }[] = [
  { key: 'atrasada', label: 'Em atraso', tom: 'danger' },
  { key: 'hoje', label: 'Hoje', tom: 'warning' },
  { key: 'semana', label: 'Esta semana', tom: 'brand' },
  { key: 'mes', label: 'Este mês', tom: 'neutral' },
  { key: 'depois', label: 'Mais adiante', tom: 'neutral' },
]

const TOM_CLS = {
  danger: 'text-danger-700 bg-danger-50',
  warning: 'text-warning-700 bg-warning-50',
  brand: 'text-brand-700 bg-brand-50',
  neutral: 'text-neutral-600 bg-neutral-100',
} as const

function addDias(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function fimDoMes(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

type Item = { id: string; valor: number; categoria: string; descricao: string; venc: string; acao: () => void; acaoLabel: string }

export function ContasPage() {
  const [aba, setAba] = useState<'receber' | 'pagar'>('receber')
  const hoje = new Date().toISOString().slice(0, 10)
  const fimSemana = addDias(hoje, 6)
  const fimMes = fimDoMes(hoje)

  const bucketOf = (iso: string): BucketKey => {
    if (iso < hoje) return 'atrasada'
    if (iso === hoje) return 'hoje'
    if (iso <= fimSemana) return 'semana'
    if (iso <= fimMes) return 'mes'
    return 'depois'
  }

  const atualizar = useAtualizarEntrada()
  const lancar = useLancarRecorrente()
  const { data: entradas } = useEntradas(periodoMes(mesAtual()))
  const { data: recorrentes } = useRecorrentes()
  const { data: saidasMes } = useSaidas(periodoMes(mesAtual()))

  const pagasIds = useMemo(
    () => new Set((saidasMes ?? []).map((s) => s.recorrente_id).filter(Boolean) as string[]),
    [saidasMes],
  )

  const itens = useMemo<Item[]>(() => {
    if (aba === 'receber') {
      return (entradas ?? [])
        .filter((e) => e.status === 'prevista')
        .map((e) => ({
          id: e.id,
          valor: e.valor_centavos,
          categoria: CATEGORIA_ENTRADA_LABEL[e.categoria],
          descricao: e.descricao || '—',
          venc: e.data_prevista ?? hoje,
          acaoLabel: 'Recebi',
          acao: () => atualizar.mutate({ id: e.id, patch: { status: 'recebida', data_caixa: hoje } }),
        }))
    }
    const mes = mesAtual()
    return (recorrentes ?? [])
      .filter((r) => !pagasIds.has(r.id))
      .map((r) => ({
        id: r.id,
        valor: r.valor_centavos,
        categoria: r.categoria?.nome ?? '—',
        descricao: r.descricao,
        venc: `${mes}-${String(r.dia_vencimento).padStart(2, '0')}`,
        acaoLabel: 'Pagar',
        acao: () => lancar.mutate({ recorrente: r, mes }),
      }))
  }, [aba, entradas, recorrentes, pagasIds, hoje, atualizar, lancar])

  const porBucket = (k: BucketKey) => itens.filter((i) => bucketOf(i.venc) === k)
  const total = itens.reduce((s, i) => s + i.valor, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
          {(['receber', 'pagar'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setAba(v)}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition',
                aba === v ? 'bg-white text-brand-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800',
              )}
            >
              {v === 'receber' ? 'A receber' : 'A pagar'}
            </button>
          ))}
        </div>
        <span className="text-sm text-neutral-500">
          Total {aba === 'receber' ? 'a receber' : 'a pagar'}:{' '}
          <strong className="text-neutral-900">{fmtCentavos(total)}</strong>
        </span>
      </div>

      {itens.length === 0 ? (
        <EmptyState
          icon={aba === 'receber' ? Inbox : CheckCircle2}
          title={aba === 'receber' ? 'Nada a receber' : 'Nada a pagar'}
          description={aba === 'receber' ? 'Nenhum recebimento previsto em aberto.' : 'Todas as recorrências do mês estão pagas.'}
        />
      ) : (
        BUCKETS.map((b) => {
          const lista = porBucket(b.key)
          if (lista.length === 0) return null
          const soma = lista.reduce((s, i) => s + i.valor, 0)
          return (
            <div key={b.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', TOM_CLS[b.tom])}>{b.label}</span>
                <span className="text-xs text-neutral-400">{lista.length} conta(s)</span>
                <span className="ml-auto text-sm font-semibold tabular-nums text-neutral-700">{fmtCentavos(soma)}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {lista.map((i) => (
                  <li
                    key={i.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border bg-white px-3.5 py-2.5 text-sm',
                      b.key === 'atrasada' ? 'border-danger-200' : 'border-neutral-200/80',
                    )}
                  >
                    <span className="w-24 shrink-0 font-semibold tabular-nums text-neutral-900">{fmtCentavos(i.valor)}</span>
                    <Badge variant="neutral">{i.categoria}</Badge>
                    <span className="flex-1 truncate text-neutral-500">{i.descricao}</span>
                    <span className="hidden shrink-0 text-xs text-neutral-400 sm:inline">vence {fmtData(i.venc)}</span>
                    <Button size="sm" variant="secondary" onClick={i.acao}>
                      <CheckCircle2 className="size-3.5" />
                      {i.acaoLabel}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      )}
    </div>
  )
}
