import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import { fmtData } from '../../lib/datas'
import { useRequisitos } from '../produtos/hooks/useProdutos'
import { usePortalClienteId } from './PortalClienteContext'
import {
  useConfigAgendamento,
  useContratarPlano,
  useMeuSaldo,
  usePlanos,
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
import { Folha } from './components/planos/Folha'

type FolhaAberta =
  | { tipo: 'comprar'; produtoId: string }
  | { tipo: 'turma_fixa'; produtoId: string }
  | { tipo: 'comparar' }
  | { tipo: 'regras'; de: TipoPlano }

const PERIODOS: Recorrencia[] = ['mensal', 'semestral']

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
  const { data: produtos, isLoading } = usePlanos()
  const { data: saldos } = useMeuSaldo()
  const { data: config } = useConfigAgendamento()
  const { data: requisitos } = useRequisitos()
  const contratar = useContratarPlano()

  const [folha, setFolha] = useState<FolhaAberta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [contratado, setContratado] = useState<Produto | null>(null)

  const porId = useMemo(() => new Map((produtos ?? []).map((p) => [p.id, p])), [produtos])

  const porLugar = useMemo(() => {
    const m: Record<TipoPlano | 'avulso', Produto[]> = { creditos: [], turma_fixa: [], avulso: [] }
    for (const p of produtos ?? []) m[lugarDoProduto(p)].push(p)
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

  function abrirFolha(f: FolhaAberta) {
    setErro(null)
    setFolha(f)
  }

  function confirmar(p: Produto) {
    setErro(null)
    contratar.mutate(
      { clienteId, planoId: p.id },
      {
        onSuccess: () => {
          setFolha(null)
          setContratado(p)
          window.scrollTo({ top: 0 })
        },
        onError: (e) => setErro(mensagemErroContratacao(e)),
      },
    )
  }

  const horasCancelamento = (p: Produto | undefined) =>
    p?.horas_cancelamento ?? config?.horas_cancelamento ?? null

  const planoAtivo = (saldos ?? []).find((s) => (s.saldo ?? 0) > 0)

  if (contratado) {
    return (
      <Contratado
        produto={contratado}
        onAgendar={() => navigate('../agenda')}
        onInicio={() => navigate('..')}
      />
    )
  }

  const produtoDaFolha =
    folha && (folha.tipo === 'comprar' || folha.tipo === 'turma_fixa')
      ? porId.get(folha.produtoId)
      : undefined

  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold text-neutral-900">Planos</h1>

      {planoAtivo && (
        <div className="mb-6 rounded-xl border border-brand-100 bg-brand-50 p-3.5 text-sm text-brand-700">
          {/* A data que importa para ela é a que o CRÉDITO vence, não a
              do ciclo — são diferentes quando o produto tem validade
              própria. Até agora esta caixa nem aparecia: o saldo vinha
              sempre 0 porque faltava policy de leitura no razão. */}
          Você tem <strong>{planoAtivo.saldo}</strong> aula{planoAtivo.saldo === 1 ? '' : 's'} para
          usar
          {planoAtivo.proxima_validade
            ? `, até ${fmtData(planoAtivo.proxima_validade)}`
            : `, até ${fmtData(planoAtivo.data_fim)}`}
          .
          {planoAtivo.cancelamento_efetivo_em ? (
            <span className="mt-1 block text-xs">
              Sua assinatura foi cancelada e não será cobrada de novo. Você continua com acesso até{' '}
              {fmtData(planoAtivo.cancelamento_efetivo_em)}.
            </span>
          ) : planoAtivo.renova_automaticamente ? (
            <span className="mt-1 block text-xs">
              Renova sozinho em {fmtData(planoAtivo.data_fim)}, com nova cobrança. Para parar, fale
              com o estúdio.
            </span>
          ) : null}
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {!isLoading && (produtos ?? []).length === 0 && (
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

          <div className="flex flex-col gap-2.5">
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

          <div className="mt-3.5 flex justify-center">
            <LinkFolha onClick={() => abrirFolha({ tipo: 'regras', de: tipo })}>
              <Info className="size-3.5" />
              {tipo === 'creditos' ? 'Como funcionam os créditos?' : 'Ver regras da turma fixa'}
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

      {/* ---- Folhas ---- */}
      {folha?.tipo === 'comprar' && produtoDaFolha && (
        <Folha titulo={<TituloPlano produto={produtoDaFolha} />} onFechar={() => setFolha(null)}>
          <ConfirmarCompra
            produto={produtoDaFolha}
            horasCancelamento={horasCancelamento(produtoDaFolha)}
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
            onVerRegras={() => abrirFolha({ tipo: 'regras', de: 'turma_fixa' })}
            onFechar={() => setFolha(null)}
          />
        </Folha>
      )}

      {folha?.tipo === 'comparar' && tipo && (
        <Folha titulo="Mensal ou semestral?" onFechar={() => setFolha(null)}>
          <ComparativoPeriodo tipo={tipo} mensal={referencia('mensal')} semestral={semestralRef} />
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
 * Tela de sucesso. O texto depende do que foi comprado: aula particular
 * e treino livre não liberam crédito nenhum, e "suas aulas já estão
 * liberadas" mandaria a pessoa para uma Agenda onde não há o que agendar.
 */
function Contratado({
  produto: p,
  onAgendar,
  onInicio,
}: {
  produto: Produto
  onAgendar: () => void
  onInicio: () => void
}) {
  const liberaAulas = p.gera_credito && p.creditos_por_ciclo > 0
  const ehPlano = lugarDoProduto(p) !== 'avulso'

  return (
    <div className="pt-10 text-center">
      <div className="mb-3 text-4xl">🎉</div>
      <h1 className="mb-2 text-xl font-semibold text-neutral-900">
        {ehPlano ? 'Plano ativado!' : 'Compra confirmada!'}
      </h1>
      <p className="mb-1 text-sm text-neutral-600">
        {liberaAulas
          ? 'Suas aulas já estão liberadas.'
          : 'Agora é só combinar o horário com o estúdio.'}
      </p>
      <p className="mb-8 text-xs text-neutral-400">
        O pagamento é combinado direto com o estúdio (PIX ou na recepção). Em breve você poderá
        pagar por aqui, no cartão recorrente.
      </p>
      <button
        onClick={liberaAulas ? onAgendar : onInicio}
        className="w-full rounded-md bg-brand-600 py-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        {liberaAulas ? 'Agendar primeira aula' : 'Voltar ao início'}
      </button>
    </div>
  )
}
