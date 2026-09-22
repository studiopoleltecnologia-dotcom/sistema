import { Link } from 'react-router-dom'
import { ArrowRight, CalendarCheck, CalendarDays, CreditCard, Sparkles } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../components/ui/cn'
import { minhasAulasCanceladas, minhasProximasAulas, type MinhaAula } from './aulas'
import { Aviso, Carregando, Cartao, ErroCarregar, Secao } from './components/Basicos'
import { AvisoAulaCancelada } from './components/AvisoAulaCancelada'
import { fmtPreco } from './components/planos/catalogo'
import {
  dataPorExtenso,
  fmtDataCompleta,
  fmtDiaMes,
  fmtHora,
  fmtHoraCurta,
  hojeIso,
  nomeDiaPlural,
  rotuloDia,
} from './datas'
import {
  useContextoAluno,
  useGradePublica,
  useMeuCliente,
  useMinhasTurmasFixas,
} from './hooks/usePortalAluna'
import {
  SITUACAO,
  ativoAte,
  fmtCreditos,
  formatoDoPlano,
  separarPlanos,
  situacaoDoPlano,
  tituloDoPlano,
} from './plano'
import type { MeuPlano, TurmaFixa } from './types'

/**
 * Início — um painel pequeno, na ordem em que o aluno pergunta:
 *   1. qual é a minha próxima aula?
 *   2. o que mais tenho agendado?
 *   3. como está meu plano (situação, créditos, renovação)?
 *   4. atalhos.
 *
 * Crédito só aparece para quem tem crédito: para o aluno de turma fixa,
 * "0 créditos" seria uma má notícia falsa.
 */
