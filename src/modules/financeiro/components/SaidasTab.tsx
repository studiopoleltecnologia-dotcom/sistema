import { useState, type FormEvent } from 'react'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import {
  useCategoriasSaida,
  useCriarCategoriaSaida,
  useCriarSaida,
  useExcluirSaida,
  useSaidas,
} from '../hooks/useFinanceiro'
import { TIPO_SAIDA_LABEL, type TipoSaida } from '../types'

const inputCls =
  'rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500'

export function SaidasTab({ mes }: { mes: string }) {
  const { data: saidas, isLoading } = useSaidas(mes)
  const { data: categorias } = useCategoriasSaida()
  const criar = useCriarSaida()
  const excluir = useExcluirSaida()
  const criarCategoria = useCriarCategoriaSaida()

  const hoje = new Date().toISOString().slice(0, 10)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [data, setData] = useState(hoje)
  const [novaCategoria, setNovaCategoria] = useState<{ nome: string; tipo: TipoSaida } | null>(null)

  function lancar(e: FormEvent) {
    e.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos || !categoriaId) return
    criar.mutate(
      {
        descricao: descricao.trim() || null,
        valor_centavos: centavos,
        categoria_id: categoriaId,
        data_caixa: data,
      },
      {
        onSuccess: () => {
          setDescricao('')
          setValor('')
        },
      },
    )
  }

  function salvarCategoria() {
    if (!novaCategoria || !novaCategoria.nome.trim()) return
    criarCategoria.mutate(
      { nome: novaCategoria.nome.trim(), tipo: novaCategoria.tipo },
      {
        onSuccess: (cat) => {
          setCategoriaId(cat.id)
          setNovaCategoria(null)
        },
      },
    )
  }

  const fixas = (categorias ?? []).filter((c) => c.tipo === 'fixa')
  const variaveis = (categorias ?? []).filter((c) => c.tipo === 'variavel')
  const totalMes = (saidas ?? []).reduce((s, x) => s + x.valor_centavos, 0)

  return (
    <div>
      <form onSubmit={lancar} className="mb-2 flex flex-wrap items-end gap-2">
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
          value={categoriaId}
          onChange={(e) => {
            if (e.target.value === '__nova__') {
              setNovaCategoria({ nome: '', tipo: 'variavel' })
            } else {
              setCategoriaId(e.target.value)
            }
          }}
          required
          className={inputCls}
        >
          <option value="">Categoria…</option>
          <optgroup label="Fixas">
            {fixas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </optgroup>
          <optgroup label="Variáveis">
            {variaveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </optgroup>
          <option value="__nova__">+ Nova categoria…</option>
        </select>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className={inputCls}
        />
        <button
          type="submit"
          disabled={criar.isPending}
          className="rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          Lançar
        </button>
      </form>

      {novaCategoria && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-neutral-50 p-2">
          <input
            autoFocus
            value={novaCategoria.nome}
            onChange={(e) => setNovaCategoria({ ...novaCategoria, nome: e.target.value })}
            placeholder="Nome da categoria"
            className={`${inputCls} w-44`}
          />
          <select
            value={novaCategoria.tipo}
            onChange={(e) =>
              setNovaCategoria({ ...novaCategoria, tipo: e.target.value as TipoSaida })
            }
            className={inputCls}
          >
            <option value="fixa">Fixa</option>
            <option value="variavel">Variável</option>
          </select>
          <button
            onClick={salvarCategoria}
            disabled={criarCategoria.isPending}
            className="rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            Criar
          </button>
          <button
            onClick={() => setNovaCategoria(null)}
            className="px-1 text-xs text-neutral-400 hover:text-neutral-700"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="mb-2 mt-4 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-neutral-500">SAÍDAS DO MÊS</h3>
        <span className="text-xs text-neutral-400">total {fmtCentavos(totalMes)}</span>
      </div>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}
      <ul className="flex flex-col gap-1.5">
        {(saidas ?? []).map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
          >
            <span className="w-24 font-medium text-neutral-900">
              {fmtCentavos(s.valor_centavos)}
            </span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
              {s.categoria?.nome} · {s.categoria ? TIPO_SAIDA_LABEL[s.categoria.tipo] : ''}
            </span>
            <span className="flex-1 truncate text-neutral-500">{s.descricao}</span>
            <span className="text-xs text-neutral-400">{fmtData(s.data_caixa)}</span>
            <button
              onClick={() => excluir.mutate(s.id)}
              className="text-xs text-neutral-300 transition hover:text-red-500"
            >
              ×
            </button>
          </li>
        ))}
        {!isLoading && (saidas ?? []).length === 0 && (
          <li className="py-2 text-sm text-neutral-300">Nenhuma saída no mês.</li>
        )}
      </ul>
    </div>
  )
}
