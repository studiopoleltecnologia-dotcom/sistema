import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeOff, Pencil, Plus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { useConfirmar } from '../../components/ui/ConfirmarAcao'
import { requireSupabase } from '../../lib/supabase'
import { fmtCentavos } from '../../lib/dinheiro'
import { fmtData } from '../../lib/datas'
import { useMinhaFuncao } from '../../lib/funcao'
import { useClientes } from '../clientes/hooks/useClientes'
import type { Tables } from '../../lib/database.types'
import { ProdutoForm } from './components/ProdutoForm'
import type { RequisitoInput } from './api/produtos'
import {
  useArquivarProduto,
  useProdutoModalidades,
  useProdutos,
  useRequisitos,
} from './hooks/useProdutos'
import {
  TIPOS_PRODUTO,
  TIPO_PRODUTO_LABEL,
  descreverCobranca,
  descreverEntrega,
  type Produto,
} from './types'

type SaldoCredito = Tables<'vw_saldo_creditos'>

const inputCls =
  'rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500'

function useSaldos() {
  return useQuery({
    queryKey: ['saldo-creditos'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('vw_saldo_creditos')
        .select('*')
        // inadimplente também aparece: é justamente quem a equipe
        // precisa ver para cobrar e depois renovar o ciclo
        .in('status', ['ativa', 'inadimplente'])
        .order('data_fim')
      if (error) throw error
      return data
    },
  })
}

/**
 * Catálogo do estúdio + as matrículas ativas.
 *
 * Era a tela "Planos", com um formulário de quatro campos que só sabia
 * descrever plano por crédito. O estúdio vende sete coisas diferentes
 * (regulamento, itens 2, 8 e 10) e nenhuma das outras seis cabia ali.
 */
