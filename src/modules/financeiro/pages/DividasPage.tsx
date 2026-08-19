import { useMemo, useState, type FormEvent } from 'react'
import { CalendarPlus, CheckCircle2, HandCoins, Plus, RotateCcw, Wallet } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { KpiCard } from '../../../components/ui/KpiCard'
import { Modal } from '../../../components/ui/Modal'
import { PageHeader } from '../../../components/ui/PageHeader'
import { cn } from '../../../components/ui/cn'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import {
  useAtualizarDivida,
  useCriarDivida,
  useDividas,
  useMovimentosDivida,
  useProgramarParcelasDivida,
  useRegistrarPagamentoDivida,
} from '../hooks/useFinanceiro'

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'
const hojeISO = () => new Date().toISOString().slice(0, 10)

type DividaComSaldo = ReturnType<typeof useDividas>['data'] extends (infer T)[] | undefined ? T : never

/**
 * Dívidas (empréstimos das sócias ao estúdio) com abatimento parcial.
 *
 * O quanto já foi pago NÃO é uma coluna: é a soma das saídas que apontam
 * para a dívida (`saidas_financeiras.divida_id`). Isso faz o histórico, o
 * saldo restante e o que aparece em Saídas serem sempre a mesma verdade —
 * e o cronograma de parcelas vira lançamento previsto no mês certo, sem
 * cadastro duplicado.
 */
export function DividasPage() {
  const { data: dividas, isLoading } = useDividas()
  const [nova, setNova] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

  const abertas = useMemo(() => (dividas ?? []).filter((d) => !d.quitada), [dividas])
  const quitadas = useMemo(() => (dividas ?? []).filter((d) => d.quitada), [dividas])

  const totalDevido = abertas.reduce((s, d) => s + d.valor_centavos, 0)
  const totalPago = abertas.reduce((s, d) => s + d.pago_centavos, 0)
  const totalProgramado = abertas.reduce((s, d) => s + d.programado_centavos, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Dívidas"
        subtitulo="Empréstimos a devolver. Cada abatimento vira uma saída no mês em que sai do caixa — mas não conta como despesa no resultado, porque é devolução de capital."
        acoes={
          <Button onClick={() => setNova(true)}>
            <HandCoins className="size-4" />
            Nova dívida
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Falta pagar"
          value={fmtCentavos(totalDevido - totalPago)}
          icon={HandCoins}
          tone="warning"
          hint={`${abertas.length} dívida(s) em aberto`}
        />
        <KpiCard label="Já abatido" value={fmtCentavos(totalPago)} icon={CheckCircle2} tone="success" />
        <KpiCard
          label="Programado"
          value={fmtCentavos(totalProgramado)}
          icon={CalendarPlus}
          tone="brand"
          hint="parcelas já agendadas"
        />
        <KpiCard
          label="Total quitado"
          value={fmtCentavos(quitadas.reduce((s, d) => s + d.valor_centavos, 0))}
          icon={Wallet}
          tone="neutral"
          hint={`${quitadas.length} quitada(s)`}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : (dividas ?? []).length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Nenhuma dívida registrada"
          description="Empréstimos e valores a devolver aparecem aqui."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {[...abertas, ...quitadas].map((d) => (
            <CardDivida
              key={d.id}
              divida={d}
              expandida={expandida === d.id}
              onAlternar={() => setExpandida((e) => (e === d.id ? null : d.id))}
            />
          ))}
        </ul>
      )}

      {nova && <NovaDividaModal onFechar={() => setNova(false)} />}
    </div>
  )
}

