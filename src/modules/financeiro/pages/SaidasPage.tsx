import { useMemo, useState, type FormEvent } from 'react'
import { Plus, RotateCcw, TrendingDown, X } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { CardColapsavel } from '../../../components/ui/CardColapsavel'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { KpiCard } from '../../../components/ui/KpiCard'
import { Select } from '../../../components/ui/Select'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { mesAtual, periodoMes, type Periodo } from '../periodo'
import {
  useCategoriasSaida,
  useCriarCategoriaSaida,
  useCriarRecorrente,
  useCriarSaida,
  useExcluirSaida,
  useLancarRecorrente,
  useSaidas,
} from '../hooks/useFinanceiro'
import { ORDEM_TIPO_SAIDA, TIPO_SAIDA_DESCRICAO, TIPO_SAIDA_LABEL, type TipoSaida } from '../types'

const hojeISO = () => new Date().toISOString().slice(0, 10)

export function SaidasPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(mesAtual()))
  const [formAberto, setFormAberto] = useState(false)
  const { data: saidas, isLoading } = useSaidas(periodo)
  const excluir = useExcluirSaida()

  const porTipo = useMemo(() => {
    const m = new Map<TipoSaida, NonNullable<typeof saidas>>()
    for (const tipo of ORDEM_TIPO_SAIDA) m.set(tipo, [])
    for (const s of saidas ?? []) {
      const tipo = (s.categoria?.tipo ?? 'variavel') as TipoSaida
      m.get(tipo)!.push(s)
    }
    return m
  }, [saidas])

  const somaTipo = (tipo: TipoSaida) => (porTipo.get(tipo) ?? []).reduce((s, x) => s + x.valor_centavos, 0)
  const total = ORDEM_TIPO_SAIDA.reduce((s, t) => s + somaTipo(t), 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorPeriodo periodo={periodo} onChange={setPeriodo} />
        <Button onClick={() => setFormAberto(true)}>
          <Plus className="size-4" />
          Nova saída
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total do período" value={fmtCentavos(total)} icon={TrendingDown} tone="danger" />
        <KpiCard label="Fixas" value={fmtCentavos(somaTipo('fixa'))} tone="neutral" hint="custo de manter as portas abertas" />
        <KpiCard label="Variáveis" value={fmtCentavos(somaTipo('variavel'))} tone="neutral" hint="dependem da operação" />
        <KpiCard label="Planejadas" value={fmtCentavos(somaTipo('fixa_planejada'))} tone="neutral" hint="previstas, não mensais" />
      </div>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {ORDEM_TIPO_SAIDA.map((tipo) => {
        const lista = porTipo.get(tipo) ?? []
        return (
          <CardColapsavel
            key={tipo}
            title={TIPO_SAIDA_LABEL[tipo]}
            subtitle={TIPO_SAIDA_DESCRICAO[tipo]}
            persistKey={`fin-saidas-${tipo}`}
            right={<span className="text-sm font-semibold tabular-nums text-neutral-700">{fmtCentavos(somaTipo(tipo))}</span>}
          >
            {lista.length === 0 ? (
              <EmptyState title={`Nada em ${TIPO_SAIDA_LABEL[tipo].toLowerCase()} no período.`} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {lista.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-lg border border-neutral-200/80 bg-white px-3.5 py-2.5 text-sm">
                    <span className="w-24 shrink-0 font-semibold tabular-nums text-neutral-900">{fmtCentavos(s.valor_centavos)}</span>
                    <Badge variant="neutral">{s.categoria?.nome}</Badge>
                    <span className="flex-1 truncate text-neutral-500">
                      {s.descricao}
                      {s.recorrente_id && <RotateCcw className="ml-1.5 inline-block size-3 text-brand-500" aria-label="De uma recorrência" />}
                    </span>
                    <span className="hidden shrink-0 text-xs text-neutral-400 sm:inline">{fmtData(s.data_caixa)}</span>
                    <button onClick={() => excluir.mutate(s.id)} title="Excluir" className="rounded p-1 text-neutral-300 transition hover:text-danger-600">
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardColapsavel>
        )
      })}

      {formAberto && <NovaSaidaModal onFechar={() => setFormAberto(false)} />}
    </div>
  )
}

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

function NovaSaidaModal({ onFechar }: { onFechar: () => void }) {
  const { data: categorias } = useCategoriasSaida()
  const criar = useCriarSaida()
  const criarCategoria = useCriarCategoriaSaida()
  const criarRecorrente = useCriarRecorrente()
  const lancarRecorrente = useLancarRecorrente()

  const hoje = hojeISO()
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [data, setData] = useState(hoje)
  const [recorrente, setRecorrente] = useState(false)
  const [nova, setNova] = useState<{ nome: string; tipo: TipoSaida } | null>(null)

  const categoriasPorTipo = (tipo: TipoSaida) => (categorias ?? []).filter((c) => c.tipo === tipo)

  function salvarCategoria() {
    if (!nova?.nome.trim()) return
    criarCategoria.mutate(
      { nome: nova.nome.trim(), tipo: nova.tipo },
      { onSuccess: (cat) => { setCategoriaId(cat.id); setNova(null) } },
    )
  }

  function lancar(ev: FormEvent) {
    ev.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos || !categoriaId) return
    if (recorrente) {
      criarRecorrente.mutate(
        {
          descricao: descricao.trim() || 'Despesa recorrente',
          valor_centavos: centavos,
          categoria_id: categoriaId,
          dia_vencimento: Math.min(Number(data.slice(8, 10)), 28),
        },
        { onSuccess: (rec) => lancarRecorrente.mutate({ recorrente: rec, mes: data.slice(0, 7) }, { onSuccess: onFechar }) },
      )
    } else {
      criar.mutate(
        { descricao: descricao.trim() || null, valor_centavos: centavos, categoria_id: categoriaId, data_caixa: data },
        { onSuccess: onFechar },
      )
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/20 p-4" onClick={onFechar}>
      <form onSubmit={lancar} onClick={(ev) => ev.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-base font-semibold text-neutral-900">Nova saída</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Valor *</label>
            <Input value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="R$ 0,00" required autoFocus />
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <Input value={descricao} onChange={(ev) => setDescricao(ev.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className={labelCls}>Categoria *</label>
            <Select
              value={categoriaId}
              onChange={(ev) => (ev.target.value === '__nova__' ? setNova({ nome: '', tipo: 'variavel' }) : setCategoriaId(ev.target.value))}
              required
            >
              <option value="">Escolha…</option>
              {ORDEM_TIPO_SAIDA.map((tipo) => (
                <optgroup key={tipo} label={TIPO_SAIDA_LABEL[tipo]}>
                  {categoriasPorTipo(tipo).map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </optgroup>
              ))}
              <option value="__nova__">+ Nova categoria…</option>
            </Select>
          </div>

          {nova && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-neutral-50 p-3">
              <div className="flex-1">
                <label className={labelCls}>Nome</label>
                <Input autoFocus value={nova.nome} onChange={(ev) => setNova({ ...nova, nome: ev.target.value })} placeholder="Ex.: Energia" />
              </div>
              <Select value={nova.tipo} onChange={(ev) => setNova({ ...nova, tipo: ev.target.value as TipoSaida })} className="w-36">
                {ORDEM_TIPO_SAIDA.map((tipo) => (
                  <option key={tipo} value={tipo}>{TIPO_SAIDA_LABEL[tipo]}</option>
                ))}
              </Select>
              <Button size="sm" type="button" onClick={salvarCategoria} loading={criarCategoria.isPending}>Criar</Button>
            </div>
          )}

          <div>
            <label className={labelCls}>Data</label>
            <Input type="date" value={data} onChange={(ev) => setData(ev.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600" title="Cria o modelo mensal e já lança este mês">
            <input type="checkbox" checked={recorrente} onChange={(ev) => setRecorrente(ev.target.checked)} className="accent-brand-600" />
            Repetir todo mês (recorrência)
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800">Cancelar</button>
          <Button type="submit" loading={criar.isPending || criarRecorrente.isPending}>
            <Plus className="size-4" />
            Lançar
          </Button>
        </div>
      </form>
    </div>
  )
}
