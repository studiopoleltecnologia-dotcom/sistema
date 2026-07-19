import { useState, type FormEvent } from 'react'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import {
  useCategoriasSaida,
  useCriarCategoriaSaida,
  useCriarRecorrente,
  useCriarSaida,
  useDesativarRecorrente,
  useExcluirSaida,
  useLancarRecorrente,
  useRecorrentes,
  useSaidas,
} from '../hooks/useFinanceiro'
import type { TipoSaida } from '../types'

const inputCls =
  'rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500'

export function SaidasTab({ mes }: { mes: string }) {
  const { data: saidas, isLoading } = useSaidas(mes)
  const { data: categorias } = useCategoriasSaida()
  const { data: recorrentes } = useRecorrentes()
  const criar = useCriarSaida()
  const excluir = useExcluirSaida()
  const criarCategoria = useCriarCategoriaSaida()
  const criarRecorrente = useCriarRecorrente()
  const desativarRecorrente = useDesativarRecorrente()
  const lancarRecorrente = useLancarRecorrente()

  const hoje = new Date().toISOString().slice(0, 10)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [data, setData] = useState(hoje)
  const [recorrente, setRecorrente] = useState(false)
  const [novaCategoria, setNovaCategoria] = useState<{ nome: string; tipo: TipoSaida } | null>(null)

  function lancar(e: FormEvent) {
    e.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos || !categoriaId) return
    const aposLancar = () => {
      setDescricao('')
      setValor('')
      setRecorrente(false)
    }
    if (recorrente) {
      // cria o modelo mensal e o lançamento deste mês já vinculado
      criarRecorrente.mutate(
        {
          descricao: descricao.trim() || 'Despesa recorrente',
          valor_centavos: centavos,
          categoria_id: categoriaId,
          dia_vencimento: Math.min(Number(data.slice(8, 10)), 28),
        },
        {
          onSuccess: (rec) =>
            lancarRecorrente.mutate(
              { recorrente: rec, mes: data.slice(0, 7) },
              { onSuccess: aposLancar },
            ),
        },
      )
    } else {
      criar.mutate(
        {
          descricao: descricao.trim() || null,
          valor_centavos: centavos,
          categoria_id: categoriaId,
          data_caixa: data,
        },
        { onSuccess: aposLancar },
      )
    }
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

  // recorrentes já lançadas neste mês (pelo vínculo recorrente_id)
  const lancadasIds = new Set(
    (saidas ?? []).map((s) => s.recorrente_id).filter(Boolean) as string[],
  )

  const saidasFixas = (saidas ?? []).filter((s) => s.categoria?.tipo === 'fixa')
  const saidasVariaveis = (saidas ?? []).filter((s) => s.categoria?.tipo === 'variavel')
  const total = (lista: { valor_centavos: number }[]) =>
    lista.reduce((s, x) => s + x.valor_centavos, 0)

  const ItemSaida = ({ s }: { s: NonNullable<typeof saidas>[number] }) => (
    <li className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm">
      <span className="w-24 font-medium text-neutral-900">{fmtCentavos(s.valor_centavos)}</span>
      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
        {s.categoria?.nome}
      </span>
      <span className="flex-1 truncate text-neutral-500">
        {s.descricao}
        {s.recorrente_id && (
          <span className="ml-1.5 text-[10px] text-brand-600" title="Lançada de uma despesa recorrente">
            ↻
          </span>
        )}
      </span>
      <span className="text-xs text-neutral-400">{fmtData(s.data_caixa)}</span>
      <button
        onClick={() => excluir.mutate(s.id)}
        className="text-xs text-neutral-300 transition hover:text-red-500"
      >
        ×
      </button>
    </li>
  )

  return (
    <div className="max-w-3xl">
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
        <label
          className="flex items-center gap-1.5 px-1 text-sm text-neutral-600"
          title="Cria o modelo mensal: a despesa passa a aparecer como pendente todo mês e entra no saldo projetado"
        >
          <input
            type="checkbox"
            checked={recorrente}
            onChange={(e) => setRecorrente(e.target.checked)}
            className="accent-brand-600"
          />
          todo mês
        </label>
        <button
          type="submit"
          disabled={criar.isPending || criarRecorrente.isPending}
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

      {(recorrentes ?? []).length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-xs font-semibold tracking-wide text-neutral-500">
            RECORRENTES DO MÊS
          </h3>
          <ul className="mb-2 flex flex-col gap-1.5">
            {(recorrentes ?? []).map((r) => {
              const paga = lancadasIds.has(r.id)
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                    paga ? 'border-neutral-100 opacity-60' : 'border-dashed border-neutral-200'
                  }`}
                >
                  <span className="w-24 font-medium text-neutral-900">
                    {fmtCentavos(r.valor_centavos)}
                  </span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
                    {r.categoria?.nome}
                  </span>
                  <span className="flex-1 truncate text-neutral-600">{r.descricao}</span>
                  <span className="text-xs text-neutral-400">dia {r.dia_vencimento}</span>
                  {paga ? (
                    <span className="text-xs font-medium text-brand-600">paga ✓</span>
                  ) : (
                    <button
                      onClick={() => lancarRecorrente.mutate({ recorrente: r, mes })}
                      disabled={lancarRecorrente.isPending}
                      className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                    >
                      Pagar
                    </button>
                  )}
                  <button
                    onClick={() => desativarRecorrente.mutate(r.id)}
                    title="Deixar de ser recorrente (não afeta lançamentos já feitos)"
                    className="text-xs text-neutral-300 transition hover:text-red-500"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mb-4 text-[11px] text-neutral-400">
            Pendentes entram no saldo projetado do fluxo de caixa automaticamente.
          </p>
        </>
      )}

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      <div className="mb-2 mt-4 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-neutral-500">FIXAS</h3>
        <span className="text-xs text-neutral-400">{fmtCentavos(total(saidasFixas))}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {saidasFixas.map((s) => (
          <ItemSaida key={s.id} s={s} />
        ))}
        {!isLoading && saidasFixas.length === 0 && (
          <li className="py-1 text-sm text-neutral-300">Nenhuma saída fixa no mês.</li>
        )}
      </ul>

      <div className="mb-2 mt-5 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-neutral-500">VARIÁVEIS</h3>
        <span className="text-xs text-neutral-400">{fmtCentavos(total(saidasVariaveis))}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {saidasVariaveis.map((s) => (
          <ItemSaida key={s.id} s={s} />
        ))}
        {!isLoading && saidasVariaveis.length === 0 && (
          <li className="py-1 text-sm text-neutral-300">Nenhuma saída variável no mês.</li>
        )}
      </ul>
    </div>
  )
}
