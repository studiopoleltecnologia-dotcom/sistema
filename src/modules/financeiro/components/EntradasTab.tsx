import { useState, type FormEvent } from 'react'
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

const inputCls =
  'rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500'

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
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição (opcional)"
          className={`${inputCls} w-44`}
        />
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="R$ 0,00"
          required
          className={`${inputCls} w-24`}
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as CategoriaEntrada)}
          className={inputCls}
        >
          {CATEGORIAS_ENTRADA.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className={inputCls}
        />
        <label className="flex items-center gap-1.5 px-1 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={recebida}
            onChange={(e) => setRecebida(e.target.checked)}
            className="accent-brand-600"
          />
          já recebido
        </label>
        <button
          type="submit"
          disabled={criar.isPending}
          className="rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          Lançar
        </button>
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
                className="flex items-center gap-3 rounded-md border border-dashed border-neutral-200 px-3 py-2 text-sm"
              >
                <span className="w-24 font-medium text-neutral-900">
                  {fmtCentavos(e.valor_centavos)}
                </span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
                  {CATEGORIA_ENTRADA_LABEL[e.categoria]}
                </span>
                <span className="flex-1 truncate text-neutral-500">{e.descricao}</span>
                <span className="text-xs text-neutral-400">
                  previsto {fmtData(e.data_prevista)}
                </span>
                <button
                  onClick={() => marcarRecebida(e)}
                  className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
                >
                  Recebi
                </button>
                <button
                  onClick={() => excluir.mutate(e.id)}
                  className="text-xs text-neutral-300 transition hover:text-red-500"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500">
        RECEBIDAS NO MÊS
      </h3>
      <ul className="flex flex-col gap-1.5">
        {recebidas.map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
          >
            <span className="w-24 font-medium text-neutral-900">
              {fmtCentavos(e.valor_centavos)}
            </span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
              {CATEGORIA_ENTRADA_LABEL[e.categoria]}
            </span>
            <span className="flex-1 truncate text-neutral-500">{e.descricao}</span>
            <span className="text-xs text-neutral-400">{fmtData(e.data_caixa)}</span>
            <button
              onClick={() => excluir.mutate(e.id)}
              className="text-xs text-neutral-300 transition hover:text-red-500"
            >
              ×
            </button>
          </li>
        ))}
        {!isLoading && recebidas.length === 0 && (
          <li className="py-2 text-sm text-neutral-300">Nenhuma entrada recebida no mês.</li>
        )}
      </ul>
    </div>
  )
}
