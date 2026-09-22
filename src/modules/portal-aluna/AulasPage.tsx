import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { mensagemDoBanco, minhasAulasCanceladas, minhasProximasAulas, type MinhaAula } from './aulas'
import { Aviso, Cabecalho, Carregando, Cartao, ErroCarregar, Secao } from './components/Basicos'
import { AvisoAulaCancelada } from './components/AvisoAulaCancelada'
import { CancelarAula } from './components/CancelarAula'
import { fmtDiaMes, fmtHora, fmtHoraCurta, hojeIso, nomeDiaPlural, rotuloDia } from './datas'
import {
  useCancelarAgendamento,
  useConfigAgendamento,
  useContextoAluno,
  useGradePublica,
  useSairListaEspera,
} from './hooks/usePortalAluna'

/** "Hoje · 21/09", "Amanhã · 22/09", "qua, 24/09". */
function tituloDoDia(dia: string, hoje: string) {
  const r = rotuloDia(dia, hoje)
  return r === 'Hoje' || r === 'Amanhã' ? `${r} · ${fmtDiaMes(dia)}` : r
}

/** Horizonte da lista: cobre a maior janela de agendamento (21 dias). */
const HORIZONTE_DIAS = 21

/**
 * Aulas agendadas (antes "Minhas reservas").
 *
 * A semana do aluno inteira, agrupada por dia: as aulas que ele agendou
 * e as ocorrências da turma fixa dele — para quem treina em turma fixa,
 * uma lista só de agendamentos seria uma semana vazia. Turma fixa não tem
 * botão de cancelar: a vaga é dele e falta não gera reposição (2.3.8).
 */
