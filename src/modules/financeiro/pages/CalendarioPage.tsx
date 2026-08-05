import { useMemo } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, CalendarRange } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { KpiCard } from '../../../components/ui/KpiCard'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useContasAPagar, useContasAReceber } from '../hooks/useFinanceiro'

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

type Item = {
  id: string
  tipo: 'receber' | 'pagar'
  valor: number
  categoria: string
  descricao: string
  vencimento: string
  competencia: string | null
}

// Junção visual de vw_contas_a_receber + vw_contas_a_pagar por dia — a
// mesma ideia da seção "Calendário Financeiro" do pedido original: deixar
// claro que o dinheiro de um dia pertence, muitas vezes, à operação de
// um mês anterior (ex.: repasse Wellhub de julho, recebido em agosto).
export function CalendarioPage() {
  const { data: receber } = useContasAReceber()
  const { data: pagar } = useContasAPagar()

  const dias = useMemo(() => {
    const itens: Item[] = [
      ...(receber ?? []).map((e) => ({
        id: e.id!,
        tipo: 'receber' as const,
        valor: e.valor_centavos!,
        categoria: e.categoria ?? '—',
        descricao: e.descricao || '—',
        vencimento: e.vencimento!,
        competencia: e.competencia,
      })),
      ...(pagar ?? []).map((p) => ({
        id: p.id!,
        tipo: 'pagar' as const,
        valor: p.valor_centavos!,
        categoria: p.categoria ?? '—',
        descricao: p.descricao || '—',
        vencimento: p.vencimento!,
        competencia: p.competencia,
      })),
    ]
    const porDia = new Map<string, Item[]>()
    for (const i of itens) {
      const lista = porDia.get(i.vencimento) ?? []
      lista.push(i)
      porDia.set(i.vencimento, lista)
    }
    return [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [receber, pagar])

  const totalReceber = (receber ?? []).reduce((s, e) => s + (e.valor_centavos ?? 0), 0)
  const totalPagar = (pagar ?? []).reduce((s, p) => s + (p.valor_centavos ?? 0), 0)
  const saldo = totalReceber - totalPagar

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="A receber" value={fmtCentavos(totalReceber)} tone="success" icon={ArrowDownToLine} />
        <KpiCard label="A pagar" value={fmtCentavos(totalPagar)} tone="danger" icon={ArrowUpFromLine} />
        <KpiCard
          label="Saldo do período"
          value={fmtCentavos(saldo)}
          tone={saldo >= 0 ? 'success' : 'danger'}
          icon={CalendarRange}
        />
      </div>

      {dias.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Nada agendado" description="Nenhum recebimento ou pagamento previsto." />
      ) : (
        <div className="flex flex-col gap-4">
          {dias.map(([dia, itens]) => {
            const saldoDia = itens.reduce((s, i) => s + (i.tipo === 'receber' ? i.valor : -i.valor), 0)
            return (
              <div key={dia}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-700">{fmtDiaCurto(dia)}</span>
                  <span className="ml-auto text-sm font-semibold tabular-nums text-neutral-500">
                    {saldoDia >= 0 ? '+' : '−'}
                    {fmtCentavos(Math.abs(saldoDia))}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {itens.map((i) => {
                    const competenciaDiferente =
                      !!i.competencia && i.competencia.slice(0, 7) !== i.vencimento.slice(0, 7)
                    return (
                      <li
                        key={`${i.tipo}-${i.id}`}
                        className="flex items-center gap-3 rounded-lg border border-neutral-200/80 bg-white px-3.5 py-2.5 text-sm"
                      >
                        <span
                          className={`w-24 shrink-0 font-semibold tabular-nums ${
                            i.tipo === 'receber' ? 'text-success-700' : 'text-danger-600'
                          }`}
                        >
                          {i.tipo === 'receber' ? '+' : '−'}
                          {fmtCentavos(i.valor)}
                        </span>
                        <Badge variant="neutral">{i.categoria}</Badge>
                        <span className="flex-1 truncate text-neutral-500">{i.descricao}</span>
                        {competenciaDiferente && (
                          <span className="hidden shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 sm:inline">
                            competência {mesAno(i.competencia!)}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-neutral-400">
        A etiqueta de competência aparece quando o dinheiro do dia pertence à operação de um mês diferente do
        vencimento — ex.: repasse Wellhub ou folha de professora.
      </p>
    </div>
  )
}
