import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import { fmtData } from '../../lib/datas'
import { useRequisitos } from '../produtos/hooks/useProdutos'
import { usePortalClienteId } from './PortalClienteContext'
import {
  useConfigAgendamento,
  useAbatimentoDisponivel,
  useContratarPlano,
  useMeusPlanos,
  usePlanos,
  useRestricoesCatalogo,
  useSolicitacaoAberta,
} from './hooks/usePortalAluna'
import {
  REQUISITO_SELO,
  TIPOS_PLANO,
  economiaNoCompromisso,
  fmtPreco,
  lugarDoProduto,
  menorPreco,
  mensagemErroContratacao,
  recorrenciaDoProduto,
  sufixoPreco,
  type Produto,
  type Recorrencia,
  type TipoPlano,
} from './components/planos/catalogo'
import {
  CartaoPlano,
  EscolhaTipo,
  LinhaAvulso,
  LinkFolha,
  Rotulo,
  SeletorPeriodo,
} from './components/planos/Escolhas'
import {
  ComparativoPeriodo,
  ConfirmarCompra,
  PedirTurmaFixa,
  RegrasCreditos,
  RegrasTurmaFixa,
  TituloPlano,
} from './components/planos/Detalhes'
import { Cabecalho } from './components/Basicos'
import { hojeIso, somarDias } from './datas'
import { Folha } from './components/Folha'
import { AjudaWhatsApp } from './components/AjudaWhatsApp'
import { RegrasEssenciais } from './components/planos/Detalhes'
import { ContratoPasso } from './components/contrato/ContratoPasso'

type FolhaAberta =
  | { tipo: 'comprar'; produtoId: string }
  | { tipo: 'turma_fixa'; produtoId: string }
  | { tipo: 'comparar' }
  | { tipo: 'regras'; de: TipoPlano }
  /** Passo do Contrato de Adesão, entre o pedido e o pagamento. */
  | { tipo: 'contrato'; produtoId: string; solicitacaoId: string }

const PERIODOS: Recorrencia[] = ['mensal', 'semestral']

/**
 * Códigos de impedimento que TIRAM o produto da vitrine — os que o aluno
 * não resolve hoje. `sem_cpf` e `sem_email` ficam de fora de propósito:
 * são pendências do cadastro dele, e viram aviso com link para o Perfil.
 */
const OCULTAM = new Set(['limite', 'legado', 'elegibilidade', 'inexistente'])

/**
 * Planos do Portal do Aluno.
 *
 * A versão anterior listava todo o catálogo numa coluna só — mensal,
 * semestral, turma fixa e avulsos misturados, cada cartão com as regras
 * inteiras. Para escolher era preciso LER tudo.
 *
 * Agora a tela faz uma pergunta por vez, na mesma lógica do catálogo da
 * equipe (produtos/ProdutosPage):
 *
 *   1. formato  — Por créditos | Turma fixa
 *   2. período  — Mensal | Semestral (só os produtos daquele formato)
 *   3. cartão   — quanto entrega e quanto custa; nada mais
 *   4. folha    — regras, cobrança e confirmação, sob demanda
 *
 * Avulsos ficam numa vitrine própria no fim, mais leve, para não
 * competir com a decisão principal.
 *
 * Formato e período moram na URL (?tipo=&periodo=): o "voltar" do
 * celular desfaz a última escolha, e a equipe pode mandar um link que
 * já abre em "Turma fixa → Semestral".
 */
