import { useEffect, useMemo, useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { EmptyState } from '../../components/ui/EmptyState'
import { useConfirmar } from '../../components/ui/ConfirmarAcao'
import { useMinhaFuncao } from '../../lib/funcao'
import { ProdutoForm } from './components/ProdutoForm'
import { ProdutoCard } from './components/ProdutoCard'
import { DetalheProduto } from './components/DetalheProduto'
import { SeletorCiclo } from './components/SeletorCiclo'
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
  RECORRENCIA_LABEL,
  TIPO_PRODUTO_LABEL,
  grupoDoProduto,
  recorrenciaDoProduto,
  tituloDoProduto,
  type GrupoProduto,
  type Produto,
  type Recorrencia,
} from './types'

/** Aba de nível 1: os três grupos + o depósito de arquivados. */
type Aba = GrupoProduto | 'arquivados'

/**
 * Catálogo do estúdio.
 *
 * A versão anterior mostrava tudo de uma vez — três blocos empilhados,
 * Mensal e Semestral lado a lado, e cada cartão explicando o produto
 * inteiro (cobrança, regras, custo por aula, cinco selos de benefício).
 * Era completa e ilegível: nada tinha peso diferente de nada.
 *
 * A regra desta versão é uma só: **cada informação aparece em um lugar,
 * e o lugar mais raso mostra o mínimo para escolher**.
 *
 *   1. aba de grupo   — que tipo de produto (o contexto mais amplo)
 *   2. aba de ciclo   — Mensal ou Semestral (nunca os dois juntos: são
 *                       alternativas, não uma comparação para ler)
 *   3. cartão         — o que diferencia dos irmãos: entrega e preço
 *   4. painel lateral — todo o resto, sob demanda
 *
 * Nada foi apagado: cobrança, regras, benefícios, requisitos,
 * elegibilidade, sucessão e custo por aula estão no painel.
 */
