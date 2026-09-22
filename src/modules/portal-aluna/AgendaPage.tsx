import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import {
  minhasProximasAulas,
  mensagemDoBanco,
  montarAulas,
  planoQuePaga,
  type Aula,
  type ContextoAluno,
  type MotivoForaDoPlano,
} from './aulas'
import { Aviso, Cabecalho, Carregando, ErroCarregar, useTelaGrande } from './components/Basicos'
import { CancelarAula } from './components/CancelarAula'
import { CartaoAula, CartaoAulaCompacto, situacaoDaAula } from './components/CartaoAula'
import { Folha } from './components/Folha'
import {
  diasEntre,
  fmtDiaMes,
  fmtHora,
  hojeIso,
  inicioDaSemana,
  nomeDiaCurto,
  nomeDiaLongo,
  diaDaSemana,
  paraData,
  rotuloDia,
  somarDias,
} from './datas'
import {
  useAgendarAula,
  useCancelarAgendamento,
  useConfigAgendamento,
  useContextoAluno,
  useEntrarListaEspera,
  useGradePublica,
  useSairListaEspera,
  useVagas,
} from './hooks/usePortalAluna'
import { separarPlanos } from './plano'
import { usePortalClienteId } from './PortalClienteContext'

/** Janela mínima exibida — a do plano mensal (regulamento 2.4). */
const JANELA_MINIMA = 14

type Filtros = {
  mod: string | null
  prof: string | null
  sala: string | null
  /** Só aulas em que dá para entrar (ou que já são minhas). */
  vagas: boolean
  /** Esconde o que o plano não cobre. */
  plano: boolean
}

/** Parâmetros de URL que "Limpar filtros" apaga. */
const LIMPAR_FILTROS = { mod: null, prof: null, sala: null, vagas: null, plano: null }

function lerFiltros(p: URLSearchParams): Filtros {
  return {
    mod: p.get('mod'),
    prof: p.get('prof'),
    sala: p.get('sala'),
    vagas: p.get('vagas') === '1',
    plano: p.get('plano') === '1',
  }
}

function aplicarFiltros(aulas: Aula[], f: Filtros): Aula[] {
  return aulas.filter((a) => {
    if (f.mod && a.modalidade !== f.mod) return false
    if (f.prof && a.professora !== f.prof) return false
    if (f.sala && a.sala !== f.sala) return false
    if (f.vagas && !['disponivel', 'vaga_segurada', 'agendada', 'turma_fixa'].includes(a.estado.tipo)) {
      return false
    }
    if (f.plano && a.estado.tipo === 'fora_do_plano') return false
    return true
  })
}

function contarFiltros(f: Filtros) {
  return [f.mod, f.prof, f.sala].filter(Boolean).length + Number(f.vagas) + Number(f.plano)
}

function periodoDoHorario(h: string) {
  const hora = Number(h.slice(0, 2))
  return hora < 12 ? 'Manhã' : hora < 18 ? 'Tarde' : 'Noite'
}

/**
 * Agenda do Portal do Aluno.
 *
 * Responde, nesta ordem: que aulas tem no dia, a que horas, de quê, com
 * quem, se tem vaga, se já é minha e se eu posso agendar. Dia, filtros e
 * semana moram na URL — recarregar não perde a escolha, e a equipe pode
 * mandar um link que já abre filtrado ("?mod=Jazz Funk").
 *
 * Celular: um dia por vez, em faixa de dias rolável, filtros numa folha.
 * Desktop: a semana inteira em sete colunas, filtros em linha — é o que
 * uma tela larga permite e o celular não.
 */