function CardDivida({
  divida: d,
  expandida,
  onAlternar,
}: {
  divida: DividaComSaldo
  expandida: boolean
  onAlternar: () => void
}) {
  const atualizar = useAtualizarDivida()
  const [pagando, setPagando] = useState(false)
  const [programando, setProgramando] = useState(false)

  const falta = Math.max(d.valor_centavos - d.pago_centavos, 0)
  const pct = d.valor_centavos > 0 ? Math.min((d.pago_centavos / d.valor_centavos) * 100, 100) : 0
  const coberta = d.pago_centavos >= d.valor_centavos

  return (
    <li
      className={cn(
        'rounded-lg border border-l-4 bg-white p-3.5',
        d.quitada
          ? 'border-neutral-100 border-l-neutral-300 opacity-70'
          : coberta
            ? 'border-neutral-200/80 border-l-success-500'
            : 'border-neutral-200/80 border-l-warning-500',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="neutral">{d.credor}</Badge>
        <span className="flex-1 truncate text-sm text-neutral-600">{d.descricao}</span>
        {d.quitada ? (
          <Badge variant="success">quitada ✓</Badge>
        ) : (
          coberta && <Badge variant="success">100% pago</Badge>
        )}
        <span className="text-sm font-semibold tabular-nums text-neutral-900">{fmtCentavos(d.valor_centavos)}</span>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
          <div
            className={cn('h-full rounded-full transition-all', coberta ? 'bg-success-500' : 'bg-brand-500')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-neutral-500">
          {fmtCentavos(d.pago_centavos)} pago · <strong className="text-neutral-700">{fmtCentavos(falta)} restante</strong>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!d.quitada && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setPagando(true)}>
              <Plus className="size-3.5" />
              Registrar pagamento
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setProgramando(true)}>
              <CalendarPlus className="size-3.5" />
              Programar parcelas
            </Button>
          </>
        )}
        <button onClick={onAlternar} className="text-xs text-neutral-500 underline-offset-2 hover:underline">
          {expandida ? 'Ocultar histórico' : 'Ver histórico'}
        </button>
        <div className="ml-auto">
          {d.quitada ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => atualizar.mutate({ id: d.id, patch: { quitada: false } })}
              loading={atualizar.isPending}
            >
              <RotateCcw className="size-3.5" />
              Reabrir
            </Button>
          ) : (
            <Button
              size="sm"
              variant={coberta ? 'primary' : 'ghost'}
              onClick={() => atualizar.mutate({ id: d.id, patch: { quitada: true } })}
              loading={atualizar.isPending}
            >
              Marcar quitada
            </Button>
          )}
        </div>
      </div>

      {expandida && <Historico dividaId={d.id} />}

      {pagando && <PagamentoModal divida={d} onFechar={() => setPagando(false)} />}
      {programando && <ParcelasModal divida={d} falta={falta} onFechar={() => setProgramando(false)} />}
    </li>
  )
}

function Historico({ dividaId }: { dividaId: string }) {
  const { data: movimentos, isLoading } = useMovimentosDivida(dividaId)

  if (isLoading) return <p className="mt-3 text-xs text-neutral-400">Carregando…</p>
  if ((movimentos ?? []).length === 0) {
    return <p className="mt-3 text-xs text-neutral-400">Nenhum pagamento ou parcela registrada ainda.</p>
  }

  return (
    <ul className="mt-3 flex flex-col gap-1 border-t border-neutral-100 pt-3">
      {(movimentos ?? []).map((m) => {
        const paga = m.status_saida === 'paga'
        return (
          <li key={m.id} className="flex items-center gap-3 text-xs">
            <span className={cn('w-20 shrink-0 font-semibold tabular-nums', paga ? 'text-neutral-800' : 'text-neutral-400')}>
              {fmtCentavos(m.valor_centavos)}
            </span>
            <Badge variant={paga ? 'success' : 'brand'}>{paga ? 'pago' : 'programado'}</Badge>
            <span className="text-neutral-400">
              {paga ? fmtData(m.data_caixa) : `vence ${fmtData(m.data_prevista ?? m.data_caixa)}`}
            </span>
            <span className="flex-1 truncate text-neutral-400">{m.descricao}</span>
          </li>
        )
      })}
    </ul>
  )
}

