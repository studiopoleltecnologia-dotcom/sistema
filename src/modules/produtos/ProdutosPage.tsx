import { useMemo, useState } from 'react'
import { Archive, Package, Plus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { useConfirmar } from '../../components/ui/ConfirmarAcao'
import { useMinhaFuncao } from '../../lib/funcao'
import { ProdutoForm } from './components/ProdutoForm'
import { ProdutoCard } from './components/ProdutoCard'
import type { RequisitoInput } from './api/produtos'
import {
  useArquivarProduto,
  useProdutoModalidades,
  useProdutos,
  useReativarProduto,
  useRequisitos,
} from './hooks/useProdutos'
import {
  GRUPOS,
  RECORRENCIA_AJUDA,
  RECORRENCIA_LABEL,
  grupoDoProduto,
  recorrenciaDoProduto,
  type GrupoProduto,
  type Produto,
  type Recorrencia,
} from './types'

/** Faixa de cor por bloco — o que separa os grupos antes de qualquer leitura. */
const FAIXA: Record<string, string> = {
  brand: 'border-brand-300 bg-brand-50/50',
  success: 'border-success-300 bg-success-50/50',
  neutral: 'border-neutral-300 bg-neutral-50',
}
const TITULO_COR: Record<string, string> = {
  brand: 'text-brand-800',
  success: 'text-success-800',
  neutral: 'text-neutral-700',
}

/**
 * Catálogo do estúdio: o que o Studio vende e sob quais regras.
 *
 * A tela anterior era uma lista única de linhas de 1 rem, todas com o
 * mesmo peso, e ainda carregava as matrículas ativas no fim — duas
 * responsabilidades numa página só. As matrículas saíram para
 * /matriculas; aqui ficou só o catálogo, e ele passou a ser organizado
 * pelo que o regulamento realmente separa: crédito, turma fixa e o que
 * se compra fora de plano.
 *
 * O agrupamento é derivado dos atributos do produto (ver grupoDoProduto
 * em types.ts), não de um campo de categoria — produto novo cai no
 * bloco certo sozinho, sem ninguém classificar nada na mão.
 */
export function ProdutosPage() {
  const { data: produtos, isLoading } = useProdutos()
  const { data: vinculos } = useProdutoModalidades()
  const { data: requisitos } = useRequisitos()
  // Secretária vê o catálogo (precisa saber o que vender) mas não
  // cria nem edita. A RLS já recusa a gravação; aqui escondemos as
  // ações para não frustrar o clique.
  const { data: funcao } = useMinhaFuncao()
  const ehGestao = funcao === 'gestao'
  const confirmar = useConfirmar()
  const arquivar = useArquivarProduto()
  const reativar = useReativarProduto()

  const [form, setForm] = useState<{ produto: Produto | null } | null>(null)
  const [verArquivados, setVerArquivados] = useState(false)

  const modalidadesDe = (produtoId: string) =>
    (vinculos ?? []).filter((v) => v.produto_id === produtoId).map((v) => v.modalidade_id)

  const requisitosDe = (produtoId: string): RequisitoInput[] =>
    (requisitos ?? [])
      .filter((r) => r.produto_id === produtoId)
      .map((r) => ({ tipo: r.tipo, parametro_int: r.parametro_int, janela_dias: r.janela_dias }))

  const ativos = useMemo(() => (produtos ?? []).filter((p) => p.ativo), [produtos])
  const arquivados = useMemo(() => (produtos ?? []).filter((p) => !p.ativo), [produtos])

  const porGrupo = useMemo(() => {
    const m = new Map<GrupoProduto, Produto[]>()
    for (const g of GRUPOS) m.set(g.valor, [])
    for (const p of ativos) m.get(grupoDoProduto(p))!.push(p)
    return m
  }, [ativos])

  const abrirEdicao = (p: Produto) => setForm({ produto: p })

  const pedirArquivar = (p: Produto) =>
    confirmar.pedir({
      titulo: `Arquivar ${p.nome}?`,
      tom: 'arquivar',
      descricao: (
        <>
          Sai do catálogo e ninguém mais consegue contratá-lo — nem a equipe, nem o aluno pelo
          portal. <b>Quem já contratou não é afetado:</b> a matrícula segue valendo até o fim do
          compromisso, e dá para trazer o produto de volta a qualquer momento.
        </>
      ),
      aoConfirmar: () => arquivar.mutateAsync(p.id),
    })

  const cartao = (p: Produto) => (
    <ProdutoCard
      key={p.id}
      produto={p}
      requisitos={(requisitos ?? []).filter((r) => r.produto_id === p.id)}
      gestao={ehGestao}
      onEditar={() => abrirEdicao(p)}
      onArquivar={() => pedirArquivar(p)}
      onReativar={() => reativar.mutate(p.id)}
    />
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        titulo="Produtos"
        subtitulo="O que o estúdio vende e as regras de cada formato"
        acoes={
          ehGestao ? (
            <Button onClick={() => setForm({ produto: null })}>
              <Plus className="size-4" />
              Novo produto
            </Button>
          ) : undefined
        }
      />

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {!isLoading && ativos.length === 0 && arquivados.length === 0 && (
        <EmptyState
          icon={Package}
          title="Nenhum produto cadastrado"
          description="Comece pelos planos recorrentes e depois cadastre aula avulsa, experimental, particular e treino livre."
          action={
            ehGestao ? (
              <Button size="sm" onClick={() => setForm({ produto: null })}>
                <Plus className="size-4" />
                Novo produto
              </Button>
            ) : undefined
          }
        />
      )}

      {GRUPOS.map((g) => {
        const lista = porGrupo.get(g.valor) ?? []
        if (lista.length === 0) return null

        // Crédito e turma fixa se dividem em Mensal x Semestral
        // (regulamento 1.5); fora do plano, não — lá é compra única.
        const porColuna = g.valor === 'outros' ? null : dividirPorRecorrencia(lista)

        return (
          <section key={g.valor}>
            <header
              className={`mb-4 rounded-lg border-l-4 px-4 py-2.5 ${FAIXA[g.cor] ?? FAIXA.neutral}`}
            >
              <h2
                className={`font-display text-sm font-bold uppercase tracking-wider ${
                  TITULO_COR[g.cor] ?? TITULO_COR.neutral
                }`}
              >
                {g.titulo}
                <span className="ml-2 font-sans text-xs font-medium normal-case tracking-normal opacity-60">
                  {lista.length} {lista.length === 1 ? 'produto' : 'produtos'}
                </span>
              </h2>
              <p className="mt-0.5 max-w-3xl text-xs leading-snug text-neutral-600">
                {g.descricao}
              </p>
            </header>

            {porColuna ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {(['mensal', 'semestral'] as Recorrencia[]).map((r) => {
                  const itens = porColuna[r]
                  if (itens.length === 0) return null
                  return (
                    <div key={r}>
                      <div className="mb-2 flex items-baseline gap-2 border-b border-neutral-100 pb-1.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                          {RECORRENCIA_LABEL[r]}
                        </h3>
                        <span className="text-[11px] text-neutral-400">{RECORRENCIA_AJUDA[r]}</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        {itens.map(cartao)}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {lista.map(cartao)}
              </div>
            )}
          </section>
        )
      })}

      {arquivados.length > 0 && (
        <section>
          <button
            onClick={() => setVerArquivados((v) => !v)}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-400 transition hover:text-neutral-600"
          >
            <Archive className="size-3.5" />
            Arquivados ({arquivados.length})
            <span className="font-sans text-[11px] font-medium normal-case tracking-normal">
              {verArquivados ? 'esconder' : 'mostrar'}
            </span>
          </button>
          {verArquivados && (
            <>
              <p className="mb-3 mt-1.5 max-w-2xl text-xs text-neutral-400">
                Fora do catálogo — ninguém consegue contratar. As matrículas que já existiam
                continuam valendo normalmente.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {arquivados.map(cartao)}
              </div>
            </>
          )}
        </section>
      )}

      {form && (
        <ProdutoForm
          produto={form.produto}
          modalidadesIniciais={form.produto ? modalidadesDe(form.produto.id) : []}
          requisitosIniciais={form.produto ? requisitosDe(form.produto.id) : []}
          onFechar={() => setForm(null)}
        />
      )}
      {confirmar.dialogo}
    </div>
  )
}

function dividirPorRecorrencia(lista: Produto[]): Record<Recorrencia, Produto[]> {
  const out: Record<Recorrencia, Produto[]> = { mensal: [], semestral: [] }
  for (const p of lista) out[recorrenciaDoProduto(p)].push(p)
  return out
}
