import { useMemo, useState, type FormEvent } from 'react'
import {
  Ban,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Plus,
  RotateCcw,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { KpiCard } from '../../../components/ui/KpiCard'
import { Select } from '../../../components/ui/Select'
import { cn } from '../../../components/ui/cn'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { mesAtual, periodoMes, type Periodo } from '../periodo'
import {
  useAtualizarEntrada,
  useCriarEntrada,
  useEntradas,
  useExcluirEntrada,
} from '../hooks/useFinanceiro'
import {
  CATEGORIAS_ENTRADA,
  CATEGORIA_ENTRADA_LABEL,
  statusEntradaVis,
  type CategoriaEntrada,
  type Entrada,
  type StatusEntradaVis,
} from '../types'

type Filtro = 'todas' | StatusEntradaVis

const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'recebida', label: 'Recebidas' },
  { value: 'pendente', label: 'A receber' },
  { value: 'atrasada', label: 'Atrasadas' },
  { value: 'cancelada', label: 'Canceladas' },
]

const STATUS_INFO: Record<StatusEntradaVis, { label: string; badge: 'success' | 'brand' | 'danger' | 'neutral' }> = {
  recebida: { label: 'Recebida', badge: 'success' },
  pendente: { label: 'A receber', badge: 'brand' },
  atrasada: { label: 'Atrasada', badge: 'danger' },
  cancelada: { label: 'Cancelada', badge: 'neutral' },
}

const hojeISO = () => new Date().toISOString().slice(0, 10)

/** Dia 15 do mês seguinte à competência — regra de repasse Wellhub. */
function previsaoWellhub(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  const prox = new Date(ano, mes, 15)
  return `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, '0')}-15`
}

export function EntradasPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(mesAtual()))
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [formAberto, setFormAberto] = useState(false)

  const { data: entradas, isLoading } = useEntradas(periodo)
  const atualizar = useAtualizarEntrada()
  const excluir = useExcluirEntrada()

  const hoje = hojeISO()
  const linhas = useMemo(
    () =>
      (entradas ?? [])
        .map((e) => ({ e, vis: statusEntradaVis(e, hoje) }))
        .sort((a, b) => (b.e.data_caixa ?? b.e.data_prevista ?? '').localeCompare(a.e.data_caixa ?? a.e.data_prevista ?? '')),
    [entradas, hoje],
  )

  const soma = (v: StatusEntradaVis) => linhas.filter((l) => l.vis === v).reduce((s, l) => s + l.e.valor_centavos, 0)
  const conta = (v: StatusEntradaVis) => linhas.filter((l) => l.vis === v).length

  const visiveis = filtro === 'todas' ? linhas : linhas.filter((l) => l.vis === filtro)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorPeriodo periodo={periodo} onChange={setPeriodo} />
        <Button onClick={() => setFormAberto(true)}>
          <Plus className="size-4" />
          Nova entrada
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Recebido" value={fmtCentavos(soma('recebida'))} icon={Banknote} tone="success" hint={`${conta('recebida')} lançamento(s)`} />
        <KpiCard label="A receber" value={fmtCentavos(soma('pendente'))} icon={CalendarClock} tone="brand" hint={`${conta('pendente')} pendente(s)`} />
        <KpiCard label="Em atraso" value={fmtCentavos(soma('atrasada'))} icon={TriangleAlert} tone={soma('atrasada') > 0 ? 'danger' : 'neutral'} hint={`${conta('atrasada')} vencida(s)`} />
        <KpiCard label="Canceladas" value={fmtCentavos(soma('cancelada'))} icon={Ban} tone="neutral" hint={`${conta('cancelada')} no período`} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const qtd = f.value === 'todas' ? linhas.length : conta(f.value)
          const ativo = filtro === f.value
          return (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition',
                ativo ? 'bg-brand-600 text-white' : 'bg-white text-neutral-500 ring-1 ring-neutral-200 hover:text-neutral-800',
              )}
            >
              {f.label}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', ativo ? 'bg-white/20' : 'bg-neutral-100 text-neutral-500')}>
                {qtd}
              </span>
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <EmptyState icon={Banknote} title="Nada por aqui" description="Nenhuma entrada neste filtro." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visiveis.map(({ e, vis }) => (
            <LinhaEntrada
              key={e.id}
              e={e}
              vis={vis}
              onRecebi={() => atualizar.mutate({ id: e.id, patch: { status: 'recebida', data_caixa: hoje } })}
              onCancelar={() => atualizar.mutate({ id: e.id, patch: { status: 'cancelada' } })}
              onReabrir={() => atualizar.mutate({ id: e.id, patch: { status: 'prevista' } })}
              onExcluir={() => excluir.mutate(e.id)}
            />
          ))}
        </ul>
      )}

      {formAberto && <NovaEntradaModal onFechar={() => setFormAberto(false)} />}
    </div>
  )
}