export function AgendaPage() {
  const clienteId = usePortalClienteId()
  const grande = useTelaGrande()
  const [params, setParams] = useSearchParams()
  const hoje = hojeIso()

  const grade = useGradePublica()
  const config = useConfigAgendamento()
  const { ctx, suspensao, isLoading: carregandoCtx, error: erroCtx, refetch } = useContextoAluno()

  // A janela que o aluno enxerga é a maior que o plano dele permite
  // (21 dias no semestral) — nunca menos que a do mensal.
  const janela = Math.max(
    JANELA_MINIMA,
    ...ctx.planos.map((p) => p.dias_antecedencia_agendamento ?? JANELA_MINIMA),
  )
  const fimJanela = somarDias(hoje, janela)
  const ultimaSemana = inicioDaSemana(fimJanela)
  const vagas = useVagas(hoje, somarDias(ultimaSemana, 6))

  const filtros = lerFiltros(params)
  const diaParam = params.get('dia')
  const dia = diaParam && diaParam >= hoje && diaParam <= fimJanela ? diaParam : hoje
  const semanaParam = params.get('semana')
  const semana =
    semanaParam && semanaParam >= inicioDaSemana(hoje) && semanaParam <= ultimaSemana
      ? inicioDaSemana(semanaParam)
      : inicioDaSemana(dia)

  // `replace`: trocar de dia ou de filtro não é navegação — o "voltar" do
  // celular deve sair da Agenda, não desfazer toques um a um.
  function mudarParam(mudancas: Record<string, string | null>) {
    const novo = new URLSearchParams(params)
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null || v === '') novo.delete(k)
      else novo.set(k, v)
    }
    setParams(novo, { replace: true })
  }

  const diasVisiveis = useMemo(() => {
    if (!grande) return [dia]
    return Array.from({ length: 7 }, (_, i) => somarDias(semana, i)).filter((d) => d >= hoje)
  }, [grande, dia, semana, hoje])

  const aulas = useMemo(
    () => montarAulas(diasVisiveis, grade.data ?? [], vagas.data ?? [], ctx),
    [diasVisiveis, grade.data, vagas.data, ctx],
  )
  const visiveis = aplicarFiltros(aulas, filtros)

  // Dias em que o aluno já tem aula (bolinha na faixa de dias).
  const diasComAula = useMemo(
    () => new Set(minhasProximasAulas(grade.data ?? [], ctx, janela + 1).map((a) => a.data)),
    [grade.data, ctx, janela],
  )

  const opcoes = useMemo(() => {
    const g = grade.data ?? []
    const unicos = (xs: (string | null)[]) =>
      [...new Set(xs.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return {
      modalidades: unicos(g.map((t) => t.modalidade)),
      professoras: unicos(g.map((t) => t.professora_nome)),
      salas: unicos(g.map((t) => t.sala_nome)),
    }
  }, [grade.data])

  const planos = separarPlanos(ctx.planos, hoje)

  // ---- ações ----
  const agendar = useAgendarAula()
  const cancelar = useCancelarAgendamento()
  const entrarFila = useEntrarListaEspera()
  const sairFila = useSairListaEspera()

  const [emAcao, setEmAcao] = useState<string | null>(null)
  const [retorno, setRetorno] = useState<{ tom: 'sucesso' | 'perigo'; texto: string } | null>(null)
  const [detalhe, setDetalhe] = useState<Aula | null>(null)
  const [cancelando, setCancelando] = useState<{ aula: Aula; agendamentoId: string } | null>(null)
  const [erroCancelar, setErroCancelar] = useState<string | null>(null)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  useEffect(() => {
    if (!retorno) return
    const t = setTimeout(() => setRetorno(null), 6000)
    return () => clearTimeout(t)
  }, [retorno])

  function executar(aula: Aula, acao: () => Promise<unknown>, sucesso: string, falha: string) {
    setRetorno(null)
    setEmAcao(aula.chave)
    acao()
      .then(() => {
        setRetorno({ tom: 'sucesso', texto: sucesso })
        setDetalhe(null)
      })
      .catch((e) => setRetorno({ tom: 'perigo', texto: mensagemDoBanco(e, falha) }))
      .finally(() => setEmAcao(null))
  }

  const descricao = (a: Aula) =>
    `${a.modalidade}, ${rotuloDia(a.data).toLowerCase()} às ${fmtHora(a.horario)}`

  function agendarAula(a: Aula) {
    executar(
      a,
      () => agendar.mutateAsync({ clienteId, turmaId: a.turmaId, data: a.data }),
      `Aula agendada: ${descricao(a)}.`,
      'Não foi possível agendar.',
    )
  }

  function entrarNaFila(a: Aula) {
    executar(
      a,
      () => entrarFila.mutateAsync({ turmaId: a.turmaId, data: a.data }),
      'Você entrou na lista de espera. Se vagar, avisamos por e-mail.',
      'Não foi possível entrar na lista de espera.',
    )
  }

  function sairDaFila(a: Aula, filaId: string) {
    executar(a, () => sairFila.mutateAsync(filaId), 'Você saiu da lista de espera.', 'Não foi possível sair da fila.')
  }

  function abrirCancelamento(a: Aula, agendamentoId: string) {
    setErroCancelar(null)
    setDetalhe(null)
    setCancelando({ aula: a, agendamentoId })
  }

  function confirmarCancelamento() {
    if (!cancelando) return
    setErroCancelar(null)
    cancelar.mutate(cancelando.agendamentoId, {
      onSuccess: (devolveu) => {
        setRetorno({
          tom: 'sucesso',
          texto: devolveu ? 'Aula cancelada — o crédito voltou para o seu saldo.' : 'Aula cancelada.',
        })
        setCancelando(null)
      },
      onError: (e) => setErroCancelar(mensagemDoBanco(e, 'Não foi possível cancelar.')),
    })
  }

  /** O prazo de cancelamento do plano que pagou a aula (o mesmo do banco). */
  function horasDoAgendamento(agendamentoId: string) {
    const r = ctx.reservas.find((x) => x.id === agendamentoId)
    const plano = ctx.planos.find((p) => p.matricula_id === r?.matricula_id)
    return {
      horas: plano?.horas_cancelamento ?? config.data?.horas_cancelamento ?? 4,
      usaCredito: Boolean(r?.matricula_id),
    }
  }

  function acaoDaAula(a: Aula, tamanho: 'sm' | 'md' = 'sm'): ReactNode {
    const pendente = emAcao === a.chave
    const e = a.estado
    switch (e.tipo) {
      case 'disponivel':
        return (
          <Button size={tamanho} loading={pendente} onClick={() => agendarAula(a)}>
            Agendar
          </Button>
        )
      case 'vaga_segurada':
        return (
          <Button size={tamanho} loading={pendente} onClick={() => agendarAula(a)}>
            Garantir vaga
          </Button>
        )
      case 'lotada':
        return e.podeEntrarNaFila ? (
          <Button size={tamanho} variant="outline" loading={pendente} onClick={() => entrarNaFila(a)}>
            Lista de espera
          </Button>
        ) : null
      case 'na_fila':
        return (
          <Button size={tamanho} variant="ghost" loading={pendente} onClick={() => sairDaFila(a, e.filaId)}>
            Sair da fila
          </Button>
        )
      case 'agendada':
        // Aula do Wellhub só se desmarca pelo app (regulamento 9.1).
        return e.canal === 'mensalista' ? (
          <Button size={tamanho} variant="secondary" onClick={() => abrirCancelamento(a, e.agendamentoId)}>
            Cancelar
          </Button>
        ) : null
      default:
        return null
    }
  }

  const carregando = grade.isLoading || carregandoCtx
  const erro = grade.error ?? erroCtx

  return (
    <div>
      <Cabecalho
        titulo="Agenda"
        subtitulo={
          planos.temCreditos && config.data
            ? `Cancele até ${config.data.horas_cancelamento}h antes da aula e o crédito volta.`
            : 'Encontre sua próxima aula.'
        }
        acao={
          grande ? (
            <NavegacaoSemana
              semana={semana}
              hoje={hoje}
              podeVoltar={semana > inicioDaSemana(hoje)}
              podeAvancar={semana < ultimaSemana}
              onMudar={(s) => mudarParam(s === null ? { semana: null, dia: null } : { semana: s })}
            />
          ) : undefined
        }
      />

      <AvisoDaAgenda ctx={ctx} suspensaoAte={suspensao?.fim ?? null} faltas={suspensao?.faltas ?? null} />

      {retorno && (
        <Aviso tom={retorno.tom} titulo={retorno.texto} className="mb-4" />
      )}

      {!grande && (
        <FaixaDias
          hoje={hoje}
          fim={fimJanela}
          selecionado={dia}
          comAula={diasComAula}
          onEscolher={(d) => mudarParam({ dia: d === hoje ? null : d })}
        />
      )}

      <BarraFiltros
        grande={grande}
        filtros={filtros}
        opcoes={opcoes}
        mostrarPlano={ctx.planos.length > 0}
        onMudar={(m) => mudarParam(m)}
        onAbrir={() => setFiltrosAbertos(true)}
      />

      {erro ? (
        <ErroCarregar onTentar={() => { grade.refetch(); refetch() }} />
      ) : carregando ? (
        <Carregando linhas={4} />
      ) : grande ? (
        <SemanaDesktop
          semana={semana}
          hoje={hoje}
          aulas={visiveis}
          temFiltro={contarFiltros(filtros) > 0}
          onAbrir={setDetalhe}
        />
      ) : (
        <ListaDoDia
          aulas={visiveis}
          totalSemFiltro={aulas.length}
          onLimparFiltros={() => mudarParam(LIMPAR_FILTROS)}
          acao={(a) => acaoDaAula(a)}
          onAbrir={setDetalhe}
        />
      )}

      {filtrosAbertos && (
        <Folha
          titulo="Filtrar aulas"
          onFechar={() => setFiltrosAbertos(false)}
          rodape={
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => mudarParam(LIMPAR_FILTROS)}
              >
                Limpar
              </Button>
              <Button className="flex-1" onClick={() => setFiltrosAbertos(false)}>
                Ver {visiveis.length} {visiveis.length === 1 ? 'aula' : 'aulas'}
              </Button>
            </div>
          }
        >
          <PainelFiltros
            filtros={filtros}
            opcoes={opcoes}
            mostrarPlano={ctx.planos.length > 0}
            onMudar={(m) => mudarParam(m)}
          />
        </Folha>
      )}

      {detalhe && (
        <DetalheAula
          aula={aulas.find((a) => a.chave === detalhe.chave) ?? detalhe}
          ctx={ctx}
          minutosReserva={config.data?.minutos_reserva_espera ?? 30}
          acao={acaoDaAula(aulas.find((a) => a.chave === detalhe.chave) ?? detalhe, 'md')}
          onFechar={() => setDetalhe(null)}
        />
      )}

      {cancelando && (
        <CancelarAula
          aula={cancelando.aula}
          horasCancelamento={horasDoAgendamento(cancelando.agendamentoId).horas}
          usaCredito={horasDoAgendamento(cancelando.agendamentoId).usaCredito}
          pendente={cancelar.isPending}
          erro={erroCancelar}
          onConfirmar={confirmarCancelamento}
          onFechar={() => setCancelando(null)}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Aviso do topo — um só, o mais importante
// ------------------------------------------------------------

/**
 * O aluno não pode descobrir a regra levando um erro no botão. Se há algo
 * que impede agendar, ele aparece aqui antes — e só o mais importante,
 * para a Agenda não virar um mural.
 */
function AvisoDaAgenda({
  ctx,
  suspensaoAte,
  faltas,
}: {
  ctx: ContextoAluno
  suspensaoAte: string | null
  faltas: number | null
}) {
  const { principais, temCreditos, temTurmaFixa } = separarPlanos(ctx.planos, ctx.hoje)
  // Algum crédito vivo, em matrícula ativa — de plano ou de avulsa.
  const temCreditoVivo = ctx.lotes.some(
    (l) =>
      (l.saldo ?? 0) > 0 &&
      ctx.planos.some((p) => p.matricula_id === l.matricula_id && p.status === 'ativa'),
  )
  const limite =
    principais.find((p) => p.max_agendamentos_simultaneos !== null)?.max_agendamentos_simultaneos ?? null
  const futuras = ctx.reservas.filter((r) => r.data >= ctx.hoje).length

  let motivo: MotivoForaDoPlano | 'suspenso' | 'limite' | null = null
  if (principais.some((p) => p.status === 'inadimplente')) motivo = 'pagamento'
  else if (suspensaoAte) motivo = 'suspenso'
  else if (!temCreditoVivo) {
    motivo = temTurmaFixa && !temCreditos ? 'so_turma_fixa' : temCreditos ? 'sem_credito' : 'sem_plano'
  } else if (limite !== null && futuras >= limite) motivo = 'limite'

  const linkPlanos = (texto: string) => (
    <Link to="../planos" className="text-xs font-semibold underline underline-offset-2">
      {texto}
    </Link>
  )

  switch (motivo) {
    case 'pagamento':
      return (
        <Aviso tom="perigo" titulo="Pagamento do plano em aberto" className="mb-4"
          acao={<Link to="../meu-plano" className="text-xs font-semibold underline underline-offset-2">Ver meu plano</Link>}>
          Novos agendamentos ficam bloqueados até regularizar com a recepção.
        </Aviso>
      )
    case 'suspenso':
      return (
        <Aviso tom="atencao" titulo={`Agendamento antecipado pausado até ${fmtDiaMes(suspensaoAte!)}`} className="mb-4">
          Por {faltas ?? 2} faltas sem cancelamento. Você continua treinando: dá para agendar aulas de hoje
          ou entrar na lista de espera.
        </Aviso>
      )
    case 'sem_plano':
      return (
        <Aviso tom="info" titulo="Para agendar, você precisa de um plano ou aula avulsa" className="mb-4"
          acao={linkPlanos('Ver planos')} />
      )
    case 'so_turma_fixa':
      return (
        <Aviso tom="info" titulo="Sua turma fixa já está garantida — não precisa agendar" className="mb-4"
          acao={linkPlanos('Aula avulsa ou crédito extra')}>
          Para fazer outras aulas, compre uma aula avulsa ou crédito extra.
        </Aviso>
      )
    case 'sem_credito':
      return (
        <Aviso tom="atencao" titulo="Seus créditos deste ciclo acabaram" className="mb-4"
          acao={linkPlanos('Comprar crédito extra')} />
      )
    case 'limite':
      return (
        <Aviso tom="info" titulo={`Você está no limite de ${limite} aulas agendadas`} className="mb-4">
          Faça ou cancele uma delas para agendar outra.
        </Aviso>
      )
    default:
      return null
  }
}

// ------------------------------------------------------------
// Celular: faixa de dias + lista do dia
// ------------------------------------------------------------

function FaixaDias({
  hoje,
  fim,
  selecionado,
  comAula,
  onEscolher,
}: {
  hoje: string
  fim: string
  selecionado: string
  comAula: Set<string>
  onEscolher: (d: string) => void
}) {
  const dias = Array.from({ length: diasEntre(hoje, fim) + 1 }, (_, i) => somarDias(hoje, i))

  // Mantém o dia escolhido à vista quando se volta pela URL.
  useEffect(() => {
    document.getElementById(`dia-${selecionado}`)?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [selecionado])

  return (
    <div className="-mx-4 mb-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" role="tablist" aria-label="Dias">
      <div className="flex gap-1.5">
        {dias.map((d) => {
          const ativo = d === selecionado
          const diff = diasEntre(hoje, d)
          return (
            <button
              key={d}
              id={`dia-${d}`}
              role="tab"
              aria-selected={ativo}
              onClick={() => onEscolher(d)}
              className={cn(
                'relative flex w-14 shrink-0 flex-col items-center rounded-lg border py-2 text-xs transition',
                ativo
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                  : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300',
              )}
            >
              <span className={cn('font-medium', diff <= 1 && !ativo && 'text-brand-700')}>
                {diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : nomeDiaCurto(d)}
              </span>
              <span className="font-display text-base font-bold leading-tight">{paraData(d).getDate()}</span>
              {comAula.has(d) && (
                <span
                  aria-label="você tem aula"
                  className={cn('absolute bottom-1 size-1 rounded-full', ativo ? 'bg-white' : 'bg-brand-500')}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ListaDoDia({
  aulas,
  totalSemFiltro,
  onLimparFiltros,
  acao,
  onAbrir,
}: {
  aulas: Aula[]
  totalSemFiltro: number
  onLimparFiltros: () => void
  acao: (a: Aula) => ReactNode
  onAbrir: (a: Aula) => void
}) {
  if (aulas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 px-6 py-10 text-center">
        <p className="text-sm font-medium text-neutral-600">
          {totalSemFiltro === 0 ? 'Não há aulas neste dia.' : 'Nenhuma aula com esses filtros.'}
        </p>
        {totalSemFiltro > 0 && (
          <button onClick={onLimparFiltros} className="mt-2 text-xs font-semibold text-brand-700 underline underline-offset-2">
            Limpar filtros
          </button>
        )}
      </div>
    )
  }

  const grupos: { periodo: string; aulas: Aula[] }[] = []
  for (const a of aulas) {
    const p = periodoDoHorario(a.horario)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.periodo === p) ultimo.aulas.push(a)
    else grupos.push({ periodo: p, aulas: [a] })
  }

  return (
    <div className="flex flex-col gap-5">
      {grupos.map((g) => (
        <section key={g.periodo}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{g.periodo}</h2>
          <div className="flex flex-col gap-2">
            {g.aulas.map((a) => (
              <CartaoAula key={a.chave} aula={a} acao={acao(a)} onAbrir={() => onAbrir(a)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// Desktop: semana em colunas
// ------------------------------------------------------------

function NavegacaoSemana({
  semana,
  hoje,
  podeVoltar,
  podeAvancar,
  onMudar,
}: {
  semana: string
  hoje: string
  podeVoltar: boolean
  podeAvancar: boolean
  onMudar: (s: string | null) => void
}) {
  const fim = somarDias(semana, 6)
  const estaSemana = semana === inicioDaSemana(hoje)
  return (
    <div className="flex items-center gap-2">
      {!estaSemana && (
        <Button size="sm" variant="ghost" onClick={() => onMudar(null)}>
          Esta semana
        </Button>
      )}
      <div className="flex items-center rounded-lg border border-neutral-200 bg-white shadow-xs">
        <button
          onClick={() => onMudar(somarDias(semana, -7))}
          disabled={!podeVoltar}
          aria-label="Semana anterior"
          className="rounded-l-lg p-2 text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-36 px-2 text-center text-sm font-semibold text-neutral-800 tabular-nums">
          {fmtDiaMes(semana)} – {fmtDiaMes(fim)}
        </span>
        <button
          onClick={() => onMudar(somarDias(semana, 7))}
          disabled={!podeAvancar}
          aria-label="Próxima semana"
          className="rounded-r-lg p-2 text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

function SemanaDesktop({
  semana,
  hoje,
  aulas,
  temFiltro,
  onAbrir,
}: {
  semana: string
  hoje: string
  aulas: Aula[]
  temFiltro: boolean
  onAbrir: (a: Aula) => void
}) {
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(semana, i))
  return (
    <div className="grid grid-cols-7 gap-2">
      {dias.map((d) => {
        const passado = d < hoje
        const doDia = aulas.filter((a) => a.data === d)
        const ehHoje = d === hoje
        return (
          <div key={d} className={cn('min-w-0', passado && 'opacity-50')}>
            <div
              className={cn(
                'mb-2 flex items-baseline justify-between rounded-md px-2 py-1.5',
                ehHoje ? 'bg-brand-600 text-white' : 'text-neutral-500',
              )}
            >
              <span className="text-xs font-semibold uppercase tracking-wide">{nomeDiaCurto(d)}</span>
              <span className={cn('font-display text-base font-bold', !ehHoje && 'text-neutral-800')}>
                {paraData(d).getDate()}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {passado ? (
                <p className="px-2 text-[11px] text-neutral-400">—</p>
              ) : doDia.length === 0 ? (
                <p className="px-2 text-[11px] text-neutral-400">{temFiltro ? 'Nada com esses filtros' : 'Sem aulas'}</p>
              ) : (
                doDia.map((a) => <CartaoAulaCompacto key={a.chave} aula={a} onAbrir={() => onAbrir(a)} />)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------
// Filtros
// ------------------------------------------------------------

type Opcoes = { modalidades: string[]; professoras: string[]; salas: string[] }

function BarraFiltros({
  grande,
  filtros,
  opcoes,
  mostrarPlano,
  onMudar,
  onAbrir,
}: {
  grande: boolean
  filtros: Filtros
  opcoes: Opcoes
  mostrarPlano: boolean
  onMudar: (m: Record<string, string | null>) => void
  onAbrir: () => void
}) {
  const n = contarFiltros(filtros)
  const ativos: { chave: string; rotulo: string }[] = [
    ...(filtros.mod ? [{ chave: 'mod', rotulo: filtros.mod }] : []),
    ...(filtros.prof ? [{ chave: 'prof', rotulo: filtros.prof }] : []),
    ...(filtros.sala ? [{ chave: 'sala', rotulo: filtros.sala }] : []),
    ...(filtros.vagas ? [{ chave: 'vagas', rotulo: 'Com vaga' }] : []),
    ...(filtros.plano ? [{ chave: 'plano', rotulo: 'Do meu plano' }] : []),
  ]

  if (grande) {
    const sel = (chave: 'mod' | 'prof' | 'sala', rotulo: string, lista: string[]) =>
      lista.length > 1 && (
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          {rotulo}
          <select
            value={filtros[chave] ?? ''}
            onChange={(e) => onMudar({ [chave]: e.target.value || null })}
            className={cn(
              'max-w-44 rounded-md border bg-white px-2.5 py-1.5 text-sm text-neutral-800 outline-none transition focus:border-brand-500',
              filtros[chave] ? 'border-brand-400' : 'border-neutral-300',
            )}
          >
            <option value="">Todas</option>
            {lista.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      )
    return (
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-neutral-200/80 bg-white px-4 py-3 shadow-sm">
        {sel('mod', 'Modalidade', opcoes.modalidades)}
        {sel('prof', 'Professora', opcoes.professoras)}
        {sel('sala', 'Sala', opcoes.salas)}
        <Alternar ativo={filtros.vagas} onClick={() => onMudar({ vagas: filtros.vagas ? null : '1' })}>
          Com vaga
        </Alternar>
        {mostrarPlano && (
          <Alternar ativo={filtros.plano} onClick={() => onMudar({ plano: filtros.plano ? null : '1' })}>
            Do meu plano
          </Alternar>
        )}
        {n > 0 && (
          <button
            onClick={() => onMudar(LIMPAR_FILTROS)}
            className="ml-auto text-xs font-semibold text-brand-700 hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>
    )
  }

  // Celular: um botão e as pílulas do que está ligado — nunca o painel inteiro.
  return (
    <div className="-mx-4 mb-4 flex items-center gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      <button
        onClick={onAbrir}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
          n > 0 ? 'border-brand-600 bg-brand-600 text-white' : 'border-neutral-300 bg-white text-neutral-700',
        )}
      >
        <SlidersHorizontal className="size-3.5" />
        Filtros{n > 0 && ` · ${n}`}
      </button>
      {ativos.map((f) => (
        <button
          key={f.chave}
          onClick={() => onMudar({ [f.chave]: null })}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700"
          aria-label={`Remover filtro ${f.rotulo}`}
        >
          {f.rotulo}
          <X className="size-3" />
        </button>
      ))}
      {n === 0 && (
        <button
          onClick={() => onMudar({ vagas: '1' })}
          className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600"
        >
          Só com vaga
        </button>
      )}
    </div>
  )
}

function Alternar({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-semibold transition',
        ativo ? 'bg-brand-600 text-white shadow-sm' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
      )}
    >
      {children}
    </button>
  )
}

function PainelFiltros({
  filtros,
  opcoes,
  mostrarPlano,
  onMudar,
}: {
  filtros: Filtros
  opcoes: Opcoes
  mostrarPlano: boolean
  onMudar: (m: Record<string, string | null>) => void
}) {
  const grupo = (chave: 'mod' | 'prof' | 'sala', titulo: string, lista: string[]) =>
    lista.length > 1 && (
      <fieldset className="mb-5">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{titulo}</legend>
        <div className="flex flex-wrap gap-1.5">
          {['', ...lista].map((x) => {
            const ativo = (filtros[chave] ?? '') === x
            return (
              <button
                key={x || 'todas'}
                onClick={() => onMudar({ [chave]: x || null })}
                aria-pressed={ativo}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition',
                  ativo ? 'bg-brand-600 text-white' : 'bg-white text-neutral-600 ring-1 ring-neutral-200',
                )}
              >
                {x || 'Todas'}
              </button>
            )
          })}
        </div>
      </fieldset>
    )

  return (
    <div>
      <fieldset className="mb-5">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Disponibilidade</legend>
        <div className="flex flex-wrap gap-1.5">
          <Alternar ativo={filtros.vagas} onClick={() => onMudar({ vagas: filtros.vagas ? null : '1' })}>
            Só com vaga
          </Alternar>
          {mostrarPlano && (
            <Alternar ativo={filtros.plano} onClick={() => onMudar({ plano: filtros.plano ? null : '1' })}>
              Disponível para meu plano
            </Alternar>
          )}
        </div>
      </fieldset>
      {grupo('mod', 'Modalidade', opcoes.modalidades)}
      {grupo('prof', 'Professora', opcoes.professoras)}
      {grupo('sala', 'Sala', opcoes.salas)}
    </div>
  )
}

// ------------------------------------------------------------
// Detalhe de uma aula
// ------------------------------------------------------------

/**
 * O "segundo nível" de uma aula: o que não cabe no cartão — por que ela
 * está fora do plano, quando a agenda abre, como funciona a fila. No
 * desktop é também onde fica a ação, já que a célula da semana é estreita.
 */
function DetalheAula({
  aula,
  ctx,
  minutosReserva,
  acao,
  onFechar,
}: {
  aula: Aula
  ctx: ContextoAluno
  minutosReserva: number
  acao: ReactNode
  onFechar: () => void
}) {
  const { texto, tom } = situacaoDaAula(aula.estado, aula.vagas)
  const plano = planoQuePaga(aula.data, ctx)
  const e = aula.estado

  let explicacao: ReactNode = null
  switch (e.tipo) {
    case 'cancelada':
      explicacao = (
        <>
          Esta aula foi cancelada pelo estúdio. Se você tinha agendado, o crédito já voltou para o seu
          saldo; se é a sua turma fixa, veja a reposição em Aulas agendadas.
          {e.mensagem && <span className="mt-1 block italic">“{e.mensagem}”</span>}
        </>
      )
      break
    case 'turma_fixa':
      explicacao = 'Você já faz parte desta turma. Não é necessário agendar — sua vaga está garantida.'
      break
    case 'agendada':
      explicacao =
        e.canal === 'mensalista'
          ? 'Você está agendado nesta aula.'
          : 'Esta aula foi agendada pelo aplicativo parceiro — cancelamento e remarcação só pelo app.'
      break
    case 'disponivel':
      explicacao = plano
        ? `Agendar usa 1 crédito. Cancelando até ${plano.horas_cancelamento}h antes, ele volta para o seu saldo.`
        : null
      break
    case 'vaga_segurada':
      explicacao = `Abriu uma vaga e ela está guardada para você por ${minutosReserva} minutos desde o aviso.`
      break
    case 'na_fila':
      explicacao = `Você é o ${e.posicao}º da lista de espera. Se vagar, avisamos por e-mail e seguramos a vaga por ${minutosReserva} minutos.`
      break
    case 'lotada':
      explicacao = `Entre na lista de espera: se vagar, avisamos a primeira pessoa da fila por e-mail e seguramos a vaga por ${minutosReserva} minutos.`
      break
    case 'abre_em':
      explicacao = `Seu plano agenda com até ${plano?.dias_antecedencia_agendamento ?? JANELA_MINIMA} dias de antecedência. Esta aula abre para agendamento em ${fmtDiaMes(e.data)}.`
      break
    case 'pausado':
      explicacao = `Seu agendamento antecipado está pausado até ${fmtDiaMes(e.ate)}. Neste período dá para agendar aulas do próprio dia ou entrar na lista de espera.`
      break
    case 'limite':
      explicacao = `Você já tem ${e.max} aulas agendadas, o limite do seu plano. Faça ou cancele uma delas para agendar outra.`
      break
    case 'fora_do_plano':
      explicacao = {
        sem_plano: 'Para agendar, você precisa de um plano ou de uma aula avulsa.',
        so_turma_fixa: 'Seu plano de turma fixa dá acesso só à sua turma. Para esta aula, compre uma aula avulsa ou crédito extra.',
        sem_credito: 'Você não tem créditos válidos para esta data.',
        pagamento: 'Seu plano está com pagamento em aberto. Regularize na recepção para voltar a agendar.',
      }[e.motivo]
      break
    case 'encerrada':
      explicacao = 'Esta aula já começou.'
      break
  }

  const precisaPlano = e.tipo === 'fora_do_plano' && e.motivo !== 'pagamento'

  return (
    <Folha
      titulo={aula.modalidade}
      onFechar={onFechar}
      rodape={
        acao || precisaPlano ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {precisaPlano && (
              <Link
                to="../planos"
                className="inline-flex items-center justify-center rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Ver planos e aulas avulsas
              </Link>
            )}
            {acao}
          </div>
        ) : undefined
      }
    >
      <dl className="divide-y divide-neutral-100 text-sm">
        <Linha rotulo="Quando">
          {nomeDiaLongo(diaDaSemana(aula.data))}, {fmtDiaMes(aula.data)} · {fmtHora(aula.horario)} ({aula.duracao} min)
        </Linha>
        {aula.professora && <Linha rotulo="Professora">{aula.professora}</Linha>}
        {aula.sala && <Linha rotulo="Sala">{aula.sala}</Linha>}
        {aula.categoria && <Linha rotulo="Categoria">{aula.categoria}</Linha>}
        <Linha rotulo="Vagas">
          {e.tipo === 'cancelada'
            ? 'Aula cancelada'
            : e.tipo === 'turma_fixa' || e.tipo === 'agendada'
            ? 'Sua vaga está garantida'
            : aula.vagas > 0
              ? `${aula.vagas} de ${aula.capacidade}`
              : 'Lotada'}
        </Linha>
      </dl>

      <p
        className={cn(
          'mt-4 rounded-lg px-3 py-2.5 text-sm',
          tom === 'sucesso' && 'bg-success-50 text-success-700',
          tom === 'atencao' && 'bg-warning-50 text-warning-700',
          tom === 'perigo' && 'bg-danger-50 text-danger-700',
          tom === 'marca' && 'bg-brand-50 text-brand-800',
          tom === 'neutro' && 'bg-neutral-100 text-neutral-600',
        )}
      >
        <strong className="font-semibold">{texto}.</strong> {explicacao}
      </p>
    </Folha>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-neutral-500">{rotulo}</dt>
      <dd className="text-right font-medium text-neutral-900">{children}</dd>
    </div>
  )
}
