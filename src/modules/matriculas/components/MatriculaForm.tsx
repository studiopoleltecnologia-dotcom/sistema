import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useClientes } from '../../clientes/hooks/useClientes'
import { useProdutos } from '../../produtos/hooks/useProdutos'
import { GRUPOS, grupoDoProduto, descreverEntrega, descreverCobranca } from '../../produtos/types'
import { useMatricular } from '../hooks/useMatriculas'
import { SeletorTurmaFixa } from './SeletorTurmaFixa'

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

/**
 * Contratar um produto para um aluno.
 *
 * A tela reage ao formato do produto em vez de perguntar qual é: se o
 * produto escolhido reserva assento (`turmas_fixas > 0`), o seletor de
 * turmas aparece e o botão de salvar só libera com a quantidade exata.
 * É o item 10 do pedido — "o sistema deve reconhecer o tipo de plano e
 * solicitar a seleção da(s) turma(s)".
 *
 * O limite é lido do produto, não fixado aqui: um plano de 3 turmas que
 * a equipe invente amanhã já funciona.
 */
export function MatriculaForm({
  clienteFixo,
  onFechar,
}: {
  /** Quando vem da ficha do aluno, o aluno já está decidido. */
  clienteFixo?: { id: string; nome: string }
  onFechar: () => void
}) {
  const { data: clientes } = useClientes()
  const { data: produtos } = useProdutos()
  const matricular = useMatricular()

  const [clienteId, setClienteId] = useState(clienteFixo?.id ?? '')
  const [produtoId, setProdutoId] = useState('')
  const [turmaIds, setTurmaIds] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const vendaveis = useMemo(
    () => (produtos ?? []).filter((p) => p.ativo),
    [produtos],
  )
  const produto = vendaveis.find((p) => p.id === produtoId) ?? null
  const ehTurmaFixa = (produto?.turmas_fixas ?? 0) > 0
  const faltam = ehTurmaFixa ? produto!.turmas_fixas - turmaIds.length : 0

  function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!clienteId) return setErro('Escolha o aluno.')
    if (!produto) return setErro('Escolha o produto.')
    if (ehTurmaFixa && turmaIds.length !== produto.turmas_fixas) {
      return setErro(
        `${produto.nome} reserva ${produto.turmas_fixas} turma(s) — escolha exatamente essa quantidade.`,
      )
    }

    matricular.mutate(
      { clienteId, produtoId: produto.id, turmaIds: ehTurmaFixa ? turmaIds : [] },
      { onSuccess: onFechar, onError: (e) => setErro((e as Error).message) },
    )
  }

  return (
    <Modal title="Nova matrícula" onFechar={onFechar} size={ehTurmaFixa ? 'lg' : 'md'}>
      <form onSubmit={submeter} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Aluno *</label>
            {clienteFixo ? (
              <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-800">
                {clienteFixo.nome}
              </p>
            ) : (
              <Select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                required
              >
                <option value="">Escolha…</option>
                {(clientes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div>
            <label className={labelCls}>Produto *</label>
            <Select
              value={produtoId}
              onChange={(e) => {
                setProdutoId(e.target.value)
                // Trocar de produto zera as turmas: o limite mudou, e
                // manter a seleção velha levaria a salvar 2 turmas num
                // plano de 1 (que o banco recusaria, com razão).
                setTurmaIds([])
                setErro(null)
              }}
              required
            >
              <option value="">Escolha…</option>
              {GRUPOS.map((g) => {
                const doGrupo = vendaveis.filter((p) => grupoDoProduto(p) === g.valor)
                if (doGrupo.length === 0) return null
                return (
                  <optgroup key={g.valor} label={g.titulo}>
                    {doGrupo.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                        {p.preco_centavos === 0
                          ? ' — cortesia'
                          : ` — ${fmtCentavos(p.preco_centavos)}`}
                        {p.visivel_no_catalogo ? '' : ' · só a equipe'}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </Select>
          </div>
        </div>

        {produto && (
          <div className="rounded-md border border-neutral-200 bg-neutral-50/70 px-3 py-2 text-xs leading-relaxed text-neutral-600">
            <p className="font-medium text-neutral-800">{descreverEntrega(produto)}</p>
            <p>{descreverCobranca(produto)}</p>
            {produto.preco_centavos === 0 && (
              <p className="mt-0.5 text-neutral-400">
                Cortesia não gera cobrança no Financeiro.
              </p>
            )}
          </div>
        )}

        {ehTurmaFixa && (
          <div>
            <label className={labelCls}>
              Turmas vinculadas *{' '}
              <span className="font-normal text-neutral-400">
                {faltam > 0
                  ? `— falta${faltam === 1 ? '' : 'm'} escolher ${faltam}`
                  : '— completo'}
              </span>
            </label>
            <SeletorTurmaFixa
              maximo={produto!.turmas_fixas}
              selecionadas={turmaIds}
              onChange={setTurmaIds}
            />
          </div>
        )}

        {erro && <p className="text-sm text-danger-600">{erro}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={matricular.isPending}
            disabled={!clienteId || !produto || (ehTurmaFixa && faltam !== 0)}
          >
            Matricular
          </Button>
        </div>
      </form>
    </Modal>
  )
}