export function DashboardPage() {
  const { data: cliente } = useMeuCliente()
  const grade = useGradePublica()
  const turmas = useMinhasTurmasFixas()
  const { ctx, suspensao, isLoading, error, refetch } = useContextoAluno()

  const hoje = hojeIso()
  const aulas = minhasProximasAulas(grade.data ?? [], ctx, 14)
  const [proxima, ...seguintes] = aulas
  const { principais, pacotes, ultimoEncerrado, temCreditos } = separarPlanos(ctx.planos, hoje)
  const canceladas = minhasAulasCanceladas(grade.data ?? [], ctx, 14)
  const vagaSegurada = ctx.fila.find((f) => f.status === 'notificada')
  const atrasado = principais.find((p) => p.status === 'inadimplente')
  const primeiroNome = cliente?.nome?.split(' ')[0]

  return (
    <div>
      <header className="mb-6 lg:mb-8">
        <p className="text-sm text-neutral-500">{dataPorExtenso(hoje)}</p>
        <h1 className="font-display text-2xl font-bold text-ink lg:text-3xl">
          Olá{primeiroNome ? `, ${primeiroNome}` : ''}!
        </h1>
      </header>

      {error || grade.error ? (
        <ErroCarregar onTentar={() => { grade.refetch(); refetch() }} />
      ) : isLoading || grade.isLoading ? (
        <Carregando linhas={3} />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-2.5 empty:hidden">
            {vagaSegurada?.data && (
              <Aviso
                tom="atencao"
                titulo={`Vagou uma vaga na aula de ${rotuloDia(vagaSegurada.data).toLowerCase()}!`}
                acao={
                  <Link
                    to={`agenda?dia=${vagaSegurada.data}`}
                    className="text-xs font-semibold underline underline-offset-2"
                  >
                    Garantir minha vaga
                  </Link>
                }
              >
                Ela fica guardada para você por pouco tempo.
              </Aviso>
            )}
            {atrasado && (
              <Aviso
                tom="perigo"
                titulo="Pagamento do plano em aberto"
                acao={<Link to="meu-plano" className="text-xs font-semibold underline underline-offset-2">Ver meu plano</Link>}
              >
                Novos agendamentos ficam bloqueados até regularizar com a recepção.
              </Aviso>
            )}
            {suspensao && (
              <Aviso tom="atencao" titulo={`Agendamento antecipado pausado até ${fmtDiaMes(suspensao.fim)}`}>
                Você continua podendo agendar aulas do próprio dia e entrar na lista de espera.
              </Aviso>
            )}
            {canceladas.slice(0, 3).map((c) => (
              <AvisoAulaCancelada key={c.chave} aula={c} />
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
            <div className="flex flex-col gap-5 lg:col-span-2">
              <ProximaAula aula={proxima ?? null} />

              {seguintes.length > 0 && (
                <Secao
                  titulo="Aulas agendadas"
                  acao={
                    <Link to="aulas" className="text-xs font-semibold text-brand-700 hover:underline">
                      Ver todas
                    </Link>
                  }
                >
                  <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
                    {seguintes.slice(0, 4).map((a) => (
                      <LinhaAula key={a.chave} aula={a} />
                    ))}
                  </ul>
                </Secao>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <Secao
                titulo="Meu plano"
                acao={
                  principais.length > 0 ? (
                    <Link to="meu-plano" className="text-xs font-semibold text-brand-700 hover:underline">
                      Ver meu plano
                    </Link>
                  ) : undefined
                }
              >
                {principais.length === 0 ? (
                  <SemPlanoResumo encerrado={ultimoEncerrado} creditosAvulsos={pacotes.reduce((s, p) => s + p.saldo, 0)} />
                ) : (
                  <div className="flex flex-col gap-3">
                    {principais.map((p) => (
                      <ResumoPlano
                        key={p.matricula_id}
                        plano={p}
                        turmas={(turmas.data ?? []).filter((t) => t.matricula_id === p.matricula_id)}
                      />
                    ))}
                  </div>
                )}
              </Secao>

              <Secao titulo="Atalhos">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                  {/* Para quem só tem turma fixa não há o que agendar: o
                      atalho vira consulta, não promessa. */}
                  <Atalho to="agenda" icone={CalendarDays} principal>
                    {temCreditos || principais.length === 0 ? 'Agendar aula' : 'Ver agenda'}
                  </Atalho>
                  <Atalho to="aulas" icone={CalendarCheck}>
                    Aulas agendadas
                  </Atalho>
                  <Atalho to="meu-plano" icone={CreditCard}>
                    Meu plano
                  </Atalho>
                  <Atalho to="planos" icone={Sparkles}>
                    Planos e avulsas
                  </Atalho>
                </div>
              </Secao>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ProximaAula({ aula }: { aula: MinhaAula | null }) {
  if (!aula) {
    return (
      <Cartao className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Sua próxima aula</p>
          <p className="mt-1 text-base font-semibold text-neutral-900">Nenhuma aula agendada</p>
          <p className="text-sm text-neutral-500">Veja a agenda e escolha a próxima.</p>
        </div>
        <Link
          to="agenda"
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          Agendar aula
        </Link>
      </Cartao>
    )
  }

  const fixa = aula.origem === 'turma_fixa'
  return (
    <Cartao destaque className="relative overflow-hidden">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: aula.cor ?? 'var(--color-brand-500)' }} />
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {fixa ? 'Sua próxima turma' : 'Sua próxima aula'}
      </p>
      <p className="mt-2 font-display text-3xl font-bold leading-none text-ink lg:text-4xl">
        {rotuloDia(aula.data)} <span className="text-brand-600">·</span> {fmtHora(aula.horario)}
      </p>
      <p className="mt-2 text-lg font-semibold text-neutral-900">{aula.modalidade}</p>
      <p className="text-sm text-neutral-500">{[aula.professora, aula.sala].filter(Boolean).join(' · ')}</p>
      {fixa && (
        <p className="mt-3 inline-flex rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700">
          Sua turma fixa — não precisa agendar
        </p>
      )}
      <div className="mt-4">
        <Link to="aulas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
          Ver aulas agendadas
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </Cartao>
  )
}

function LinhaAula({ aula }: { aula: MinhaAula }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: aula.cor ?? 'var(--color-brand-400)' }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900">{aula.modalidade}</p>
        <p className="truncate text-xs text-neutral-500">
          {rotuloDia(aula.data)} · {fmtHora(aula.horario)}
          {aula.professora && ` · ${aula.professora}`}
        </p>
      </div>
      {aula.origem === 'turma_fixa' && <Badge variant="success">Turma fixa</Badge>}
    </li>
  )
}

/** O plano em três linhas: o que é, o que tem, quando renova. */
function ResumoPlano({ plano: p, turmas }: { plano: MeuPlano; turmas: TurmaFixa[] }) {
  const formato = formatoDoPlano(p)
  const situacao = situacaoDoPlano(p)
  const { rotulo, variante } = SITUACAO[situacao]

  return (
    <Link
      to="meu-plano"
      className="block rounded-xl border border-neutral-200/80 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-lg font-bold leading-tight text-ink">{tituloDoPlano(p)}</p>
        {situacao !== 'ativo' && <Badge variant={variante}>{rotulo}</Badge>}
      </div>

      {formato === 'turma_fixa' ? (
        <ul className="mt-2 flex flex-col gap-0.5 text-sm text-neutral-700">
          {turmas.map((t) => (
            <li key={t.vinculo_id}>
              {t.modalidade} · {t.dia_semana !== null ? nomeDiaPlural(t.dia_semana).toLowerCase() : ''} às{' '}
              {fmtHoraCurta(t.horario)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-neutral-700">
          <strong className="text-xl font-bold text-neutral-900">{p.saldo}</strong>{' '}
          {p.saldo === 1 ? 'crédito disponível' : 'créditos disponíveis'}
        </p>
      )}

      <p className={cn('mt-2 text-xs', situacao === 'cancelamento_solicitado' ? 'text-warning-700' : 'text-neutral-500')}>
        {situacao === 'cancelamento_solicitado' && p.solicitacao_vigente_ate
          ? `Cancelamento solicitado · ativo até ${fmtDataCompleta(p.solicitacao_vigente_ate)}`
          : p.cancelada_em
            ? `Não renova · ativo até ${fmtDataCompleta(ativoAte(p))}`
            : p.proxima_renovacao
              ? `Próxima renovação: ${fmtDataCompleta(p.proxima_renovacao)}`
              : `Válido até ${fmtDataCompleta(p.data_fim)}`}
      </p>
      {/* 7.7: último ciclo do semestral — a próxima renovação já é o mensal. */}
      {p.proximo_plano_nome && !p.cancelada_em && p.solicitacao_status !== 'pendente' && (
        <p className="mt-1 text-xs font-medium text-brand-700">
          Seu semestral termina em {fmtDataCompleta(p.data_fim)} e passa a mensal
          {p.proximo_plano_preco_centavos !== null && ` (${fmtPreco(p.proximo_plano_preco_centavos)}/mês)`}.
        </p>
      )}
    </Link>
  )
}

function SemPlanoResumo({ encerrado, creditosAvulsos }: { encerrado: MeuPlano | null; creditosAvulsos: number }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-4">
      <p className="text-sm font-semibold text-neutral-900">
        {encerrado ? `Seu plano terminou em ${fmtDataCompleta(ativoAte(encerrado))}` : 'Você ainda não tem um plano'}
      </p>
      {creditosAvulsos > 0 && (
        <p className="mt-0.5 text-sm text-neutral-600">Você tem {fmtCreditos(creditosAvulsos)} de aula avulsa.</p>
      )}
      <Link to="planos" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">
        Conhecer os planos
      </Link>
    </div>
  )
}

function Atalho({
  to,
  icone: Icone,
  principal,
  children,
}: {
  to: string
  icone: typeof CalendarDays
  principal?: boolean
  children: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3.5 py-3 text-sm font-semibold transition',
        principal
          ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
          : 'border border-neutral-200/80 bg-white text-neutral-700 hover:border-brand-300 hover:text-brand-700',
      )}
    >
      <Icone className="size-4 shrink-0" />
      {children}
    </Link>
  )
}