export function AulasPage() {
  const grade = useGradePublica()
  const config = useConfigAgendamento()
  const { ctx, isLoading, error, refetch } = useContextoAluno()
  const cancelar = useCancelarAgendamento()
  const sairFila = useSairListaEspera()

  const [cancelando, setCancelando] = useState<MinhaAula | null>(null)
  const [erroCancelar, setErroCancelar] = useState<string | null>(null)
  const [retorno, setRetorno] = useState<string | null>(null)

  useEffect(() => {
    if (!retorno) return
    const t = setTimeout(() => setRetorno(null), 6000)
    return () => clearTimeout(t)
  }, [retorno])

  const hoje = hojeIso()
  const aulas = minhasProximasAulas(grade.data ?? [], ctx, HORIZONTE_DIAS)
  const canceladas = minhasAulasCanceladas(grade.data ?? [], ctx, HORIZONTE_DIAS)
  const porDia = new Map<string, MinhaAula[]>()
  for (const a of aulas) porDia.set(a.data, [...(porDia.get(a.data) ?? []), a])

  const porTurma = new Map((grade.data ?? []).map((t) => [t.turma_id, t]))
  const fila = ctx.fila.filter((f) => f.data && f.data >= hoje)
  const turmasFixas = ctx.turmasFixas.filter((t) => t.vigente || t.futuro)

  function horasDe(a: MinhaAula) {
    const plano = ctx.planos.find((p) => p.matricula_id === a.matriculaId)
    return plano?.horas_cancelamento ?? config.data?.horas_cancelamento ?? 4
  }

  function confirmar() {
    if (!cancelando?.agendamentoId) return
    setErroCancelar(null)
    cancelar.mutate(cancelando.agendamentoId, {
      onSuccess: (devolveu) => {
        setRetorno(devolveu ? 'Aula cancelada — o crédito voltou para o seu saldo.' : 'Aula cancelada.')
        setCancelando(null)
      },
      onError: (e) => setErroCancelar(mensagemDoBanco(e, 'Não foi possível cancelar.')),
    })
  }

  return (
    <div>
      <Cabecalho
        titulo="Aulas agendadas"
        subtitulo={`Próximos ${HORIZONTE_DIAS} dias`}
        acao={
          <Link
            to="../agenda"
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            Agendar aula
          </Link>
        }
      />

      {retorno && <Aviso tom="sucesso" titulo={retorno} className="mb-4" />}

      {error || grade.error ? (
        <ErroCarregar onTentar={() => { grade.refetch(); refetch() }} />
      ) : isLoading || grade.isLoading ? (
        <Carregando linhas={3} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            {canceladas.length > 0 && (
              <Secao titulo="Canceladas pelo estúdio">
                <div className="flex flex-col gap-2">
                  {canceladas.map((c) => (
                    <AvisoAulaCancelada key={c.chave} aula={c} />
                  ))}
                </div>
              </Secao>
            )}
            {aulas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
                <CalendarCheck className="mx-auto size-6 text-neutral-300" strokeWidth={1.5} />
                <p className="mt-2 text-sm font-semibold text-neutral-700">Nenhuma aula agendada</p>
                <p className="text-sm text-neutral-500">Escolha uma aula na agenda.</p>
                <Link to="../agenda" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
                  Ver agenda
                </Link>
              </div>
            ) : (
              [...porDia.entries()].map(([dia, itens]) => (
                <Secao key={dia} titulo={tituloDoDia(dia, hoje)}>
                  <ul className="flex flex-col gap-2">
                    {itens.map((a) => (
                      <li
                        key={a.chave}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border bg-white p-3.5',
                          a.origem === 'turma_fixa' ? 'border-success-200 bg-success-50/40' : 'border-neutral-200/80 shadow-sm',
                        )}
                      >
                        <span className="w-12 shrink-0 font-display text-lg font-bold text-ink tabular-nums">
                          {fmtHora(a.horario)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-neutral-900">
                            {a.cor && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: a.cor }} />}
                            {a.modalidade}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            {[a.professora, a.sala].filter(Boolean).join(' · ')}
                          </p>
                          {a.origem === 'turma_fixa' && (
                            <p className="mt-0.5 text-xs font-semibold text-success-700">Sua turma fixa</p>
                          )}
                          {a.origem === 'agendamento' && a.canal && a.canal !== 'mensalista' && (
                            <p className="mt-0.5 text-xs text-neutral-500">Agendada pelo app parceiro — cancele por lá</p>
                          )}
                        </div>
                        {a.origem === 'agendamento' && a.canal === 'mensalista' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setErroCancelar(null)
                              setCancelando(a)
                            }}
                          >
                            Cancelar
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Secao>
              ))
            )}
          </div>

          <div className="flex flex-col gap-5">
            {turmasFixas.length > 0 && (
              <Secao titulo={turmasFixas.length === 1 ? 'Sua turma fixa' : 'Suas turmas fixas'}>
                <Cartao>
                  <ul className="flex flex-col gap-2.5">
                    {turmasFixas.map((t) => (
                      <li key={t.vinculo_id}>
                        <p className="font-semibold text-neutral-900">{t.modalidade}</p>
                        <p className="text-sm text-neutral-600">
                          {t.dia_semana !== null ? nomeDiaPlural(t.dia_semana) : ''} · {fmtHoraCurta(t.horario)}
                          {t.professora && ` · Prof. ${t.professora}`}
                        </p>
                        {t.futuro && t.inicio && (
                          <Badge variant="brand" className="mt-1">A partir de {fmtDiaMes(t.inicio)}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-neutral-100 pt-3 text-xs leading-relaxed text-neutral-500">
                    Você já faz parte dessa turma: não precisa agendar. Faltas não geram reposição nem crédito.
                  </p>
                </Cartao>
              </Secao>
            )}

            {fila.length > 0 && (
              <Secao titulo="Lista de espera">
                <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
                  {fila.map((f) => {
                    const t = porTurma.get(f.turma_id)
                    return (
                      <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-neutral-900">{t?.modalidade ?? 'Aula'}</p>
                          <p className="text-xs text-neutral-500">
                            {rotuloDia(f.data!, hoje)} · {fmtHora(t?.horario)}
                          </p>
                          <p className={cn('mt-0.5 text-xs font-semibold', f.status === 'notificada' ? 'text-warning-700' : 'text-brand-700')}>
                            {f.status === 'notificada' ? 'Vagou! Garanta na agenda' : `${f.posicao}º da fila`}
                          </p>
                        </div>
                        {f.status === 'notificada' ? (
                          <Link to={`../agenda?dia=${f.data}`} className="text-xs font-semibold text-brand-700 hover:underline">
                            Garantir
                          </Link>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={sairFila.isPending && sairFila.variables === f.id}
                            onClick={() => sairFila.mutate(f.id!)}
                          >
                            Sair
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </Secao>
            )}
          </div>
        </div>
      )}

      {cancelando && (
        <CancelarAula
          aula={cancelando}
          horasCancelamento={horasDe(cancelando)}
          usaCredito={Boolean(cancelando.matriculaId)}
          pendente={cancelar.isPending}
          erro={erroCancelar}
          onConfirmar={confirmar}
          onFechar={() => setCancelando(null)}
        />
      )}
    </div>
  )
}
