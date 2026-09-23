import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useClientes } from '../../clientes/hooks/useClientes'
import { useProdutos } from '../../produtos/hooks/useProdutos'
import {
  GRUPOS,
  grupoDoProduto,
  descreverEntrega,
  descreverCobranca,
  type Produto,
} from '../../produtos/types'
import { useMatricular } from '../hooks/useMatriculas'
import { NovoAlunoRapido } from './NovoAlunoRapido'
import { SeletorTurmaFixa } from './SeletorTurmaFixa'

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

/** Nome + preço. O estado do produto vira o optgroup, não um sufixo. */
function rotuloProduto(p: Produto): string {
  const preco = p.preco_centavos === 0 ? 'cortesia' : fmtCentavos(p.preco_centavos)
  return `${p.nome} — ${preco}`
}

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
  const [novoAluno, setNovoAluno] = useState(false)
  // Nome do aluno recém-criado: a lista de clientes é revalidada em
  // segundo plano, e sem isto o <option> dele não existiria por um
  // instante — o select pareceria voltar para "Escolha…".
  const [recemCriado, setRecemCriado] = useState<{ id: string; nome: string } | null>(null)
  /*
    A justificativa só aparece quando o banco recusou — por elegibilidade
    (§8 e §10 do regulamento) ou por ser plano antigo, fora de venda
    (item 05). Só a gestão consegue seguir assim mesmo, e a autorização
    fica gravada em `auditoria` com quem, quando e por quê — é a "tela de
    confirmação com histórico" pedida na revisão.
  */
  const [justificativa, setJustificativa] = useState('')
  const [pedeJustificativa, setPedeJustificativa] = useState(false)

  /*
    Três listas, não uma. Os planos antigos do Wix e o plano interno da
    equipe são contratáveis pela gestão — por isso continuam no select —,
    mas misturá-los ao catálogo atual é o que fazia a recepção vender um
    plano descontinuado sem perceber. Separados em optgroup próprio, e
    com aviso ao escolher.
  */
  const vendaveis = useMemo(() => (produtos ?? []).filter((p) => p.ativo), [produtos])
  const aVenda = useMemo(() => vendaveis.filter((p) => p.status === 'venda'), [vendaveis])
  const internos = useMemo(() => vendaveis.filter((p) => p.status === 'interno'), [vendaveis])
  const legados = useMemo(() => vendaveis.filter((p) => p.status === 'legado'), [vendaveis])

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
      {
        clienteId,
        produtoId: produto.id,
        turmaIds: ehTurmaFixa ? turmaIds : [],
        justificativa: justificativa.trim() || undefined,
      },
      {
        onSuccess: onFechar,
        onError: (e) => {
          const msg = (e as Error).message
          setErro(msg)
          // O banco devolve esta frase quando a gestão pode excepcionar
          // mas não escreveu o motivo. É o gatilho para abrir o campo.
          if (msg.includes('informe a justificativa')) setPedeJustificativa(true)
        },
      },
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
                onChange={(e) => {
                  if (e.target.value === '__novo__') {
                    setNovoAluno(true)
                    return
                  }
                  setClienteId(e.target.value)
                }}
                required
              >
                <option value="">Escolha…</option>
                <option value="__novo__">+ Cadastrar novo aluno…</option>
                {recemCriado && !(clientes ?? []).some((c) => c.id === recemCriado.id) && (
                  <option value={recemCriado.id}>{recemCriado.nome}</option>
                )}
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
                const doGrupo = aVenda.filter((p) => grupoDoProduto(p) === g.valor)
                if (doGrupo.length === 0) return null
                return (
                  <optgroup key={g.valor} label={g.titulo}>
                    {doGrupo.map((p) => (
                      <option key={p.id} value={p.id}>
                        {rotuloProduto(p)}
                      </option>
                    ))}
                  </optgroup>
                )
              })}

              {internos.length > 0 && (
                <optgroup label="— Cortesia da equipe —">
                  {internos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {rotuloProduto(p)}
                    </option>
                  ))}
                </optgroup>
              )}

              {legados.length > 0 && (
                <optgroup label="— Planos antigos (Wix) · fora de venda —">
                  {legados.map((p) => (
                    <option key={p.id} value={p.id}>
                      {rotuloProduto(p)}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
        </div>

        {/* O optgroup separa, mas quem vê só a linha escolhida não lê o
            cabeçalho. O aviso repete o estado onde a decisão acontece. */}
        {produto?.status === 'legado' && (
          <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-relaxed text-warning-800">
            <p className="font-medium">Este é um plano antigo, fora de venda.</p>
            <p className="mt-0.5">
              Ele existe para honrar quem contratou no Wix. Para vender assim mesmo, o banco vai
              pedir uma justificativa, e ela fica registrada.
            </p>
          </div>
        )}

        {produto?.status === 'interno' && (
          <div className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-xs leading-relaxed text-brand-800">
            <p className="font-medium">Cortesia da equipe — não é uma venda.</p>
            <p className="mt-0.5">
              Não gera cobrança no Financeiro e não entra no faturamento. Só a gestão concede.
            </p>
          </div>
        )}

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

        {pedeJustificativa && (
          <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2.5">
            <label className="mb-1 block text-xs font-semibold text-warning-700">
              Autorizar mesmo assim — por quê?
            </label>
            <textarea
              autoFocus
              rows={2}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: aluna migrando do Wix, contrato em andamento; voltou depois de 3 anos"
              className="w-full rounded-md border border-warning-200 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-warning-400"
            />
            <p className="mt-1 text-[11px] text-warning-700">
              Fica registrado com seu nome e a data, junto da matrícula.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={matricular.isPending}
            disabled={
              !clienteId ||
              !produto ||
              (ehTurmaFixa && faltam !== 0) ||
              (pedeJustificativa && justificativa.trim().length === 0)
            }
          >
            {pedeJustificativa ? 'Autorizar e matricular' : 'Matricular'}
          </Button>
        </div>
      </form>

      {novoAluno && (
        <NovoAlunoRapido
          onFechar={() => setNovoAluno(false)}
          onCriado={(c) => {
            setRecemCriado(c)
            setClienteId(c.id)
            setNovoAluno(false)
            setErro(null)
          }}
        />
      )}
    </Modal>
  )
}