function PagamentoModal({ divida, onFechar }: { divida: DividaComSaldo; onFechar: () => void }) {
  const registrar = useRegistrarPagamentoDivida()
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeISO())

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos) return
    registrar.mutate(
      {
        dividaId: divida.id,
        descricao: `Abatimento — ${divida.credor}`,
        valorCentavos: centavos,
        data,
      },
      { onSuccess: onFechar },
    )
  }

  return (
    <Modal title="Registrar pagamento" onFechar={onFechar} size="sm">
      <form onSubmit={salvar}>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Valor *</label>
            <Input value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="R$ 0,00" required autoFocus />
          </div>
          <div>
            <label className={labelCls}>Data do pagamento</label>
            <Input type="date" value={data} onChange={(ev) => setData(ev.target.value)} />
          </div>
          <p className="text-[11px] text-neutral-400">
            Entra em Saídas → Dívidas como pago, e abate o saldo desta dívida.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800">
            Cancelar
          </button>
          <Button type="submit" loading={registrar.isPending}>Registrar</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Cronograma: N parcelas a partir de um mês. Cada uma vira saída prevista. */
function ParcelasModal({
  divida,
  falta,
  onFechar,
}: {
  divida: DividaComSaldo
  falta: number
  onFechar: () => void
}) {
  const programar = useProgramarParcelasDivida()
  const [linhas, setLinhas] = useState(() => [
    { mes: new Date().toISOString().slice(0, 7), valor: '' },
  ])

  const soma = linhas.reduce((s, l) => s + (parseCentavos(l.valor) ?? 0), 0)

  function alterar(i: number, campo: 'mes' | 'valor', v: string) {
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, [campo]: v } : l)))
  }

  function adicionar() {
    const ultima = linhas[linhas.length - 1]
    const [ano, mes] = ultima.mes.split('-').map(Number)
    const prox = new Date(ano, mes, 1)
    setLinhas((ls) => [...ls, { mes: prox.toISOString().slice(0, 7), valor: '' }])
  }

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    const parcelas = linhas
      .map((l) => ({ mes: l.mes, valorCentavos: parseCentavos(l.valor) ?? 0 }))
      .filter((p) => p.valorCentavos > 0 && p.mes)
    if (parcelas.length === 0) return
    programar.mutate(
      { dividaId: divida.id, descricao: `Parcela — ${divida.credor}`, parcelas },
      { onSuccess: onFechar },
    )
  }

  return (
    <Modal title="Programar parcelas" onFechar={onFechar}>
      <form onSubmit={salvar}>
        <p className="mb-3 text-xs text-neutral-500">
          Saldo restante: <strong className="text-neutral-800">{fmtCentavos(falta)}</strong>. Cada parcela
          aparece em Saídas → Dívidas no mês dela, como conta a pagar.
        </p>
        <div className="flex flex-col gap-2">
          {linhas.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <label className={labelCls}>Mês</label>
                <Input type="month" value={l.mes} onChange={(ev) => alterar(i, 'mes', ev.target.value)} />
              </div>
              <div className="flex-1">
                <label className={labelCls}>Valor</label>
                <Input value={l.valor} onChange={(ev) => alterar(i, 'valor', ev.target.value)} placeholder="R$ 0,00" />
              </div>
              {linhas.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLinhas((ls) => ls.filter((_, idx) => idx !== i))}
                  className="mb-1.5 rounded p-1 text-neutral-300 transition hover:text-danger-600"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-3">
          <Button size="sm" type="button" variant="ghost" onClick={adicionar}>
            <Plus className="size-3.5" />
            Mais uma parcela
          </Button>
          <span className={cn('ml-auto text-xs tabular-nums', soma > falta ? 'text-warning-700' : 'text-neutral-500')}>
            total {fmtCentavos(soma)}
            {soma > falta && ' — acima do saldo'}
          </span>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800">
            Cancelar
          </button>
          <Button type="submit" loading={programar.isPending}>Programar</Button>
        </div>
      </form>
    </Modal>
  )
}

function NovaDividaModal({ onFechar }: { onFechar: () => void }) {
  const criar = useCriarDivida()
  const [credor, setCredor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos || !credor.trim()) return
    criar.mutate(
      { credor: credor.trim(), descricao: descricao.trim() || null, valor_centavos: centavos },
      { onSuccess: onFechar },
    )
  }

  return (
    <Modal title="Nova dívida" onFechar={onFechar}>
      <form onSubmit={salvar}>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Credor *</label>
            <Input value={credor} onChange={(ev) => setCredor(ev.target.value)} placeholder="Ex.: Marcela" autoFocus required />
          </div>
          <div>
            <label className={labelCls}>Valor total *</label>
            <Input value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="R$ 0,00" required />
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <Input value={descricao} onChange={(ev) => setDescricao(ev.target.value)} placeholder="Ex.: Empréstimo" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800">
            Cancelar
          </button>
          <Button type="submit" loading={criar.isPending}>
            <HandCoins className="size-4" />
            Adicionar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
