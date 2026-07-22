import { useState, type FormEvent } from 'react'
import { CheckCircle2, Plus, X } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import {
  useAtualizarEntrada,
  useCriarEntrada,
  useExcluirEntrada,
  useEntradas,
} from '../hooks/useFinanceiro'
import {
  CATEGORIAS_ENTRADA,
  CATEGORIA_ENTRADA_LABEL,
  type CategoriaEntrada,
  type Entrada,
} from '../types'

/** Dia 15 do mês seguinte à competência — regra de repasse Wellhub (CLAUDE.md 12.6). */
function previsaoWellhub(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  const prox = new Date(ano, mes, 15)
  return `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, '0')}-15`
}

export function EntradasTab({ mes }: { mes: string }) {
  const { data: entradas, isLoading } = useEntradas(mes)
  const criar = useCriarEntrada()
  const atualizar = useAtualizarEntrada()
  const excluir = useExcluirEntrada()

  const hoje = new Date().toISOString().slice(0, 10)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState<CategoriaEntrada>('mensalista')
  const [recebida, setRecebida] = useState(true)
  const [data, setData] = useState(hoje)

  function lancar(e: FormEvent) {
    e.preventDefault()
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
      {
        onSuccess: () => {
          setDescricao('')
          setValor('')
        },
      },
    )
  }

  function marcarRecebida(entrada: Entrada) {
    atualizar.mutate({ id: entrada.id, patch: { status: 'recebida', data_caixa: hoje } })
  }

  const previstas = (entradas ?? []).filter((e) => e.status === 'prevista')
  const recebidas = (entradas ?? []).filter((e) => e.status === 'recebida')

  return (
    <div>
      <form onSubmit={lancar} className="mb-5 flex flex-wrap items-end gap-2">
        <Input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição (opcional)"
          className="w-44"
        />
        <Input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="R$ 0,00"
          required
          className="w-24"
        />
        <Select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as CategoriaEntrada)}
          className="w-40"
        >
          {CATEGORIAS_ENTRADA.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-40" />
        <label className="flex items-center gap-1.5 px-1 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={recebida}
            onChange={(e) => setRecebida(e.target.checked)}
            className="accent-brand-600"
          />
          já recebido
        </label>
        <Button type="submit" loading={criar.isPending}>
          <Plus className="size-4" />
          Lançar
        </Button>
      </form>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {previstas.length > 0 && (
        <>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500">
            A RECEBER / A RECONCILIAR
          </h3>
          <ul className="mb-5 flex flex-col gap-1.5">
            {previstas.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-md border border-dashed border-neutral-200 bg-white px-3 py-2.5 text-sm"
              >
                <span className="w-24 font-medium text-neutral-900">
                  {fmtCentavos(e.valor_centavos)}
                </span>
                <Badge variant="brand">{CATEGORIA_ENTRADA_LABEL[e.categoria]}</Badge>
                <span className="flex-1 truncate text-neutral-500">{e.descricao}</span>
                <span className="text-xs text-neutral-400">
                  previsto {fmtData(e.data_prevista)}
                </span>
                <Button size="sm" variant="secondary" onClick={() => marcarRecebida(e)}>
                  <CheckCircle2 className="size-3.5" />
                  Recebi
                </Button>
                <button
                  onClick={() => excluir.mutate(e.id)}
                  className="rounded p-0.5 text-neutral-300 transition hover:text-danger-600"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500">
        RECEBIDAS NO MÊS
      </h3>
      {!isLoading && recebidas.length === 0 ? (
        <EmptyState title="Nenhuma entrada recebida no mês." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {recebidas.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-md border border-neutral-100 bg-white px-3 py-2.5 text-sm"
            >
              <span className="w-24 font-medium text-neutral-900">
                {fmtCentavos(e.valor_centavos)}
              </span>
              <Badge variant="success">{CATEGORIA_ENTRADA_LABEL[e.categoria]}</Badge>
              <span className="flex-1 truncate text-neutral-500">{e.descricao}</span>
              <span className="text-xs text-neutral-400">{fmtData(e.data_caixa)}</span>
              <button
                onClick={() => excluir.mutate(e.id)}
                className="rounded p-0.5 text-neutral-300 transition hover:text-danger-600"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
