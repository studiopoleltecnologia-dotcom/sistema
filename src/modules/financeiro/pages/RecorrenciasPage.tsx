import { useMemo, useState, type FormEvent } from 'react'
import { CalendarClock, CheckCircle2, Plus, Repeat, X } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { KpiCard } from '../../../components/ui/KpiCard'
import { Select } from '../../../components/ui/Select'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { mesAtual, periodoMes } from '../periodo'
import {
  useCategoriasSaida,
  useCriarRecorrente,
  useDesativarRecorrente,
  useLancarRecorrente,
  useRecorrentes,
  useSaidas,
} from '../hooks/useFinanceiro'
import { ORDEM_TIPO_SAIDA, TIPO_SAIDA_LABEL, type TipoSaida } from '../types'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function RecorrenciasPage() {
  const mes = mesAtual()
  const { data: recorrentes, isLoading } = useRecorrentes()
  const { data: saidasMes } = useSaidas(periodoMes(mes))
  const lancar = useLancarRecorrente()
  const desativar = useDesativarRecorrente()
  const [formAberto, setFormAberto] = useState(false)

  const pagasIds = useMemo(
    () => new Set((saidasMes ?? []).map((s) => s.recorrente_id).filter(Boolean) as string[]),
    [saidasMes],
  )

  const lista = useMemo(() => {
    const hoje = new Date()
    const diaHoje = hoje.getDate()
    return (recorrentes ?? [])
      .map((r) => {
        const paga = pagasIds.has(r.id)
        // Próxima cobrança: este mês se ainda não venceu, senão mês que vem.
        const venceEsteMes = r.dia_vencimento >= diaHoje
        const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + (venceEsteMes ? 0 : 1), r.dia_vencimento)
        return { r, paga, proxima: alvo }
      })
      .sort((a, b) => a.r.dia_vencimento - b.r.dia_vencimento)
  }, [recorrentes, pagasIds])

  const comprometido = (recorrentes ?? []).reduce((s, r) => s + r.valor_centavos, 0)
  const pendentesMes = lista.filter((l) => !l.paga)
  const faltaPagar = pendentesMes.reduce((s, l) => s + l.r.valor_centavos, 0)
  const proxima = pendentesMes[0]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-neutral-900">Despesas recorrentes</h2>
          <p className="text-xs text-neutral-400">Cobranças que se repetem todo mês, gerenciadas à parte.</p>
        </div>
        <Button onClick={() => setFormAberto(true)}>
          <Plus className="size-4" />
          Nova recorrência
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Comprometido / mês" value={fmtCentavos(comprometido)} icon={Repeat} tone="brand" hint={`${(recorrentes ?? []).length} recorrência(s)`} />
        <KpiCard label="Falta pagar este mês" value={fmtCentavos(faltaPagar)} icon={CalendarClock} tone={faltaPagar > 0 ? 'warning' : 'success'} hint={`${pendentesMes.length} pendente(s)`} />
        <KpiCard label="Já pago este mês" value={fmtCentavos(comprometido - faltaPagar)} icon={CheckCircle2} tone="success" />
        <KpiCard
          label="Próxima cobrança"
          value={proxima ? `dia ${proxima.r.dia_vencimento}` : '—'}
          icon={CalendarClock}
          tone="neutral"
          hint={proxima ? `${proxima.r.descricao}` : 'tudo pago'}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <EmptyState icon={Repeat} title="Nenhuma recorrência" description="Cadastre aluguel, internet, softwares… e o sistema cobra todo mês." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lista.map(({ r, paga, proxima: prox }) => (
            <li key={r.id} className={`flex items-center gap-3 rounded-lg border bg-white px-3.5 py-2.5 text-sm ${paga ? 'border-neutral-100 opacity-60' : 'border-neutral-200/80'}`}>
              <span className="w-24 shrink-0 font-semibold tabular-nums text-neutral-900">{fmtCentavos(r.valor_centavos)}</span>
              <Badge variant="neutral">{r.categoria?.nome}</Badge>
              <span className="flex-1 truncate text-neutral-600">{r.descricao}</span>
              <span className="hidden shrink-0 text-xs text-neutral-400 sm:inline">
                vence dia {r.dia_vencimento} · próx. {prox.getDate()}/{MESES[prox.getMonth()]}
              </span>
              {paga ? (
                <Badge variant="success">paga ✓</Badge>
              ) : (
                <Button size="sm" onClick={() => lancar.mutate({ recorrente: r, mes })} loading={lancar.isPending}>
                  Pagar
                </Button>
              )}
              <button
                onClick={() => desativar.mutate(r.id)}
                title="Encerrar recorrência (não afeta lançamentos já feitos)"
                className="rounded p-1 text-neutral-300 transition hover:text-danger-600"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-neutral-400">
        Recorrências pendentes já entram no <strong>saldo projetado</strong> do fluxo de caixa, mesmo antes de você clicar em Pagar.
      </p>

      {formAberto && <NovaRecorrenciaModal onFechar={() => setFormAberto(false)} />}
    </div>
  )
}

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

function NovaRecorrenciaModal({ onFechar }: { onFechar: () => void }) {
  const { data: categorias } = useCategoriasSaida()
  const criar = useCriarRecorrente()
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [dia, setDia] = useState('5')

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos || !categoriaId) return
    criar.mutate(
      {
        descricao: descricao.trim() || 'Despesa recorrente',
        valor_centavos: centavos,
        categoria_id: categoriaId,
        dia_vencimento: Math.min(Math.max(Number(dia) || 1, 1), 28),
      },
      { onSuccess: onFechar },
    )
  }

  const categoriasPorTipo = (tipo: TipoSaida) => (categorias ?? []).filter((c) => c.tipo === tipo)

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/20 p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(ev) => ev.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-base font-semibold text-neutral-900">Nova recorrência</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Descrição</label>
            <Input value={descricao} onChange={(ev) => setDescricao(ev.target.value)} placeholder="Ex.: Aluguel" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Valor mensal *</label>
              <Input value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="R$ 0,00" required />
            </div>
            <div>
              <label className={labelCls}>Vence no dia</label>
              <Input type="number" min={1} max={28} value={dia} onChange={(ev) => setDia(ev.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Categoria *</label>
            <Select value={categoriaId} onChange={(ev) => setCategoriaId(ev.target.value)} required>
              <option value="">Escolha…</option>
              {ORDEM_TIPO_SAIDA.map((tipo) => (
                <optgroup key={tipo} label={TIPO_SAIDA_LABEL[tipo]}>
                  {categoriasPorTipo(tipo).map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800">Cancelar</button>
          <Button type="submit" loading={criar.isPending}>
            <Plus className="size-4" />
            Criar
          </Button>
        </div>
      </form>
    </div>
  )
}