export function ProdutosPage() {
  const qc = useQueryClient()
  const { data: produtos, isLoading } = useProdutos()
  const { data: vinculos } = useProdutoModalidades()
  const { data: requisitos } = useRequisitos()
  const { data: saldos } = useSaldos()
  const { data: clientes } = useClientes()
  // Secretária vê o catálogo e as matrículas, mas não cria/edita nem
  // mexe em crédito. A RLS já recusa a gravação; aqui escondemos as
  // ações para não frustrar o clique.
  const { data: funcao } = useMinhaFuncao()
  const ehGestao = funcao === 'gestao'
  const confirmar = useConfirmar()
  const arquivar = useArquivarProduto()

  const [form, setForm] = useState<{ produto: Produto | null } | null>(null)
  const [matriculaCliente, setMatriculaCliente] = useState('')
  const [matriculaProduto, setMatriculaProduto] = useState('')

  const matricular = useMutation({
    mutationFn: async () => {
      const { error } = await requireSupabase().rpc('matricular', {
        p_cliente: matriculaCliente,
        p_plano: matriculaProduto,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saldo-creditos'] })
      qc.invalidateQueries({ queryKey: ['entradas'] })
      setMatriculaCliente('')
      setMatriculaProduto('')
    },
  })

  // A renovação agora é automática: `processar_assinaturas()` roda às 5h
  // e vira o ciclo de quem tem cobrança recebida. Este botão continua
  // existindo para o caso de a equipe receber por fora (PIX na hora,
  // dinheiro) e querer liberar na frente do aluno, sem esperar a virada.
  const renovar = useMutation({
    mutationFn: async (matriculaId: string) => {
      const { error } = await requireSupabase().rpc('renovar_ciclo', { p_matricula: matriculaId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saldo-creditos'] })
      qc.invalidateQueries({ queryKey: ['entradas'] })
    },
  })

  const inadimplir = useMutation({
    mutationFn: async (matriculaId: string) => {
      const { error } = await requireSupabase().rpc('marcar_inadimplente', {
        p_matricula: matriculaId,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saldo-creditos'] }),
  })

  const cancelarAssinatura = useMutation({
    mutationFn: async (matriculaId: string) => {
      const { error } = await requireSupabase().rpc('cancelar_assinatura', {
        p_matricula: matriculaId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saldo-creditos'] })
      qc.invalidateQueries({ queryKey: ['entradas'] })
    },
  })

  const modalidadesDe = (produtoId: string) =>
    (vinculos ?? []).filter((v) => v.produto_id === produtoId).map((v) => v.modalidade_id)

  const requisitosDe = (produtoId: string): RequisitoInput[] =>
    (requisitos ?? [])
      .filter((r) => r.produto_id === produtoId)
      .map((r) => ({ tipo: r.tipo, parametro_int: r.parametro_int, janela_dias: r.janela_dias }))

  const porTipo = useMemo(() => {
    const m = new Map<string, Produto[]>()
    for (const t of TIPOS_PRODUTO) m.set(t.valor, [])
    for (const p of produtos ?? []) m.get(p.tipo_produto)?.push(p)
    return m
  }, [produtos])

  const nomeCliente = (id: string | null) =>
    (clientes ?? []).find((c) => c.id === id)?.nome ?? '—'
  const nomeProduto = (id: string | null) =>
    (produtos ?? []).find((p) => p.id === id)?.nome ?? '—'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Produtos"
        subtitulo="Planos, pacotes e serviços que o estúdio vende"
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

      {TIPOS_PRODUTO.map((t) => {
        const lista = porTipo.get(t.valor) ?? []
        if (lista.length === 0) return null
        return (
          <section key={t.valor}>
            <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-neutral-500">
              {TIPO_PRODUTO_LABEL[t.valor]}
            </h2>
            <ul className="flex max-w-3xl flex-col gap-1.5">
              {lista.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-neutral-100 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-neutral-900">{p.nome}</span>
                  {!p.visivel_no_catalogo && (
                    <span
                      title="Só a gestão vende — o aluno não vê no portal"
                      className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500"
                    >
                      <EyeOff className="size-3" />
                      só gestão
                    </span>
                  )}
                  {p.preco_centavos === 0 && (
                    <span className="rounded bg-success-50 px-1.5 py-0.5 text-[10px] font-medium text-success-700">
                      cortesia
                    </span>
                  )}
                  <span className="text-xs text-neutral-400">{descreverEntrega(p)}</span>
                  <span className="flex-1 text-xs text-neutral-400">{descreverCobranca(p)}</span>
                  <span className="font-semibold text-neutral-900">
                    {p.preco_centavos === 0 ? '—' : fmtCentavos(p.preco_centavos)}
                  </span>
                  {ehGestao && (
                    <>
                      <button
                        onClick={() => setForm({ produto: p })}
                        title="Editar"
                        className="rounded p-1 text-neutral-400 transition hover:text-brand-600"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          confirmar.pedir({
                            titulo: `Arquivar ${p.nome}?`,
                            tom: 'arquivar',
                            descricao: (
                              <>
                                Sai do catálogo e ninguém mais consegue contratá-lo — nem a equipe,
                                nem o aluno pelo portal. <b>Quem já contratou não é afetado:</b> a
                                matrícula segue valendo até o fim do compromisso.
                              </>
                            ),
                            aoConfirmar: () => arquivar.mutateAsync(p.id),
                          })
                        }
                        title="Arquivar produto"
                        className="px-1 text-xs text-neutral-300 transition hover:text-red-500"
                      >
                        ×
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {!isLoading && (produtos ?? []).length === 0 && (
        <p className="max-w-xl text-sm text-neutral-400">
          Nenhum produto cadastrado ainda. Comece pelos planos recorrentes e depois cadastre aula
          avulsa, experimental, particular e treino livre.
        </p>
      )}

      <section>
        <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-neutral-500">
          Matrículas ativas
        </h2>

        {ehGestao && (
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <select
              value={matriculaCliente}
              onChange={(e) => setMatriculaCliente(e.target.value)}
              className={inputCls}
            >
              <option value="">Aluno…</option>
              {(clientes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <select
              value={matriculaProduto}
              onChange={(e) => setMatriculaProduto(e.target.value)}
              className={inputCls}
            >
              <option value="">Produto…</option>
              {(produtos ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.preco_centavos === 0 ? ' (cortesia)' : ` (${fmtCentavos(p.preco_centavos)})`}
                  {p.visivel_no_catalogo ? '' : ' · só gestão'}
                </option>
              ))}
            </select>
            <Button
              onClick={() => matricular.mutate()}
              disabled={!matriculaCliente || !matriculaProduto}
              loading={matricular.isPending}
              size="sm"
            >
              Matricular
            </Button>
            <span className="text-[11px] text-neutral-400">
              Cortesia não gera cobrança no Financeiro.
            </span>
          </div>
        )}

        <ul className="flex max-w-3xl flex-col gap-1.5">
          {((saldos ?? []) as SaldoCredito[]).map((s) => (
            <li
              key={s.matricula_id}
              className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
            >
              <span className="flex-1 font-medium text-neutral-900">
                {nomeCliente(s.cliente_id)}
                {s.status === 'inadimplente' && (
                  <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">
                    em aberto
                  </span>
                )}
              </span>
              <span className="text-xs text-neutral-400">{nomeProduto(s.plano_id)}</span>
              {/* "ciclo 3/1" seria absurdo. O compromisso é permanência
                  mínima, não teto de vida: passado ele, o que importa
                  dizer é que a assinatura segue renovando sozinha. */}
              {(s.ciclo_atual ?? 1) <= (s.ciclos_compromisso ?? 1) &&
              (s.ciclos_compromisso ?? 1) > 1 ? (
                <span className="text-xs text-neutral-400">
                  ciclo {s.ciclo_atual}/{s.ciclos_compromisso}
                </span>
              ) : (
                <span className="text-xs text-neutral-400">ciclo {s.ciclo_atual}</span>
              )}
              {s.cancelamento_efetivo_em ? (
                <span className="rounded bg-warning-50 px-1.5 py-0.5 text-[11px] font-medium text-warning-700">
                  cancela {fmtData(s.cancelamento_efetivo_em)}
                </span>
              ) : s.renova_automaticamente ? (
                <span className="text-xs text-neutral-400" title="Renova sozinha na virada do ciclo">
                  renova sozinha
                </span>
              ) : null}
              <span className="text-xs text-neutral-400">até {fmtData(s.data_fim)}</span>
              {s.proxima_validade && s.proxima_validade !== s.data_fim && (
                <span
                  className="text-xs text-neutral-400"
                  title="Data em que o próximo lote de créditos vence"
                >
                  vence {fmtData(s.proxima_validade)}
                </span>
              )}
              <span
                className={`font-semibold ${
                  (s.saldo ?? 0) > 0 ? 'text-neutral-900' : 'text-red-600'
                }`}
              >
                {s.saldo} crédito{s.saldo === 1 ? '' : 's'}
              </span>
              {ehGestao && (
                <>
                  {!s.cancelamento_efetivo_em && (
                    <button
                      onClick={() =>
                        s.matricula_id &&
                        confirmar.pedir({
                          titulo: 'Adiantar a renovação?',
                          tom: 'arquivar',
                          textoConfirmar: 'Renovar agora',
                          descricao: (
                            <>
                              A virada acontece sozinha quando o ciclo termina. Renovar agora
                              começa o próximo ciclo já e, se o plano não acumula, o saldo
                              restante de {nomeCliente(s.cliente_id)} expira.
                            </>
                          ),
                          aoConfirmar: () => renovar.mutateAsync(s.matricula_id!),
                        })
                      }
                      disabled={renovar.isPending}
                      title="Recebeu por fora e quer liberar o próximo ciclo sem esperar a virada"
                      className="rounded-md bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700 transition hover:bg-success-100 disabled:opacity-40"
                    >
                      renovar agora
                    </button>
                  )}
                  {s.status === 'ativa' && (
                    <button
                      onClick={() => s.matricula_id && inadimplir.mutate(s.matricula_id)}
                      disabled={inadimplir.isPending}
                      title="Mensalidade não entrou: bloqueia novos agendamentos até regularizar"
                      className="rounded-md px-2 py-0.5 text-xs font-medium text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      não pagou
                    </button>
                  )}
                  {!s.cancelamento_efetivo_em && (
                    <button
                      onClick={() =>
                        s.matricula_id &&
                        confirmar.pedir({
                          titulo: 'Cancelar a assinatura?',
                          tom: 'arquivar',
                          textoConfirmar: 'Cancelar assinatura',
                          descricao: (
                            <>
                              A cobrança automática de {nomeCliente(s.cliente_id)} para. Os
                              créditos já pagos continuam valendo até {fmtData(s.data_fim)} —
                              nada é apagado.
                            </>
                          ),
                          aoConfirmar: () => cancelarAssinatura.mutateAsync(s.matricula_id!),
                        })
                      }
                      disabled={cancelarAssinatura.isPending}
                      title="Desliga a renovação no fim do ciclo pago"
                      className="rounded-md px-2 py-0.5 text-xs font-medium text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-40"
                    >
                      cancelar
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
          {(saldos ?? []).length === 0 && (
            <li className="py-2 text-sm text-neutral-300">Nenhuma matrícula ativa.</li>
          )}
        </ul>
      </section>

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
