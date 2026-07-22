import { useState, type FormEvent } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
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
import { ORDEM_TIPO_SAIDA, TIPO_SAIDA_DESCRICAO, TIPO_SAIDA_LABEL, type TipoSaida } from '../types'

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
  const [novaCategoria, setNovaCategoria] = useState<{ nome: string; tipo: TipoSaida } | null>(
    null,
  )

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

  const categoriasPorTipo = (tipo: TipoSaida) => (categorias ?? []).filter((c) => c.tipo === tipo)

  const lancadasIds = new Set(
    (saidas ?? []).map((s) => s.recorrente_id).filter(Boolean) as string[],
  )

  const saidasPorTipo = (tipo: TipoSaida) => (saidas ?? []).filter((s) => s.categoria?.tipo === tipo)
  const total = (lista: { valor_centavos: number }[]) =>
    lista.reduce((s, x) => s + x.valor_centavos, 0)

  const ItemSaida = ({ s }: { s: NonNullable<typeof saidas>[number] }) => (
    <li className="flex items-center gap-3 rounded-md border border-neutral-100 bg-white px-3 py-2.5 text-sm">
      <span className="w-24 font-medium text-neutral-900">{fmtCentavos(s.valor_centavos)}</span>
      <Badge variant="neutral">{s.categoria?.nome}</Badge>
      <span className="flex-1 truncate text-neutral-500">
        {s.descricao}
        {s.recorrente_id && (
          <RotateCcw
            className="ml-1.5 inline-block size-3 text-brand-600"
            aria-label="Lançada de uma despesa recorrente"
          />
        )}
      </span>
      <span className="text-xs text-neutral-400">{fmtData(s.data_caixa)}</span>
      <button
        onClick={() => excluir.mutate(s.id)}
        className="rounded p-0.5 text-neutral-300 transition hover:text-danger-600"
      >
        <X className="size-3.5" />
      </button>
    </li>
  )

  return (
    <div className="max-w-3xl">
      <form onSubmit={lancar} className="mb-4 flex flex-wrap items-end gap-2">
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
          value={categoriaId}
          onChange={(e) => {
            if (e.target.value === '__nova__') {
              setNovaCategoria({ nome: '', tipo: 'variavel' })
            } else {
              setCategoriaId(e.target.value)
            }
          }}
          required
          className="w-44"
        >
          <option value="">Categoria…</option>
          {ORDEM_TIPO_SAIDA.map((tipo) => (
            <optgroup key={tipo} label={TIPO_SAIDA_LABEL[tipo]}>
              {categoriasPorTipo(tipo).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="__nova__">+ Nova categoria…</option>
        </Select>
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-40" />
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
        <Button type="submit" loading={criar.isPending || criarRecorrente.isPending}>
          <Plus className="size-4" />
          Lançar
        </Button>
      </form>

      {novaCategoria && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-neutral-50 p-3">
          <Input
            autoFocus
            value={novaCategoria.nome}
            onChange={(e) => setNovaCategoria({ ...novaCategoria, nome: e.target.value })}
            placeholder="Nome da categoria"
            className="w-44"
          />
          <Select
            value={novaCategoria.tipo}
            onChange={(e) =>
              setNovaCategoria({ ...novaCategoria, tipo: e.target.value as TipoSaida })
            }
            className="w-44"
          >
            {ORDEM_TIPO_SAIDA.map((tipo) => (
              <option key={tipo} value={tipo}>
                {TIPO_SAIDA_LABEL[tipo]}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={salvarCategoria} loading={criarCategoria.isPending}>
            Criar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setNovaCategoria(null)}>
            Cancelar
          </Button>
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
                  className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm ${
                    paga ? 'border-neutral-100 bg-white opacity-60' : 'border-dashed border-neutral-200'
                  }`}
                >
                  <span className="w-24 font-medium text-neutral-900">
                    {fmtCentavos(r.valor_centavos)}
                  </span>
                  <Badge variant="neutral">{r.categoria?.nome}</Badge>
                  <span className="flex-1 truncate text-neutral-600">{r.descricao}</span>
                  <span className="text-xs text-neutral-400">dia {r.dia_vencimento}</span>
                  {paga ? (
                    <Badge variant="success">paga ✓</Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => lancarRecorrente.mutate({ recorrente: r, mes })}
                      loading={lancarRecorrente.isPending}
                    >
                      Pagar
                    </Button>
                  )}
                  <button
                    onClick={() => desativarRecorrente.mutate(r.id)}
                    title="Deixar de ser recorrente (não afeta lançamentos já feitos)"
                    className="rounded p-0.5 text-neutral-300 transition hover:text-danger-600"
                  >
                    <X className="size-3.5" />
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

      {ORDEM_TIPO_SAIDA.map((tipo) => {
        const lista = saidasPorTipo(tipo)
        return (
          <div key={tipo}>
            <div className="mb-2 mt-5 flex items-baseline justify-between">
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-neutral-500">
                  {TIPO_SAIDA_LABEL[tipo].toUpperCase()}
                </h3>
                <p className="text-[11px] text-neutral-400">{TIPO_SAIDA_DESCRICAO[tipo]}</p>
              </div>
              <span className="text-xs font-medium text-neutral-500">{fmtCentavos(total(lista))}</span>
            </div>
            {lista.length === 0 && !isLoading ? (
              <EmptyState title={`Nenhuma despesa ${TIPO_SAIDA_LABEL[tipo].toLowerCase()} no mês.`} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {lista.map((s) => (
                  <ItemSaida key={s.id} s={s} />
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
