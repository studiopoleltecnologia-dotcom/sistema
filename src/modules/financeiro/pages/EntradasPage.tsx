import { useMemo, useState, type FormEvent } from 'react'
import {
  Ban,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { useConfirmar } from '../../../components/ui/ConfirmarAcao'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FiltroChips } from '../../../components/ui/FiltroChips'
import { Input } from '../../../components/ui/Input'
import { KpiCard } from '../../../components/ui/KpiCard'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Select } from '../../../components/ui/Select'
import { cn } from '../../../components/ui/cn'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { mesAtual, periodoMes, type Periodo } from '../periodo'
import { LINHA_BASE, STATUS_FIN, type StatusFin } from '../statusVisual'
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

/** Mesma escala de cor de Saídas (statusVisual.ts): verde entrou, âmbar vem, vermelho atrasou. */
const STATUS_INFO: Record<StatusEntradaVis, { label: string; status: StatusFin }> = {
  recebida: { label: 'Recebida', status: 'pago' },
  pendente: { label: 'A receber', status: 'aberto' },
  atrasada: { label: 'Atrasada', status: 'atrasado' },
  cancelada: { label: 'Cancelada', status: 'cancelado' },
}

const hojeISO = () => new Date().toISOString().slice(0, 10)

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function mesAno(iso: string) {
  const [ano, mes] = iso.slice(0, 7).split('-').map(Number)
  return `${MESES_ABREV[mes - 1]}/${ano}`
}

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
  const confirmar = useConfirmar()

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
      <PageHeader
        titulo="Entradas"
        subtitulo="Tudo que entra no caixa — recebido e a receber"
        acoes={
          <Button onClick={() => setFormAberto(true)}>
            <Plus className="size-4" />
            Nova entrada
          </Button>
        }
        filtros={<SeletorPeriodo periodo={periodo} onChange={setPeriodo} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Recebido" value={fmtCentavos(soma('recebida'))} icon={Banknote} tone="success" hint={`${conta('recebida')} lançamento(s)`} />
        <KpiCard label="A receber" value={fmtCentavos(soma('pendente'))} icon={CalendarClock} tone="brand" hint={`${conta('pendente')} pendente(s)`} />
        <KpiCard label="Em atraso" value={fmtCentavos(soma('atrasada'))} icon={TriangleAlert} tone={soma('atrasada') > 0 ? 'danger' : 'neutral'} hint={`${conta('atrasada')} vencida(s)`} />
        <KpiCard label="Canceladas" value={fmtCentavos(soma('cancelada'))} icon={Ban} tone="neutral" hint={`${conta('cancelada')} no período`} />
      </div>

      <FiltroChips
        value={filtro}
        onChange={setFiltro}
        items={FILTROS.map((f) => ({
          ...f,
          qtd: f.value === 'todas' ? linhas.length : conta(f.value),
        }))}
      />

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
              // Volta para "a receber": limpa a data de caixa (o dinheiro não
              // entrou) e devolve um vencimento, senão a linha ficaria sem data.
              onReabrir={() =>
                atualizar.mutate({
                  id: e.id,
                  patch: {
                    status: 'prevista',
                    data_caixa: null,
                    data_prevista: e.data_prevista ?? e.data_caixa,
                  },
                })
              }
              onExcluir={() =>
                confirmar.pedir({
                  titulo: 'Excluir este lançamento?',
                  descricao: (
                    <>
                      <b>
                        {fmtCentavos(e.valor_centavos)} —{' '}
                        {e.descricao || CATEGORIA_ENTRADA_LABEL[e.categoria]}
                      </b>{' '}
                      sai do faturamento, do fluxo de caixa e do teto MEI.
                      <br />
                      Para só desfazer o status, use os botões da linha em vez de excluir.
                    </>
                  ),
                  aoConfirmar: () => excluir.mutateAsync(e.id),
                })
              }
            />
          ))}
        </ul>
      )}

      {formAberto && <NovaEntradaModal onFechar={() => setFormAberto(false)} />}
      {confirmar.dialogo}
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

  // Repasse Wellhub/ClassPass cai num mês mas é operação do mês anterior —
  // sinalizar isso na própria linha (antes só existia numa tela separada).
  const competenciaDiferente =
    (vis === 'pendente' || vis === 'atrasada') &&
    !!e.data_competencia &&
    !!e.data_prevista &&
    e.data_competencia.slice(0, 7) !== e.data_prevista.slice(0, 7)

  const tokens = STATUS_FIN[info.status]

  return (
    <li className={cn(LINHA_BASE, tokens.barra)}>
      <span className={cn('w-24 shrink-0 font-semibold tabular-nums', tokens.valor)}>
        {fmtCentavos(e.valor_centavos)}
      </span>
      <Badge variant={tokens.badge}>{info.label}</Badge>
      <span className="hidden shrink-0 text-xs text-neutral-400 sm:inline">
        {CATEGORIA_ENTRADA_LABEL[e.categoria]}
      </span>
      <span className="flex-1 truncate text-neutral-500">{e.descricao}</span>
      {competenciaDiferente && (
        <span className="hidden shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 sm:inline">
          competência {mesAno(e.data_competencia!)}
        </span>
      )}
      <span className="hidden shrink-0 text-xs text-neutral-400 md:inline">{dataRotulo}</span>

      {(vis === 'pendente' || vis === 'atrasada') && (
        <>
          <Button size="sm" variant="secondary" onClick={onRecebi} title="Marcar como recebida">
            <CheckCircle2 className="size-3.5" />
            <span className="hidden sm:inline">Marcar como recebida</span>
          </Button>
          <button onClick={onCancelar} title="Cancelar" className="rounded p-1 text-neutral-300 transition hover:text-warning-600">
            <Ban className="size-3.5" />
          </button>
        </>
      )}
      {/* Desfazer o recebimento marcado por engano — sem apagar o lançamento. */}
      {vis === 'recebida' && (
        <Button size="sm" variant="ghost" onClick={onReabrir} title="Voltar para A receber (não exclui)">
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Marcar como não recebida</span>
        </Button>
      )}
      {vis === 'cancelada' && (
        <button onClick={onReabrir} title="Reabrir" className="rounded p-1 text-neutral-400 transition hover:text-brand-600">
          <RotateCcw className="size-3.5" />
        </button>
      )}
      <button
        onClick={onExcluir}
        title="Excluir lançamento"
        className="ml-1 shrink-0 rounded p-1 text-neutral-300 transition hover:bg-danger-50 hover:text-danger-600"
      >
        <Trash2 className="size-3.5" />
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
