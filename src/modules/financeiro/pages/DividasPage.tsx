import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  HandCoins,
  Plus,
  RotateCcw,
  Wallet,
} from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { KpiCard } from '../../../components/ui/KpiCard'
import { Modal } from '../../../components/ui/Modal'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionTitle } from '../../../components/ui/SectionTitle'
import { Select } from '../../../components/ui/Select'
import { cn } from '../../../components/ui/cn'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import type { MovimentoDivida } from '../types'
import {
  useAtualizarDivida,
  useCriarDivida,
  useDividas,
  useSalvarCronogramaDivida,
  useRegistrarPagamentoDivida,
} from '../hooks/useFinanceiro'

const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'
const hojeISO = () => new Date().toISOString().slice(0, 10)

type DividaComSaldo = ReturnType<typeof useDividas>['data'] extends (infer T)[] | undefined ? T : never

/** Descrição pode ser nula; sem rótulo a linha viraria um valor sem nome. */
const rotulo = (d: DividaComSaldo) => d.descricao?.trim() || 'Empréstimo'

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`

/**
 * Tudo o que uma pessoa emprestou, somado. É a unidade da tela: quem chega
 * aqui pela primeira vez quer saber "quanto o estúdio deve para a Fulana",
 * não "qual o saldo do empréstimo #2 dela".
 */
type Credor = {
  nome: string
  /** Todos os empréstimos, do mais antigo ao mais novo. */
  dividas: DividaComSaldo[]
  abertas: DividaComSaldo[]
  /** Valor original somado — o quanto entrou no caixa vindo dessa pessoa. */
  emprestado: number
  /** Já devolvido (saídas 'paga' apontando para os empréstimos dela). */
  devolvido: number
  /** Parcelas 'prevista' já agendadas, ainda não pagas. */
  programado: number
  /**
   * O que falta devolver, contando só empréstimos ainda em aberto.
   *
   * Quando há cronograma, é ELE que manda: um parcelamento com juros cobra
   * mais que o principal, e medir pelo principal esconderia o juro.
   */
  falta: number
  /** Quanto o cronograma cobra além do principal. Zero quando não há juro. */
  juros: number
  /**
   * Empréstimo marcado como quitado sem pagamento correspondente (perdão,
   * acerto por fora, arredondamento). Vira nota de rodapé no card em vez de
   * sumir silenciosamente do total.
   */
  baixado: number
  tudoQuitado: boolean
  desde: string
}

function agruparPorCredor(dividas: DividaComSaldo[]): Credor[] {
  const mapa = new Map<string, DividaComSaldo[]>()
  for (const d of dividas) {
    const nome = d.credor.trim()
    mapa.set(nome, [...(mapa.get(nome) ?? []), d])
  }

  return [...mapa.entries()]
    .map(([nome, lista]) => {
      const ordenadas = [...lista].sort((a, b) => a.criada_em.localeCompare(b.criada_em))
      const abertas = ordenadas.filter((d) => !d.quitada)
      const emprestado = ordenadas.reduce((s, d) => s + d.valor_centavos, 0)
      const devolvido = ordenadas.reduce((s, d) => s + d.pago_centavos, 0)
      const programado = abertas.reduce((s, d) => s + d.programado_centavos, 0)
      const saldoPrincipal = abertas.reduce((s, d) => s + Math.max(d.valor_centavos - d.pago_centavos, 0), 0)
      // Quem pegou R$ 6.700 e parcelou em 12 × R$ 777,13 deve R$ 9.325,56,
      // não R$ 6.700 — a diferença é juro do parcelamento. Medir só pelo
      // principal, como esta tela fazia, some com o juro da dívida inteira.
      // O `max` cobre o cronograma incompleto: enquanto só parte dos meses
      // está agendada, o principal que falta ainda é o número maior.
      const falta = Math.max(programado, saldoPrincipal)
      return {
        nome,
        dividas: ordenadas,
        abertas,
        emprestado,
        devolvido,
        programado,
        falta,
        juros: Math.max(devolvido + falta - emprestado, 0),
        baixado: Math.max(emprestado - devolvido - saldoPrincipal, 0),
        tudoQuitado: abertas.length === 0,
        desde: ordenadas[0]?.criada_em ?? '',
      }
    })
    .sort((a, b) => b.falta - a.falta || a.nome.localeCompare(b.nome))
}

/**
 * Dívidas — empréstimos que o estúdio recebeu e precisa devolver.
 *
 * A tela é agrupada **por pessoa**, não por linha da tabela `dividas`.
 * Cada `dividas` é um aporte; a mesma pessoa costuma emprestar mais de uma
 * vez ("Empréstimo", "Empréstimo (parcela adicional)"), e listar um card
 * por aporte fazia a pergunta central — quanto o estúdio deve para ela —
 * exigir soma mental.
 *
 * O quanto já foi pago NÃO é uma coluna: é a soma das saídas que apontam
 * para a dívida (`saidas_financeiras.divida_id`). Isso faz o histórico, o
 * saldo restante e o que aparece em Saídas serem sempre a mesma verdade —
 * e o cronograma de parcelas vira lançamento previsto no mês certo, sem
 * cadastro duplicado.
 */
export function DividasPage() {
  const { data: dividas, isLoading } = useDividas()
  const [nova, setNova] = useState(false)
  const [verQuitadas, setVerQuitadas] = useState(false)

  const credores = useMemo(() => agruparPorCredor(dividas ?? []), [dividas])
  const devendo = useMemo(() => credores.filter((c) => !c.tudoQuitado), [credores])
  const quitados = useMemo(() => credores.filter((c) => c.tudoQuitado), [credores])

  const falta = devendo.reduce((s, c) => s + c.falta, 0)
  const programado = devendo.reduce((s, c) => s + c.programado, 0)
  const juros = devendo.reduce((s, c) => s + c.juros, 0)
  const devolvido = credores.reduce((s, c) => s + c.devolvido, 0)
  const emprestado = credores.reduce((s, c) => s + c.emprestado, 0)
  const totalEmprestimos = credores.reduce((s, c) => s + c.dividas.length, 0)
  const pct = emprestado > 0 ? Math.round((devolvido / emprestado) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Dívidas"
        subtitulo="Dinheiro que alguém emprestou ao estúdio e precisa ser devolvido. Cada pagamento registrado aqui vira uma saída no mês em que sai do caixa — mas não conta como despesa no resultado, porque é devolução de capital."
        acoes={
          <Button onClick={() => setNova(true)}>
            <HandCoins className="size-4" />
            Registrar empréstimo
          </Button>
        }
      />

      {/* Os três números que a tela precisa responder de imediato, na ordem
          em que a pergunta é feita: quanto ainda devo, quanto já paguei,
          quanto peguei no total. "Falta devolver" ocupa o dobro de espaço
          porque é o único que exige ação. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          className="sm:col-span-2"
          size="lg"
          label="Falta devolver"
          value={fmtCentavos(falta)}
          icon={HandCoins}
          tone={falta > 0 ? 'warning' : 'success'}
          hint={
            falta > 0
              ? `para ${plural(devendo.length, 'pessoa', 'pessoas')}${
                  programado > 0 ? ` · ${fmtCentavos(programado)} já em parcelas programadas` : ''
                }${juros > 0 ? ` · inclui ${fmtCentavos(juros)} de juros do parcelamento` : ''}`
              : 'nenhum empréstimo em aberto'
          }
        />
        <KpiCard
          label="Já devolvido"
          value={fmtCentavos(devolvido)}
          icon={CheckCircle2}
          tone="success"
          hint={emprestado > 0 ? `${pct}% do total emprestado` : undefined}
        />
        <KpiCard
          label="Total emprestado"
          value={fmtCentavos(emprestado)}
          icon={Wallet}
          tone="neutral"
          hint={
            totalEmprestimos > 0
              ? `${plural(totalEmprestimos, 'empréstimo', 'empréstimos')} de ${plural(
                  credores.length,
                  'pessoa',
                  'pessoas',
                )}`
              : undefined
          }
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : credores.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Nenhum empréstimo registrado"
          description="Quando alguém emprestar dinheiro ao estúdio, registre aqui para acompanhar quanto já foi devolvido."
          action={
            <Button className="mt-2" onClick={() => setNova(true)}>
              <HandCoins className="size-4" />
              Registrar empréstimo
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {devendo.length > 0 && (
            <section>
              <SectionTitle direita={`${fmtCentavos(falta)} em aberto`}>
                Quem o estúdio ainda deve · {plural(devendo.length, 'pessoa', 'pessoas')}
              </SectionTitle>
              <ul className="flex flex-col gap-3">
                {devendo.map((c) => (
                  <CardCredor key={c.nome} credor={c} />
                ))}
              </ul>
            </section>
          )}

          {quitados.length > 0 && (
            <section>
              {/* Quitados começam fechados: são histórico, não pendência. */}
              <button
                onClick={() => setVerQuitadas((v) => !v)}
                aria-expanded={verQuitadas}
                className="flex w-full items-center gap-2 border-b border-neutral-100 pb-1.5 text-left"
              >
                <ChevronDown
                  className={cn(
                    'size-3.5 shrink-0 text-neutral-400 transition-transform',
                    verQuitadas ? '' : '-rotate-90',
                  )}
                />
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Já quitados · {plural(quitados.length, 'pessoa', 'pessoas')}
                </h4>
                <span className="ml-auto text-xs font-semibold tabular-nums text-neutral-500">
                  {fmtCentavos(quitados.reduce((s, c) => s + c.emprestado, 0))}
                </span>
              </button>
              {verQuitadas && (
                <ul className="mt-3 flex flex-col gap-3">
                  {quitados.map((c) => (
                    <CardCredor key={c.nome} credor={c} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {nova && (
        <NovoEmprestimoModal nomesConhecidos={credores.map((c) => c.nome)} onFechar={() => setNova(false)} />
      )}
    </div>
  )
}

/**
 * Um card por pessoa. Fechado responde "quem, quanto, quanto falta";
 * aberto separa as três coisas que antes vinham misturadas num histórico
 * só: os empréstimos, as parcelas ainda por pagar e os pagamentos feitos.
 */
function CardCredor({ credor: c }: { credor: Credor }) {
  const atualizar = useAtualizarDivida()
  const [aberto, setAberto] = useState(false)
  const [pagando, setPagando] = useState(false)
  /** Lista de empréstimos candidatos do modal de parcelas (null = fechado). */
  const [programando, setProgramando] = useState<DividaComSaldo[] | null>(null)

  const tudoPago = !c.tudoQuitado && c.falta === 0
  const varios = c.dividas.length > 1

  const movimentos = useMemo(
    () =>
      c.dividas.flatMap((d) =>
        d.movimentos.map((m) => ({ ...m, deDivida: varios ? rotulo(d) : null })),
      ),
    [c.dividas, varios],
  )
  const parcelas = useMemo(
    () =>
      movimentos
        .filter((m) => m.status_saida === 'prevista')
        .sort((a, b) => (a.data_prevista ?? a.data_caixa).localeCompare(b.data_prevista ?? b.data_caixa)),
    [movimentos],
  )
  const pagamentos = useMemo(
    () =>
      movimentos
        .filter((m) => m.status_saida === 'paga')
        .sort((a, b) => b.data_caixa.localeCompare(a.data_caixa)),
    [movimentos],
  )

  return (
    <li
      className={cn(
        'overflow-hidden rounded-lg border border-l-4 bg-white shadow-sm',
        c.tudoQuitado
          ? 'border-neutral-100 border-l-neutral-300'
          : tudoPago
            ? 'border-neutral-200/80 border-l-success-500'
            : 'border-neutral-200/80 border-l-warning-500',
      )}
    >
      {/* 1º nível de leitura: nome + o número que importa, lado a lado. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 pt-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold uppercase tracking-wide text-neutral-900">
              {c.nome}
            </h3>
            {c.tudoQuitado ? (
              <Badge variant="success">quitado</Badge>
            ) : (
              tudoPago && <Badge variant="success">tudo pago</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            emprestou ao estúdio · {plural(c.dividas.length, 'empréstimo', 'empréstimos')}
            {c.desde && ` · desde ${fmtData(c.desde)}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            {c.tudoQuitado ? 'Devolvido' : 'Falta devolver'}
          </span>
          <span
            className={cn(
              'font-display text-xl font-bold tabular-nums sm:text-2xl',
              c.tudoQuitado ? 'text-neutral-400' : c.falta > 0 ? 'text-warning-700' : 'text-success-700',
            )}
          >
            {fmtCentavos(c.tudoQuitado ? c.devolvido : c.falta)}
          </span>
        </div>
      </div>

      {/* 2º nível: os três valores separados e nomeados, nunca deduzidos. */}
      <div className="mt-3 border-t border-neutral-100 bg-neutral-50/70 px-4 py-3">
        <dl className="grid grid-cols-3 gap-3">
          <Numero rotulo="Emprestado" valor={c.emprestado} />
          <Numero rotulo="Já devolvido" valor={c.devolvido} cor="text-success-700" />
          <Numero
            rotulo="Falta devolver"
            valor={c.falta}
            cor={c.falta > 0 ? 'text-warning-700' : 'text-neutral-400'}
          />
        </dl>
        <BarraProgresso devolvido={c.devolvido} total={c.emprestado} />
        {c.baixado > 0 && (
          <p className="mt-1.5 text-[11px] text-neutral-400">
            {fmtCentavos(c.baixado)} foram marcados como quitados sem pagamento registrado.
          </p>
        )}
      </div>

      {tudoPago && (
        <div className="flex flex-wrap items-center gap-3 border-t border-success-100 bg-success-50 px-4 py-2.5">
          <CheckCircle2 className="size-4 shrink-0 text-success-600" />
          <p className="flex-1 text-xs text-success-700">
            Todo o valor já foi devolvido. Marque como quitado para tirar da lista de pendências.
          </p>
          <Button
            size="sm"
            loading={atualizar.isPending}
            onClick={() => c.abertas.forEach((d) => atualizar.mutate({ id: d.id, patch: { quitada: true } }))}
          >
            Marcar quitado
          </Button>
        </div>
      )}

      {/* 3º nível: ações. Uma primária só — as outras cedem peso visual. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 px-4 py-2.5">
        {!c.tudoQuitado && (
          <>
            <Button
              size="sm"
              onClick={() => setPagando(true)}
              title="Lança uma saída de caixa hoje e abate o saldo desta pessoa"
            >
              <Plus className="size-3.5" />
              Registrar pagamento
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setProgramando(c.abertas)}
              title="Agenda as próximas parcelas como contas a pagar em Saídas"
            >
              <CalendarPlus className="size-3.5" />
              Programar parcelas
            </Button>
          </>
        )}
        <button
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', aberto ? '' : '-rotate-90')} />
          {aberto ? 'Ocultar detalhes' : 'Ver detalhes'}
        </button>
      </div>

      {aberto && (
        <div className="border-t border-neutral-100 bg-neutral-50/40 px-4 py-4">
          <Secao
            titulo="Empréstimos recebidos"
            ajuda="o dinheiro que entrou no caixa e precisa voltar"
            total={c.emprestado}
            quantidade={c.dividas.length}
          >
            <ul className="flex flex-col gap-1.5">
              {c.dividas.map((d) => (
                <LinhaEmprestimo
                  key={d.id}
                  divida={d}
                  atualizando={atualizar.isPending}
                  onQuitar={(quitada) => atualizar.mutate({ id: d.id, patch: { quitada } })}
                  onProgramar={() => setProgramando([d])}
                />
              ))}
            </ul>
          </Secao>

          <Secao
            titulo="Parcelas programadas"
            ajuda="já agendadas em Saídas como conta a pagar, ainda não saíram do caixa"
            total={c.programado}
            quantidade={parcelas.length}
            vazio="Nenhuma parcela programada. Use “Programar parcelas” para montar o cronograma."
          >
            <ul className="flex flex-col gap-1.5">
              {parcelas.map((m) => (
                <LinhaMovimento key={m.id} movimento={m} />
              ))}
            </ul>
          </Secao>

          <Secao
            titulo="Pagamentos realizados"
            ajuda="dinheiro que já saiu do caixa e abateu o saldo"
            total={c.devolvido}
            quantidade={pagamentos.length}
            vazio="Nenhum pagamento registrado até agora."
          >
            <ul className="flex flex-col gap-1.5">
              {pagamentos.map((m) => (
                <LinhaMovimento key={m.id} movimento={m} />
              ))}
            </ul>
          </Secao>
        </div>
      )}

      {pagando && (
        <PagamentoModal credor={c.nome} opcoes={c.abertas} onFechar={() => setPagando(false)} />
      )}
      {programando && (
        <ParcelasModal credor={c.nome} opcoes={programando} onFechar={() => setProgramando(null)} />
      )}
    </li>
  )
}

function Numero({ rotulo, valor, cor = 'text-neutral-900' }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{rotulo}</dt>
      <dd className={cn('mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-base', cor)}>
        {fmtCentavos(valor)}
      </dd>
    </div>
  )
}

/**
 * Zerada, uma barra cinza lisa é indistinguível de um trilho em branco —
 * o olho lê "não tem nada aqui", não "nada foi pago". Por isso o estado 0%
 * troca de aparência (trilho tracejado âmbar) e é dito por escrito.
 */
function BarraProgresso({ devolvido, total }: { devolvido: number; total: number }) {
  const pct = total > 0 ? Math.min((devolvido / total) * 100, 100) : 0
  const nada = devolvido === 0

  return (
    <div className="mt-3">
      <div
        className={cn(
          'h-2 w-full overflow-hidden rounded-full',
          nada ? 'border border-dashed border-warning-500/50 bg-warning-50' : 'bg-neutral-100',
        )}
      >
        {!nada && (
          <div
            className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-success-500' : 'bg-brand-500')}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-500">
        {nada ? (
          <span className="font-medium text-warning-700">Nenhum pagamento registrado ainda — 0% devolvido</span>
        ) : (
          <>
            {fmtCentavos(devolvido)} de {fmtCentavos(total)} devolvidos ·{' '}
            <strong className="font-semibold text-neutral-700">{Math.round(pct)}%</strong>
          </>
        )}
      </p>
    </div>
  )
}

/**
 * Bloco do detalhe. `ajuda` não é enfeite: é o que dá nome ao que a linha
 * significa (uma parcela programada não é dinheiro que saiu) — a confusão
 * que existia quando parcelas e pagamentos vinham na mesma lista.
 */
function Secao({
  titulo,
  ajuda,
  total,
  quantidade,
  vazio,
  children,
}: {
  titulo: string
  ajuda: string
  total: number
  quantidade: number
  vazio?: string
  children: ReactNode
}) {
  return (
    <section className="mt-5 first:mt-0">
      <SectionTitle direita={fmtCentavos(total)}>{titulo}</SectionTitle>
      <p className="-mt-1 mb-2 text-[11px] text-neutral-400">{ajuda}</p>
      {quantidade > 0 ? children : <p className="py-1 text-xs text-neutral-400">{vazio}</p>}
    </section>
  )
}

function LinhaEmprestimo({
  divida: d,
  atualizando,
  onQuitar,
  onProgramar,
}: {
  divida: DividaComSaldo
  atualizando: boolean
  onQuitar: (quitada: boolean) => void
  onProgramar: () => void
}) {
  const falta = Math.max(d.valor_centavos - d.pago_centavos, 0)

  return (
    <li
      className={cn(
        'rounded-md border border-l-4 bg-white px-3 py-2',
        d.quitada
          ? 'border-neutral-100 border-l-neutral-300'
          : falta === 0
            ? 'border-neutral-200/80 border-l-success-500'
            : 'border-neutral-200/80 border-l-warning-500',
      )}
    >
      <div className="flex items-center gap-2.5 text-xs">
        <span className="w-[4.5rem] shrink-0 tabular-nums text-neutral-400">{fmtData(d.criada_em)}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{rotulo(d)}</span>
        {d.quitada && <Badge variant="neutral">quitado</Badge>}
        <span className="shrink-0 font-semibold tabular-nums text-neutral-900">
          {fmtCentavos(d.valor_centavos)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[5.75rem] text-[11px] text-neutral-500">
        <span>
          devolvido {fmtCentavos(d.pago_centavos)}
          {!d.quitada && (
            <>
              {' · '}
              <strong className={cn('font-semibold', falta > 0 ? 'text-warning-700' : 'text-success-700')}>
                {falta > 0 ? `falta ${fmtCentavos(falta)}` : 'tudo pago'}
              </strong>
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {!d.quitada && (
            <Button size="sm" variant="ghost" onClick={onProgramar} title="Programar parcelas só deste empréstimo">
              <CalendarPlus className="size-3" />
              Parcelas
            </Button>
          )}
          <Button size="sm" variant="ghost" loading={atualizando} onClick={() => onQuitar(!d.quitada)}>
            {d.quitada ? (
              <>
                <RotateCcw className="size-3" />
                Reabrir
              </>
            ) : (
              'Marcar quitado'
            )}
          </Button>
        </div>
      </div>
    </li>
  )
}

function LinhaMovimento({ movimento: m }: { movimento: MovimentoDivida & { deDivida: string | null } }) {
  const paga = m.status_saida === 'paga'
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-md border border-l-4 bg-white px-3 py-1.5 text-xs',
        paga ? 'border-neutral-200/80 border-l-success-500' : 'border-neutral-200/80 border-l-brand-400',
      )}
    >
      <span className="w-[4.5rem] shrink-0 tabular-nums text-neutral-500">
        {fmtData(paga ? m.data_caixa : (m.data_prevista ?? m.data_caixa))}
      </span>
      <span className="min-w-0 flex-1 truncate text-neutral-500">
        {m.deDivida ? `${m.deDivida} · ` : ''}
        {paga ? 'pagamento' : 'parcela a pagar'}
      </span>
      <span
        className={cn('shrink-0 font-semibold tabular-nums', paga ? 'text-success-700' : 'text-neutral-700')}
      >
        {fmtCentavos(m.valor_centavos)}
      </span>
    </li>
  )
}

/**
 * Abatimento avulso: dinheiro que já saiu. Quando a pessoa tem mais de um
 * empréstimo em aberto, o seletor é obrigatório — o pagamento precisa saber
 * qual saldo abate, senão o rateio viraria adivinhação.
 */
function PagamentoModal({
  credor,
  opcoes,
  onFechar,
}: {
  credor: string
  opcoes: DividaComSaldo[]
  onFechar: () => void
}) {
  const registrar = useRegistrarPagamentoDivida()
  const [dividaId, setDividaId] = useState(opcoes[0]?.id ?? '')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeISO())

  const alvo = opcoes.find((d) => d.id === dividaId) ?? opcoes[0]
  const falta = alvo ? Math.max(alvo.valor_centavos - alvo.pago_centavos, 0) : 0
  const centavos = parseCentavos(valor)

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    if (!centavos || !alvo) return
    registrar.mutate(
      {
        dividaId: alvo.id,
        descricao: `Abatimento — ${credor}`,
        valorCentavos: centavos,
        data,
      },
      { onSuccess: onFechar },
    )
  }

  return (
    <Modal title={`Registrar pagamento — ${credor}`} onFechar={onFechar} size="sm">
      <form onSubmit={salvar}>
        <div className="flex flex-col gap-3">
          {opcoes.length > 1 && (
            <Select
              label="Abater de qual empréstimo?"
              value={dividaId}
              onChange={(ev) => setDividaId(ev.target.value)}
            >
              {opcoes.map((d) => (
                <option key={d.id} value={d.id}>
                  {rotulo(d)} — falta {fmtCentavos(Math.max(d.valor_centavos - d.pago_centavos, 0))}
                </option>
              ))}
            </Select>
          )}

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label className={cn(labelCls, 'mb-0')}>Valor pago *</label>
              {falta > 0 && (
                <button
                  type="button"
                  onClick={() => setValor((falta / 100).toFixed(2).replace('.', ','))}
                  className="text-[11px] text-brand-600 underline-offset-2 hover:underline"
                >
                  quitar tudo ({fmtCentavos(falta)})
                </button>
              )}
            </div>
            <Input value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="R$ 0,00" required autoFocus />
            {centavos != null && centavos > falta && (
              <p className="mt-1 text-[11px] text-warning-700">
                Acima do que falta neste empréstimo ({fmtCentavos(falta)}).
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>Data do pagamento</label>
            <Input type="date" value={data} onChange={(ev) => setData(ev.target.value)} />
          </div>

          <p className="text-[11px] text-neutral-400">
            Entra em Saídas → Dívidas como pago e abate o saldo desta pessoa.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800"
          >
            Cancelar
          </button>
          <Button type="submit" loading={registrar.isPending}>
            Registrar pagamento
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Data local em ISO (YYYY-MM-DD). toISOString() usaria UTC e podia voltar um dia. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * O cronograma de parcelas de uma dívida — criado e EDITADO aqui, em bloco.
 *
 * Abre já carregado com o que existe: cada parcela prevista vira uma linha
 * com a data e o valor dela. Salvar substitui o cronograma previsto inteiro
 * (uma transação só, no banco), então mudar 12 datas é mudar 12 campos e
 * salvar — e não apagar 12 lançamentos na mão.
 *
 * Parcela já paga não aparece aqui e não é tocada: cronograma é previsão, e
 * dinheiro que saiu não é mais previsão.
 */
function ParcelasModal({
  credor,
  opcoes,
  onFechar,
}: {
  credor: string
  opcoes: DividaComSaldo[]
  onFechar: () => void
}) {
  const salvarCronograma = useSalvarCronogramaDivida()
  const [dividaId, setDividaId] = useState(opcoes[0]?.id ?? '')
  const [erro, setErro] = useState<string | null>(null)

  const alvo = opcoes.find((d) => d.id === dividaId) ?? opcoes[0]
  const falta = alvo ? Math.max(alvo.valor_centavos - alvo.pago_centavos, 0) : 0

  /** As parcelas previstas da dívida escolhida, como linhas editáveis. */
  const doBanco = useMemo(() => {
    const previstas = (alvo?.movimentos ?? [])
      .filter((m) => m.status_saida === 'prevista')
      .map((m) => ({
        data: (m.data_prevista ?? m.data_caixa).slice(0, 10),
        valor: (m.valor_centavos / 100).toFixed(2).replace('.', ','),
      }))
      .sort((a, b) => a.data.localeCompare(b.data))
    return previstas.length > 0
      ? previstas
      : [{ data: new Date().toISOString().slice(0, 10), valor: '' }]
  }, [alvo])

  const [linhas, setLinhas] = useState(doBanco)
  // Trocar de empréstimo no seletor troca o cronograma que está na tela.
  const [carregadoDe, setCarregadoDe] = useState(alvo?.id)
  if (alvo?.id !== carregadoDe) {
    setCarregadoDe(alvo?.id)
    setLinhas(doBanco)
    setErro(null)
  }

  const previstasNoBanco = (alvo?.movimentos ?? []).filter((m) => m.status_saida === 'prevista')
  const soma = linhas.reduce((s, l) => s + (parseCentavos(l.valor) ?? 0), 0)

  // Gerador: o caminho normal é "N parcelas iguais, todo mês no mesmo dia".
  const [qtd, setQtd] = useState('12')
  const [primeira, setPrimeira] = useState(() => new Date().toISOString().slice(0, 10))
  const [valorCada, setValorCada] = useState('')

  /**
   * Mês sem o dia escolhido (29–31) cai no último dia do mês, em vez de
   * vazar para o mês seguinte — que é como todo boleto se comporta, e o que
   * mantém uma parcela por mês.
   */
  function gerar() {
    const n = Math.min(Math.max(Number(qtd) || 0, 1), 120)
    const [ano, mes, dia] = primeira.split('-').map(Number)
    setLinhas(
      Array.from({ length: n }, (_, i) => {
        const base = new Date(ano, mes - 1 + i, 1)
        const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
        const d = new Date(base.getFullYear(), base.getMonth(), Math.min(dia, ultimoDia))
        return { data: iso(d), valor: valorCada }
      }),
    )
    setErro(null)
  }

  function alterar(i: number, campo: 'data' | 'valor', v: string) {
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, [campo]: v } : l)))
  }

  function adicionar() {
    const ultima = linhas[linhas.length - 1]
    const [ano, mes, dia] = (ultima?.data ?? new Date().toISOString().slice(0, 10))
      .split('-')
      .map(Number)
    const base = new Date(ano, mes, 1)
    const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
    setLinhas((ls) => [
      ...ls,
      { data: iso(new Date(base.getFullYear(), base.getMonth(), Math.min(dia, ultimoDia))), valor: '' },
    ])
  }

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    setErro(null)
    if (!alvo) return

    const comData = linhas.filter((l) => l.data)
    // Linha sem valor já foi descartada em silêncio aqui, e o modal fechava
    // como se tivesse gravado. Cada caso agora tem mensagem.
    if (comData.some((l) => (parseCentavos(l.valor) ?? 0) <= 0)) {
      setErro('Preencha o valor de todas as parcelas.')
      return
    }
    const meses = comData.map((l) => l.data.slice(0, 7))
    const repetido = meses.find((m, i) => meses.indexOf(m) !== i)
    if (repetido) {
      setErro(`Há duas parcelas em ${repetido}. O cronograma aceita uma por mês.`)
      return
    }

    salvarCronograma.mutate(
      {
        dividaId: alvo.id,
        descricao: `Parcela — ${credor}`,
        parcelas: comData.map((l) => ({ data: l.data, valorCentavos: parseCentavos(l.valor) ?? 0 })),
      },
      {
        onSuccess: onFechar,
        onError: (e) =>
          setErro(e instanceof Error ? e.message : 'Não foi possível salvar o cronograma.'),
      },
    )
  }

  return (
    <Modal title={`Cronograma de parcelas — ${credor}`} onFechar={onFechar}>
      <form onSubmit={salvar}>
        <div className="mb-3 flex flex-col gap-3">
          {opcoes.length > 1 && (
            <Select
              label="Qual empréstimo?"
              value={dividaId}
              onChange={(ev) => setDividaId(ev.target.value)}
            >
              {opcoes.map((d) => (
                <option key={d.id} value={d.id}>
                  {rotulo(d)} — falta {fmtCentavos(Math.max(d.valor_centavos - d.pago_centavos, 0))}
                </option>
              ))}
            </Select>
          )}
          <p className="text-xs text-neutral-500">
            Falta devolver <strong className="text-neutral-800">{fmtCentavos(falta)}</strong>. Cada
            parcela aparece em Saídas → Dívidas no mês dela, como conta a pagar — ainda não é
            dinheiro que saiu.
          </p>

          {/* Gerador: o atalho para "todo mês no dia X, mesmo valor". */}
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
            <p className="mb-2 text-xs font-medium text-neutral-700">Gerar parcelas mensais</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-20">
                <label className={labelCls}>Quantas</label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={qtd}
                  onChange={(ev) => setQtd(ev.target.value)}
                />
              </div>
              <div className="min-w-32 flex-1">
                <label className={labelCls}>1º vencimento</label>
                <Input type="date" value={primeira} onChange={(ev) => setPrimeira(ev.target.value)} />
              </div>
              <div className="w-28">
                <label className={labelCls}>Valor de cada</label>
                <Input
                  value={valorCada}
                  onChange={(ev) => setValorCada(ev.target.value)}
                  placeholder="R$ 0,00"
                />
              </div>
              <Button size="sm" type="button" variant="secondary" onClick={gerar}>
                Gerar
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-400">
              Substitui as linhas abaixo. Depois dá para ajustar uma a uma.
            </p>
          </div>
        </div>

        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
          {linhas.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                {i === 0 && <label className={labelCls}>Vencimento</label>}
                <Input
                  type="date"
                  value={l.data}
                  onChange={(ev) => alterar(i, 'data', ev.target.value)}
                />
              </div>
              <div className="w-28">
                {i === 0 && <label className={labelCls}>Valor</label>}
                <Input
                  value={l.valor}
                  onChange={(ev) => alterar(i, 'valor', ev.target.value)}
                  placeholder="R$ 0,00"
                />
              </div>
              <button
                type="button"
                onClick={() => setLinhas((ls) => ls.filter((_, idx) => idx !== i))}
                title="Remover esta parcela"
                className="mb-1.5 rounded p-1 text-neutral-300 transition hover:text-danger-600"
              >
                ✕
              </button>
            </div>
          ))}
          {linhas.length === 0 && (
            <p className="text-xs text-neutral-400">
              Nenhuma parcela. Salvar assim apaga o cronograma previsto.
            </p>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button size="sm" type="button" variant="ghost" onClick={adicionar}>
            <Plus className="size-3.5" />
            Mais uma parcela
          </Button>
          <span
            className={cn(
              'ml-auto text-xs tabular-nums',
              soma > falta ? 'text-warning-700' : 'text-neutral-500',
            )}
          >
            {plural(linhas.length, 'parcela', 'parcelas')} · total {fmtCentavos(soma)}
            {soma > falta && ' — acima do saldo'}
          </span>
        </div>

        {previstasNoBanco.length > 0 && (
          <p className="mt-3 text-[11px] leading-snug text-neutral-400">
            Salvar substitui o cronograma atual (
            {plural(previstasNoBanco.length, 'parcela prevista', 'parcelas previstas')}). Parcela já
            paga não entra nesta lista e não é alterada.
          </p>
        )}

        {erro && (
          <p className="mt-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800"
          >
            Cancelar
          </button>
          <Button type="submit" loading={salvarCronograma.isPending}>
            Salvar cronograma
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * O agrupamento é por nome, então digitar "Marcela" e "marcela " criaria
 * dois cards para a mesma pessoa. O datalist com os nomes já usados é o que
 * evita isso sem precisar de uma tabela de credores.
 */
function NovoEmprestimoModal({
  nomesConhecidos,
  onFechar,
}: {
  nomesConhecidos: string[]
  onFechar: () => void
}) {
  const criar = useCriarDivida()
  const [credor, setCredor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    const centavos = parseCentavos(valor)
    if (!centavos || !credor.trim()) return
    criar.mutate(
      { credor: credor.trim(), descricao: descricao.trim() || null, valor_centavos: centavos },
      { onSuccess: onFechar },
    )
  }

  return (
    <Modal title="Registrar empréstimo" onFechar={onFechar}>
      <form onSubmit={salvar}>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Quem emprestou *</label>
            <Input
              list="credores-conhecidos"
              value={credor}
              onChange={(ev) => setCredor(ev.target.value)}
              placeholder="Ex.: Marcela"
              autoFocus
              required
            />
            <datalist id="credores-conhecidos">
              {nomesConhecidos.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {nomesConhecidos.length > 0 && (
              <p className="mt-1 text-[11px] text-neutral-400">
                Repita o mesmo nome de um empréstimo anterior para os dois ficarem no mesmo card.
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Valor emprestado *</label>
            <Input value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="R$ 0,00" required />
          </div>
          <div>
            <label className={labelCls}>Do que se trata</label>
            <Input
              value={descricao}
              onChange={(ev) => setDescricao(ev.target.value)}
              placeholder="Ex.: Empréstimo para a reforma da sala 2"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-800"
          >
            Cancelar
          </button>
          <Button type="submit" loading={criar.isPending}>
            <HandCoins className="size-4" />
            Registrar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