function LinhaEntrada({
  e,
  vis,
  onRecebi,
  onCancelar,
  onReabrir,
  onExcluir,
}: {
  e: Entrada
  vis: StatusEntradaVis
  onRecebi: () => void
  onCancelar: () => void
  onReabrir: () => void
  onExcluir: () => void
}) {
  const info = STATUS_INFO[vis]
  const dataRotulo =
    vis === 'recebida'
      ? `recebido ${fmtData(e.data_caixa)}`
      : vis === 'cancelada'
        ? `comp. ${fmtData(e.data_competencia)}`
        : `vence ${fmtData(e.data_prevista)}`

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-white px-3.5 py-2.5 text-sm',
        vis === 'atrasada' ? 'border-danger-200' : 'border-neutral-200/80',
      )}
    >
      <span
        className={cn(
          'w-24 shrink-0 font-semibold tabular-nums',
          vis === 'cancelada' ? 'text-neutral-400 line-through' : 'text-neutral-900',
        )}
      >
        {fmtCentavos(e.valor_centavos)}
      </span>
      <Badge variant={info.badge}>{info.label}</Badge>
      <span className="hidden shrink-0 text-xs text-neutral-400 sm:inline">
        {CATEGORIA_ENTRADA_LABEL[e.categoria]}
      </span>
      <span className="flex-1 truncate text-neutral-500">{e.descricao}</span>
      <span className="hidden shrink-0 text-xs text-neutral-400 md:inline">{dataRotulo}</span>

      {(vis === 'pendente' || vis === 'atrasada') && (
        <>
          <Button size="sm" variant="secondary" onClick={onRecebi}>
            <CheckCircle2 className="size-3.5" />
            Recebi
          </Button>
          <button onClick={onCancelar} title="Cancelar" className="rounded p-1 text-neutral-300 transition hover:text-warning-600">
            <Ban className="size-3.5" />
          </button>
        </>
      )}
      {vis === 'cancelada' && (
        <button onClick={onReabrir} title="Reabrir" className="rounded p-1 text-neutral-400 transition hover:text-brand-600">
          <RotateCcw className="size-3.5" />
        </button>
      )}
      <button onClick={onExcluir} title="Excluir" className="rounded p-1 text-neutral-300 transition hover:text-danger-600">
        <X className="size-3.5" />
      </button>
    </li>
  )
}

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

function NovaEntradaModal({ onFechar }: { onFechar: () => void }) {
  const criar = useCriarEntrada()
  const hoje = hojeISO()
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState<CategoriaEntrada>('mensalista')
  const [recebida, setRecebida] = useState(true)
  const [data, setData] = useState(hoje)

  function lancar(ev: FormEvent) {
    ev.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos) return
    criar.mutate(
      {
        descricao: descricao.trim() || null,
        valor_centavos: centavos,
        categoria,
        status: recebida ? 'recebida' : 'prevista',
        data_competencia: data,
        data_caixa: recebida ? data : null,
        data_prevista: recebida
          ? null
          : categoria === 'wellhub' || categoria === 'classpass'
            ? previsaoWellhub(data)
            : data,
      },
      { onSuccess: onFechar },
    )
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/20 p-4" onClick={onFechar}>
      <form
        onSubmit={lancar}
        onClick={(ev) => ev.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="mb-4 text-base font-semibold text-neutral-900">Nova entrada</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Valor *</label>
            <Input value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="R$ 0,00" required autoFocus />
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <Input value={descricao} onChange={(ev) => setDescricao(ev.target.value)} placeholder="Opcional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Categoria</label>
              <Select value={categoria} onChange={(ev) => setCategoria(ev.target.value as CategoriaEntrada)}>
                {CATEGORIAS_ENTRADA.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className={labelCls}>{recebida ? 'Data do recebimento' : 'Competência'}</label>
              <Input type="date" value={data} onChange={(ev) => setData(ev.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={recebida} onChange={(ev) => setRecebida(ev.target.checked)} className="accent-brand-600" />
            Já recebido (entra no caixa)
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800">
            Cancelar
          </button>
          <Button type="submit" loading={criar.isPending}>
            <Plus className="size-4" />
            Lançar
          </Button>
        </div>
      </form>
    </div>
  )
}