export function ProdutosPage() {
  const { data: produtos, isLoading } = useProdutos()
  const { data: vinculos } = useProdutoModalidades()
  const { data: requisitos } = useRequisitos()
  // Secretária vê o catálogo (precisa saber o que vender) mas não cria
  // nem edita. A RLS já recusa a gravação; aqui escondemos as ações
  // para não frustrar o clique.
  const { data: funcao } = useMinhaFuncao()
  const ehGestao = funcao === 'gestao'
  const confirmar = useConfirmar()
  const arquivar = useArquivarProduto()
  const reativar = useReativarProduto()

  const [aba, setAba] = useState<Aba>('creditos')
  const [ciclo, setCiclo] = useState<Recorrencia>('mensal')
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [form, setForm] = useState<{ produto: Produto | null } | null>(null)

  const ativos = useMemo(() => (produtos ?? []).filter((p) => p.ativo), [produtos])
  const arquivados = useMemo(() => (produtos ?? []).filter((p) => !p.ativo), [produtos])
  const porId = useMemo(() => new Map((produtos ?? []).map((p) => [p.id, p])), [produtos])

  const porGrupo = useMemo(() => {
    const m = new Map<GrupoProduto, Produto[]>()
    for (const g of GRUPOS) m.set(g.valor, [])
    for (const p of ativos) m.get(grupoDoProduto(p))!.push(p)
    return m
  }, [ativos])

  // Fora do plano é compra única: não existe Mensal x Semestral ali.
  const temCiclo = aba === 'creditos' || aba === 'turma_fixa'

  const visiveis = useMemo(() => {
    const daAba = aba === 'arquivados' ? arquivados : (porGrupo.get(aba) ?? [])
    return temCiclo ? daAba.filter((p) => recorrenciaDoProduto(p) === ciclo) : daAba
  }, [aba, arquivados, porGrupo, temCiclo, ciclo])

  /**
   * Títulos que aparecem mais de uma vez na aba. O título do cartão é
   * derivado ("4 créditos"), então dois produtos com a mesma entrega
   * ficam idênticos na tela — foi o que aconteceu com um plano de teste
   * antigo convivendo com o do catálogo novo. Nesses casos, e só neles,
   * o cartão mostra também o nome cadastrado.
   */
  const titulosRepetidos = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const p of visiveis) {
      const t = tituloDoProduto(p)
      contagem.set(t, (contagem.get(t) ?? 0) + 1)
    }
    return new Set([...contagem].filter(([, n]) => n > 1).map(([t]) => t))
  }, [visiveis])

  const aberto = abertoId ? porId.get(abertoId) ?? null : null

  // Trocar de aba com um produto aberto deixaria o painel mostrando algo
  // que não está mais na grade ao lado — parece um bug de seleção.
  useEffect(() => {
    if (aberto && !visiveis.some((p) => p.id === aberto.id)) setAbertoId(null)
  }, [aberto, visiveis])

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
      aoConfirmar: async () => {
        await arquivar.mutateAsync(p.id)
        setAbertoId(null)
      },
    })

  const contar = (g: GrupoProduto) => (porGrupo.get(g) ?? []).length

  return (
    <div className="flex flex-col">
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
        filtros={
          (produtos ?? []).length > 0 ? (
            <Tabs
              value={aba}
              onChange={setAba}
              variant="marca"
              items={[
                ...GRUPOS.map((g) => ({
                  value: g.valor as Aba,
                  label: `${g.aba} (${contar(g.valor)})`,
                })),
                ...(arquivados.length > 0
                  ? [{ value: 'arquivados' as Aba, label: `Arquivados (${arquivados.length})` }]
                  : []),
              ]}
            />
          ) : undefined
        }
      />

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {!isLoading && (produtos ?? []).length === 0 && (
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

      {(produtos ?? []).length > 0 && (
        <>
          {/* Nível 2: o ciclo, com identidade de cor própria — ver
              SeletorCiclo. Fora do plano é compra única e não tem ciclo,
              então ali a grade começa direto. */}
          {temCiclo && <SeletorCiclo valor={ciclo} onChange={setCiclo} />}

          <div className={aberto ? 'grid gap-5 lg:grid-cols-[1fr_20rem]' : ''}>
            <div>
              {visiveis.length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
                  {temCiclo
                    ? `Nenhum produto ${RECORRENCIA_LABEL[ciclo].toLowerCase()} neste grupo.`
                    : 'Nenhum produto neste grupo.'}
                </p>
              ) : aba === 'outros' ? (
                // Fora do plano não tem eixo de comparação (4, 8, 12
                // créditos): são produtos distintos. Agrupar por
                // tipo_produto separa "pacote de aula" de "serviço", que
                // é a única divisão real que resta ali.
                <SubgruposPorTipo
                  produtos={visiveis}
                  porId={porId}
                  abertoId={abertoId}
                  titulosRepetidos={titulosRepetidos}
                  onAbrir={setAbertoId}
                />
              ) : (
                <Grade
                  produtos={visiveis}
                  porId={porId}
                  abertoId={abertoId}
                  titulosRepetidos={titulosRepetidos}
                  onAbrir={setAbertoId}
                />
              )}
            </div>

            {aberto && (
              <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
                <DetalheProduto
                  produto={aberto}
                  porId={porId}
                  requisitos={(requisitos ?? []).filter((r) => r.produto_id === aberto.id)}
                  gestao={ehGestao}
                  onEditar={() => setForm({ produto: aberto })}
                  onArquivar={() => pedirArquivar(aberto)}
                  onReativar={() => reativar.mutate(aberto.id)}
                  onFechar={() => setAbertoId(null)}
                />
              </div>
            )}
          </div>
        </>
      )}

      {form && (
        <ProdutoForm
          produto={form.produto}
          modalidadesIniciais={
            form.produto
              ? (vinculos ?? [])
                  .filter((v) => v.produto_id === form.produto!.id)
                  .map((v) => v.modalidade_id)
              : []
          }
          requisitosIniciais={
            form.produto
              ? (requisitos ?? [])
                  .filter((r) => r.produto_id === form.produto!.id)
                  .map(
                    (r): RequisitoInput => ({
                      tipo: r.tipo,
                      parametro_int: r.parametro_int,
                      janela_dias: r.janela_dias,
                    }),
                  )
              : []
          }
          onFechar={() => setForm(null)}
        />
      )}
      {confirmar.dialogo}
    </div>
  )
}

function Grade({
  produtos,
  porId,
  abertoId,
  titulosRepetidos,
  onAbrir,
}: {
  produtos: Produto[]
  porId: Map<string, Produto>
  abertoId: string | null
  titulosRepetidos: Set<string>
  onAbrir: (id: string | null) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {produtos.map((p) => (
        <ProdutoCard
          key={p.id}
          produto={p}
          porId={porId}
          selecionado={abertoId === p.id}
          mostrarNome={titulosRepetidos.has(tituloDoProduto(p))}
          onAbrir={() => onAbrir(abertoId === p.id ? null : p.id)}
        />
      ))}
    </div>
  )
}

function SubgruposPorTipo({
  produtos,
  porId,
  abertoId,
  titulosRepetidos,
  onAbrir,
}: {
  produtos: Produto[]
  porId: Map<string, Produto>
  abertoId: string | null
  titulosRepetidos: Set<string>
  onAbrir: (id: string | null) => void
}) {
  const tipos = ['pacote', 'servico', 'plano'] as const
  return (
    <div className="flex flex-col gap-6">
      {tipos.map((t) => {
        const lista = produtos.filter((p) => p.tipo_produto === t)
        if (lista.length === 0) return null
        return (
          <section key={t}>
            <h3 className="mb-2 border-b border-neutral-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
              {TIPO_PRODUTO_LABEL[t]}
              <span className="ml-1.5 font-sans font-medium normal-case tracking-normal text-neutral-300">
                {lista.length}
              </span>
            </h3>
            <Grade
              produtos={lista}
              porId={porId}
              abertoId={abertoId}
              titulosRepetidos={titulosRepetidos}
              onAbrir={onAbrir}
            />
          </section>
        )
      })}
    </div>
  )
}
