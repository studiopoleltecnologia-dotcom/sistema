import { useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, HandCoins } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { KpiCard } from '../../../components/ui/KpiCard'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { useAtualizarDivida, useCriarDivida, useDividas } from '../hooks/useFinanceiro'

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

export function DividasPage() {
  const { data: dividas, isLoading } = useDividas()
  const atualizar = useAtualizarDivida()
  const [formAberto, setFormAberto] = useState(false)

  const abertas = useMemo(() => (dividas ?? []).filter((d) => !d.quitada), [dividas])
  const quitadas = useMemo(() => (dividas ?? []).filter((d) => d.quitada), [dividas])
  const totalAberto = abertas.reduce((s, d) => s + d.valor_centavos, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-neutral-900">Dívidas</h2>
          <p className="text-xs text-neutral-400">
            Valores que o estúdio precisa devolver. Sem forma de pagamento definida ainda — por
            isso não entram no fluxo de caixa nem em Contas a pagar.
          </p>
        </div>
        <Button onClick={() => setFormAberto(true)}>
          <HandCoins className="size-4" />
          Nova dívida
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total em aberto"
          value={fmtCentavos(totalAberto)}
          icon={HandCoins}
          tone="warning"
          hint={`${abertas.length} dívida(s)`}
        />
        <KpiCard
          label="Já quitado"
          value={fmtCentavos(quitadas.reduce((s, d) => s + d.valor_centavos, 0))}
          icon={CheckCircle2}
          tone="success"
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
        <ul className="flex flex-col gap-1.5">
          {[...abertas, ...quitadas].map((d) => (
            <li
              key={d.id}
              className={`flex items-center gap-3 rounded-lg border bg-white px-3.5 py-2.5 text-sm ${d.quitada ? 'border-neutral-100 opacity-60' : 'border-neutral-200/80'}`}
            >
              <span className="w-24 shrink-0 font-semibold tabular-nums text-neutral-900">
                {fmtCentavos(d.valor_centavos)}
              </span>
              <Badge variant="neutral">{d.credor}</Badge>
              <span className="flex-1 truncate text-neutral-600">{d.descricao}</span>
              {d.quitada ? (
                <Badge variant="success">quitada ✓</Badge>
              ) : (
                <Button
                  size="sm"
                  onClick={() => atualizar.mutate({ id: d.id, patch: { quitada: true } })}
                  loading={atualizar.isPending}
                >
                  Quitar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {formAberto && <NovaDividaModal onFechar={() => setFormAberto(false)} />}
    </div>
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
      {
        credor: credor.trim(),
        descricao: descricao.trim() || null,
        valor_centavos: centavos,
      },
      { onSuccess: onFechar },
    )
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/20 p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(ev) => ev.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-base font-semibold text-neutral-900">Nova dívida</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Credor</label>
            <Input value={credor} onChange={(ev) => setCredor(ev.target.value)} placeholder="Ex.: Marcela" autoFocus required />
          </div>
          <div>
            <label className={labelCls}>Valor *</label>
            <Input value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="R$ 0,00" required />
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <Input value={descricao} onChange={(ev) => setDescricao(ev.target.value)} placeholder="Ex.: Empréstimo" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800">Cancelar</button>
          <Button type="submit" loading={criar.isPending}>
            <HandCoins className="size-4" />
            Adicionar
          </Button>
        </div>
      </form>
    </div>
  )
}