export function PlanosPage() {
  const clienteId = usePortalClienteId()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: todosOsProdutos, isLoading: carregandoPlanos } = usePlanos()
  const { porProduto: restricoes, isLoading: carregandoRestricoes } = useRestricoesCatalogo()
  const { data: meusPlanos } = useMeusPlanos()
  const { data: config } = useConfigAgendamento()
  const { data: requisitos } = useRequisitos()
  const contratar = useContratarPlano()
  /*
    O abatimento da experimental (10.1) é informação de VENDA: tem de
    estar na tela antes de o aluno escolher, não depois do pedido. Só
    vale em plano que renova — avulsa e pacote são compra pontual —, e é
    a mesma condição que solicitar_contratacao() aplica no banco.
  */
  const { data: abatimento } = useAbatimentoDisponivel()
  /*
    Crédito extra (A29): a validade real é o MENOR entre os dias do
    produto e o fim do ciclo do plano que torna a pessoa elegível — a
    mesma conta que matricular_produto() aplica ao criar o lote. A tela
    mostra a data em vez do prazo porque "30 dias" num ciclo que fecha em
    3 é meia cláusula.
  */
  const exigePlanoAtivo = useMemo(
    () => new Set((requisitos ?? []).filter((r) => r.tipo === 'plano_ativo').map((r) => r.produto_id)),
    [requisitos],
  )
  const fimDoCiclo = useMemo(() => {
    const fins = (meusPlanos ?? [])
      .filter((m) => m.status === 'ativa' && m.data_fim)
      .map((m) => m.data_fim as string)
    return fins.length > 0 ? fins.sort()[fins.length - 1] : null
  }, [meusPlanos])
  const validadeDoExtra = (p: Produto | null) => {
    if (!p || !fimDoCiclo || !exigePlanoAtivo.has(p.id)) return null
    const dias = p.validade_creditos_dias ?? p.periodicidade_dias
    const porDias = somarDias(hojeIso(), dias)
    return porDias < fimDoCiclo ? porDias : fimDoCiclo
  }
  const abatimentoDoProduto = (p: Produto | null) =>
    p && abatimento?.tem && p.renova_automaticamente && p.preco_centavos > 0
      ? { valor_centavos: abatimento.valor_centavos, prazo_ate: abatimento.prazo_ate }
      : null

  const [folha, setFolha] = useState<FolhaAberta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [contratado, setContratado] = useState<Produto | null>(null)
  const [linkPagamento, setLinkPagamento] = useState<string | null>(null)
  /** Turma fixa: as turmas escolhidas na folha, antes de pedir. */
  const [turmas, setTurmas] = useState<string[]>([])
  /** Turma fixa: o pedido já saiu e espera a equipe confirmar a vaga. */
  const [pedido, setPedido] = useState<Produto | null>(null)
  const { data: solicitacaoAberta } = useSolicitacaoAberta()

  /*
    Produto que este aluno não pode contratar não entra na vitrine.
    Antes ele aparecia, era escolhido, e o erro vinha no clique — o caso
    concreto é a aluna que já fez a experimental e continuava vendo
    "Aula experimental" no catálogo.

    Pendência do CADASTRO dela (sem CPF, sem e-mail) não esconde nada:
    ela resolve no Perfil em dois minutos, e esconder o catálogo inteiro
    faria a tela parecer quebrada. Vira o aviso abaixo.
  */
  const produtos = useMemo(
    () => (todosOsProdutos ?? []).filter((p) => !OCULTAM.has(restricoes.get(p.id)?.codigo ?? '')),
    [todosOsProdutos, restricoes],
  )

  /** Falta dado no cadastro dela para qualquer plano ser cobrável. */
  const pendenciaCadastro = useMemo(() => {
    for (const p of produtos) {
      const r = restricoes.get(p.id)
      if (r && (r.codigo === 'sem_cpf' || r.codigo === 'sem_email')) return r.codigo
    }
    return null
  }, [produtos, restricoes])

  const isLoading = carregandoPlanos || carregandoRestricoes

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos])

  const porLugar = useMemo(() => {
    const m: Record<TipoPlano | 'avulso', Produto[]> = { creditos: [], turma_fixa: [], avulso: [] }
    for (const p of produtos) m[lugarDoProduto(p)].push(p)
    return m
  }, [produtos])

  /** Selos de requisito por produto ("Primeira vez aqui"). */
  const selosPorProduto = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const r of requisitos ?? []) {
      m.set(r.produto_id, [...(m.get(r.produto_id) ?? []), REQUISITO_SELO[r.tipo]])
    }
    return m
  }, [requisitos])

  // ---- 1. formato ----
  const tiposDisponiveis = TIPOS_PLANO.filter((t) => porLugar[t].length > 0)
  // Com um formato só no catálogo não há o que perguntar.
  const tipo: TipoPlano | null =
    tiposDisponiveis.length === 1
      ? tiposDisponiveis[0]
      : (tiposDisponiveis.find((t) => t === params.get('tipo')) ?? null)
  const doTipo = tipo ? porLugar[tipo] : []

  // ---- 2. período ----
  const periodosDisponiveis = PERIODOS.filter((r) =>
    doTipo.some((p) => recorrenciaDoProduto(p) === r),
  )
  const periodo: Recorrencia =
    periodosDisponiveis.find((r) => r === params.get('periodo')) ?? periodosDisponiveis[0] ?? 'mensal'
  const visiveis = doTipo.filter((p) => recorrenciaDoProduto(p) === periodo)

  const referencia = (r: Recorrencia) => doTipo.find((p) => recorrenciaDoProduto(p) === r)
  const semestralRef = referencia('semestral')
  const temEconomia = doTipo.some(
    (p) => recorrenciaDoProduto(p) === 'semestral' && (economiaNoCompromisso(p, porId) ?? 0) > 0,
  )
  const legendasPeriodo: Record<Recorrencia, string> = {
    mensal: 'sem compromisso',
    semestral: semestralRef
      ? `${semestralRef.ciclos_compromisso} meses${temEconomia ? ' · valor menor' : ''}`
      : '',
  }

  // O cartão diz "8 aulas", não o nome. Dois produtos com o mesmo número
  // no mesmo período (um plano antigo ao lado do novo) ficariam idênticos;
  // só nesses casos o nome aparece para desempatar.
  const chaveNumero = (p: Produto) => `${p.turmas_fixas}-${p.creditos_por_ciclo}`
  const numerosRepetidos = new Map<string, number>()
  for (const p of visiveis) {
    numerosRepetidos.set(chaveNumero(p), (numerosRepetidos.get(chaveNumero(p)) ?? 0) + 1)
  }

  function escolherTipo(t: TipoPlano) {
    const novo = new URLSearchParams(params)
    novo.set('tipo', t)
    setParams(novo)
  }

  function escolherPeriodo(r: Recorrencia) {
    const novo = new URLSearchParams(params)
    novo.set('periodo', r)
    // Trocar de período não é um passo: o "voltar" deve desfazer o formato.
    setParams(novo, { replace: true })
  }

  /*
    "Meu plano" manda o aluno para cá com ?contrato=<pedido> quando a vaga
    foi aprovada e falta o aceite. O passo do contrato mora aqui, e uma
    implementação só é o motivo de o link ser uma rota em vez de um
    segundo ContratoPasso dentro de "Meu plano".
  */
  const contratoNaUrl = params.get('contrato')
  useEffect(() => {
    if (!contratoNaUrl || !solicitacaoAberta?.id) return
    if (String(solicitacaoAberta.id) !== contratoNaUrl) return
    if (!solicitacaoAberta.produto_id) return
    setFolha({
      tipo: 'contrato',
      produtoId: String(solicitacaoAberta.produto_id),
      solicitacaoId: contratoNaUrl,
    })
  }, [contratoNaUrl, solicitacaoAberta?.id, solicitacaoAberta?.produto_id])

  function abrirFolha(f: FolhaAberta) {
    setErro(null)
    if (f.tipo === 'turma_fixa') setTurmas([])
    setFolha(f)
  }

  /**
   * Contratar deixou de ser o último passo.
   *
   * O pedido nasce, e o aluno vai direto para o Contrato de Adesão: ele
   * lê as cláusulas do produto que escolheu, aceita, e **só então** paga.
   * `registrar_cobranca` recusa emitir cobrança sem contrato aceito, então
   * esta ordem não é convenção de tela — é o que o banco exige.
   */
  function confirmar(p: Produto) {
    setErro(null)
    contratar.mutate(
      { clienteId, planoId: p.id },
      {
        onSuccess: (solicitacaoId) => {
          setFolha({ tipo: 'contrato', produtoId: p.id, solicitacaoId: String(solicitacaoId) })
          window.scrollTo({ top: 0 })
        },
        onError: (e) => {
          // Pedido em aberto do MESMO produto não é erro: é o aluno
          // voltando. Retoma de onde parou em vez de pedir que cancele.
          const aberto = solicitacaoAberta
          if (
            aberto?.id &&
            aberto.produto_id === p.id &&
            /pedido em aberto/i.test((e as { message?: string }).message ?? '')
          ) {
            setFolha({ tipo: 'contrato', produtoId: p.id, solicitacaoId: String(aberto.id) })
            window.scrollTo({ top: 0 })
            return
          }
          setErro(mensagemErroContratacao(e))
        },
      },
    )
  }

  /**
   * Turma fixa: o pedido vai para a fila, e NÃO para o contrato.
   *
   * É a diferença inteira em relação a `confirmar()`: aqui não existe
   * cobrança para o contrato preceder, porque a vaga ainda não está
   * confirmada. O contrato aparece depois da aprovação, em "Meu plano".
   */
  function pedirTurmaFixa(p: Produto) {
    setErro(null)
    contratar.mutate(
      { clienteId, planoId: p.id, turmaIds: turmas },
      {
        onSuccess: () => {
          setFolha(null)
          setPedido(p)
          window.scrollTo({ top: 0 })
        },
        onError: (e) => setErro(mensagemErroContratacao(e)),
      },
    )
  }

  const horasCancelamento = (p: Produto | undefined) =>
    p?.horas_cancelamento ?? config?.horas_cancelamento ?? null

  const planoAtivo = (meusPlanos ?? []).find((s) => s.saldo > 0 && s.status === 'ativa')

  if (pedido) {
    return (
      <TurmaFixaSolicitada
        produto={pedido}
        onInicio={() => navigate('..')}
        onMeuPlano={() => navigate('../meu-plano')}
      />
    )
  }

  if (contratado) {
    return (
      <ContratoAceito
        produto={contratado}
        urlPagamento={linkPagamento}
        onInicio={() => navigate('..')}
        onMeuPlano={() => navigate('../meu-plano')}
      />
    )
  }

  const produtoDaFolha =
    folha && (folha.tipo === 'comprar' || folha.tipo === 'turma_fixa' || folha.tipo === 'contrato')
      ? porId.get(folha.produtoId)
      : undefined

  return (
    <div className="lg:max-w-4xl">
      <Cabecalho titulo="Planos" subtitulo="Escolha como você quer treinar." />

      {pendenciaCadastro && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning-200 bg-warning-50 p-3.5 text-sm text-warning-800">
          <span>
            {pendenciaCadastro === 'sem_cpf'
              ? 'Falta o seu CPF no cadastro. Ele é obrigatório para emitir a cobrança.'
              : 'Falta o seu e-mail no cadastro. É por ele que chegam a confirmação e o link de pagamento.'}
          </span>
          <Link to="../perfil" className="text-xs font-semibold underline underline-offset-2">
            Completar cadastro
          </Link>
        </div>
      )}

      {planoAtivo && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50 p-3.5 text-sm text-brand-700">
          {/* A data que importa para ela é a que o CRÉDITO vence, não a
              do ciclo — são diferentes quando o produto tem validade
              própria. Renovação, cancelamento e regras moram em "Meu
              plano"; aqui é só o lembrete de que ela já tem aulas. */}
          <span>
            Você tem <strong>{planoAtivo.saldo}</strong> {planoAtivo.saldo === 1 ? 'crédito' : 'créditos'} para
            usar
            {planoAtivo.proxima_validade ? `, até ${fmtData(planoAtivo.proxima_validade)}` : ''}.
          </span>
          <Link to="../meu-plano" className="text-xs font-semibold underline underline-offset-2">
            Ver meu plano
          </Link>
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {!isLoading && produtos.length === 0 && (
        <p className="py-4 text-center text-sm text-neutral-400">Nenhum plano disponível no momento.</p>
      )}

      {/* ---- 1. Qual formato ---- */}
      {tiposDisponiveis.length > 1 && (
        <section className="mb-6">
          <Rotulo>Qual plano combina com você?</Rotulo>
          <EscolhaTipo
            valor={tipo}
            onChange={escolherTipo}
            opcoes={tiposDisponiveis.map((t) => {
              const menor = menorPreco(porLugar[t])
              return {
                tipo: t,
                aPartirDe: menor ? `${fmtPreco(menor.preco_centavos)}${sufixoPreco(menor)}` : null,
              }
            })}
          />
        </section>
      )}

      {/* ---- 2 e 3. Período e planos ---- */}
      {tipo && (
        <section className="mb-8">
          {periodosDisponiveis.length > 1 && (
            <>
              <Rotulo
                acao={
                  <LinkFolha onClick={() => abrirFolha({ tipo: 'comparar' })}>
                    Qual a diferença?
                  </LinkFolha>
                }
              >
                Escolha o período
              </Rotulo>
              <div className="mb-4">
                <SeletorPeriodo valor={periodo} onChange={escolherPeriodo} legendas={legendasPeriodo} />
              </div>
            </>
          )}

          <div className="grid gap-2.5 lg:grid-cols-2">
            {visiveis.map((p) => (
              <CartaoPlano
                key={p.id}
                produto={p}
                semestral={periodo === 'semestral'}
                economia={periodo === 'semestral' ? economiaNoCompromisso(p, porId) : null}
                mostrarNome={(numerosRepetidos.get(chaveNumero(p)) ?? 0) > 1}
                onEscolher={() =>
                  abrirFolha(
                    tipo === 'turma_fixa'
                      ? { tipo: 'turma_fixa', produtoId: p.id }
                      : { tipo: 'comprar', produtoId: p.id },
                  )
                }
              />
            ))}
          </div>

          {/*
            As regras decisivas ficam À VISTA, não atrás de um clique.
            O link para a folha continua, com a lista inteira — mas as
            três que mudam a escolha (o crédito expira, o prazo de
            cancelamento, a renovação automática) não podem depender de
            o aluno ter curiosidade de abrir "Como funcionam os
            créditos?". Pedido da gestão em 30/09/2026.
          */}
          <RegrasEssenciais
            className="mt-3.5"
            tipo={tipo}
            referencia={visiveis[0]}
            horasCancelamento={horasCancelamento(visiveis[0])}
          />

          <div className="mt-3.5 flex justify-center">
            <LinkFolha onClick={() => abrirFolha({ tipo: 'regras', de: tipo })}>
              <Info className="size-3.5" />
              {tipo === 'creditos' ? 'Ver todas as regras dos créditos' : 'Ver regras da turma fixa'}
            </LinkFolha>
          </div>
        </section>
      )}

      {/* ---- Avulsos ---- */}
      {porLugar.avulso.length > 0 && (
        <section className="border-t border-neutral-200 pt-6">
          <Rotulo>Aulas avulsas e experiências</Rotulo>
          <p className="-mt-1 mb-3 text-xs text-neutral-500">
            Sem mensalidade: pague só pelo que for usar.
          </p>
          <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {porLugar.avulso.map((p) => (
              <LinhaAvulso
                key={p.id}
                produto={p}
                selos={selosPorProduto.get(p.id) ?? []}
                onAbrir={() => abrirFolha({ tipo: 'comprar', produtoId: p.id })}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- Suporte antes da compra ---- */}
      <AjudaWhatsApp
        className="mt-8"
        mensagem="Olá! Estou vendo os planos no portal do aluno e ficou uma dúvida:"
      />

      {/* ---- Folhas ---- */}
      {folha?.tipo === 'comprar' && produtoDaFolha && (
        <Folha titulo={<TituloPlano produto={produtoDaFolha} />} onFechar={() => setFolha(null)}>
          <ConfirmarCompra
            produto={produtoDaFolha}
            horasCancelamento={horasCancelamento(produtoDaFolha)}
            abatimento={abatimentoDoProduto(produtoDaFolha)}
            validadeAte={validadeDoExtra(produtoDaFolha)}
            selos={selosPorProduto.get(produtoDaFolha.id) ?? []}
            erro={erro}
            pendente={contratar.isPending}
            onConfirmar={() => confirmar(produtoDaFolha)}
            onVoltar={() => setFolha(null)}
          />
        </Folha>
      )}

      {folha?.tipo === 'turma_fixa' && produtoDaFolha && (
        <Folha titulo={<TituloPlano produto={produtoDaFolha} />} onFechar={() => setFolha(null)}>
          <PedirTurmaFixa
            produto={produtoDaFolha}
            selecionadas={turmas}
            onSelecionar={setTurmas}
            onPedir={() => pedirTurmaFixa(produtoDaFolha)}
            pendente={contratar.isPending}
            erro={erro}
            onVerRegras={() => abrirFolha({ tipo: 'regras', de: 'turma_fixa' })}
          />
        </Folha>
      )}

      {folha?.tipo === 'comparar' && tipo && (
        <Folha titulo="Mensal ou semestral?" onFechar={() => setFolha(null)}>
          <ComparativoPeriodo tipo={tipo} mensal={referencia('mensal')} semestral={semestralRef} />
        </Folha>
      )}

      {folha?.tipo === 'contrato' && produtoDaFolha && (
        <Folha titulo="Contrato de Adesão" onFechar={() => setFolha(null)}>
          <ContratoPasso
            solicitacaoId={folha.solicitacaoId}
            nomeProduto={produtoDaFolha.nome}
            onAceito={(url) => {
              setFolha(null)
              setLinkPagamento(url)
              setContratado(produtoDaFolha)
              window.scrollTo({ top: 0 })
            }}
            onVoltar={() => setFolha(null)}
          />
        </Folha>
      )}

      {folha?.tipo === 'regras' && (
        <Folha
          titulo={folha.de === 'creditos' ? 'Como funcionam os créditos' : 'Como funciona a turma fixa'}
          onFechar={() => setFolha(null)}
        >
          {folha.de === 'creditos' ? (
            <RegrasCreditos
              referencia={visiveis[0]}
              horasCancelamento={horasCancelamento(visiveis[0])}
            />
          ) : (
            <RegrasTurmaFixa />
          )}
        </Folha>
      )}
    </div>
  )
}

/**
 * Depois do aceite do contrato — e antes do pagamento.
 *
 * Esta tela já disse duas coisas diferentes, e as duas estavam erradas no
 * momento em que foram escritas. Primeiro "Plano ativado! Suas aulas já
 * estão liberadas", quando contratar matriculava na hora. Depois "o
 * estúdio vai confirmar", quando havia aprovação manual. Agora o plano de
 * crédito não espera ninguém: o que falta é só o pagamento, e é isso que
 * ela diz.
 *
 * O link de pagamento não é prometido aqui como "já disponível" porque
 * quem o emite é o gateway, logo depois — então a tela manda o aluno para
 * "Meu plano", que é onde o link aparece e fica.
 */
function ContratoAceito({
  produto: p,
  urlPagamento,
  onInicio,
  onMeuPlano,
}: {
  produto: Produto
  /** Null quando o gateway não respondeu — o link vai por e-mail. */
  urlPagamento: string | null
  onInicio: () => void
  onMeuPlano: () => void
}) {
  return (
    <div className="pt-10 text-center">
      <div className="mb-3 text-4xl">📄</div>
      <h1 className="mb-2 text-xl font-semibold text-neutral-900">Contrato aceito!</h1>
      <p className="mb-1 text-sm text-neutral-600">
        Guardamos a versão que você aceitou do <b>{p.nome}</b>, com data e hora. Ela fica em{' '}
        <b>Meu plano → Documentos</b>.
      </p>
      <p className="mb-8 text-xs text-neutral-400">
        {urlPagamento
          ? 'Falta só o pagamento. Seus créditos são liberados assim que ele for confirmado.'
          : 'Falta o pagamento. O link chega no seu e-mail em alguns minutos e também aparece em “Meu plano”.'}
      </p>

      {urlPagamento ? (
        <a
          href={urlPagamento}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Pagar agora
        </a>
      ) : (
        <button
          onClick={onMeuPlano}
          className="w-full rounded-md bg-brand-600 py-3 text-sm font-medium text-white hover:bg-brand-700"
        >
          Ir para “Meu plano”
        </button>
      )}

      <button
        onClick={urlPagamento ? onMeuPlano : onInicio}
        className="mt-2 w-full rounded-md py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-800"
      >
        {urlPagamento ? 'Pagar depois, ver meu plano' : 'Voltar ao início'}
      </button>
    </div>
  )
}

/**
 * Pedido de turma fixa enviado — e nada cobrado.
 *
 * A frase que importa é a terceira. O aluno acabou de clicar em "Pedir
 * esta vaga" num plano de R$ 130 e vai esperar horas por uma resposta; se
 * a tela não disser que não houve cobrança, a primeira coisa que ele faz
 * é abrir o WhatsApp para perguntar. Dizer aqui é mais barato que
 * responder depois — e é o que o pedido da gestão exige em letra:
 * "nenhuma cobrança será realizada antes da confirmação".
 */
function TurmaFixaSolicitada({
  produto: p,
  onInicio,
  onMeuPlano,
}: {
  produto: Produto
  onInicio: () => void
  onMeuPlano: () => void
}) {
  return (
    <div className="pt-10 text-center">
      <div className="mb-3 text-4xl">🗓️</div>
      <h1 className="mb-2 text-xl font-semibold text-neutral-900">Recebemos sua solicitação!</h1>
      <p className="mb-1 text-sm text-neutral-600">
        Você pediu <b>{p.nome}</b>. A equipe vai confirmar se a turma que você escolheu tem vaga.
      </p>
      <p className="mb-1 text-sm font-medium text-neutral-800">
        Nenhuma cobrança será realizada antes da confirmação.
      </p>
      <p className="mb-8 text-xs text-neutral-400">
        Assim que a vaga for confirmada, você recebe um e-mail e o pagamento aparece aqui no app. Se
        não houver vaga nesse horário, a gente avisa e você escolhe outro — sem custo nenhum.
      </p>

      <button
        onClick={onMeuPlano}
        className="w-full rounded-md bg-brand-600 py-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        Acompanhar em “Meu plano”
      </button>
      <button
        onClick={onInicio}
        className="mt-2 w-full rounded-md py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-800"
      >
        Voltar ao início
      </button>
    </div>
  )
}
