import { useMemo, useState } from 'react'
import { DIAS_SEMANA_CURTO, fmtHora } from './types'
import { usePortalClienteId } from './PortalClienteContext'
import {
  useAgendarAula,
  useConfigAgendamento,
  useEntrarListaEspera,
  useGradePublica,
  useMinhaFila,
  useMinhaSuspensao,
  useSairListaEspera,
  useVagas,
} from './hooks/usePortalAluna'

const DIAS_A_MOSTRAR = 10

/** dd/mm — a aluna não precisa do ano para uma data a 15 dias daqui. */
function fmtDataCurta(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function gerarProximosDias(qtd: number) {
  const dias: { iso: string; diaSemana: number; diaMes: number }[] = []
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  for (let i = 0; i < qtd; i++) {
    const d = new Date(hoje)
    d.setDate(d.getDate() + i)
    dias.push({
      iso: d.toISOString().slice(0, 10),
      diaSemana: d.getDay(),
      diaMes: d.getDate(),
    })
  }
  return dias
}

export function AgendaPage() {
  const clienteId = usePortalClienteId()
  const dias = useMemo(() => gerarProximosDias(DIAS_A_MOSTRAR), [])
  const [selecionado, setSelecionado] = useState(dias[0].iso)

  const { data: grade, isLoading: carregandoGrade } = useGradePublica()
  const { data: vagas } = useVagas(dias[0].iso, dias[dias.length - 1].iso)
  const { data: config } = useConfigAgendamento()
  const { data: fila } = useMinhaFila()
  const { data: suspensao } = useMinhaSuspensao()
  const agendar = useAgendarAula()
  const entrarFila = useEntrarListaEspera()
  const sairFila = useSairListaEspera()
  const [feedback, setFeedback] = useState<string | null>(null)

  const diaAtual = dias.find((d) => d.iso === selecionado)!
  const turmasDoDia = (grade ?? []).filter((t) => t.dia_semana === diaAtual.diaSemana)

  function vagasOcupadas(turmaId: string) {
    return vagas?.find((v) => v.turma_id === turmaId && v.data === selecionado)?.ocupadas ?? 0
  }

  /** Minha inscrição viva na fila desta aula, se houver. */
  function minhaFilaDe(turmaId: string) {
    return (fila ?? []).find((f) => f.turma_id === turmaId && f.data === selecionado)
  }

  function reservar(turmaId: string) {
    setFeedback(null)
    agendar.mutate(
      { clienteId, turmaId, data: selecionado },
      {
        onError: (err) => setFeedback(err instanceof Error ? err.message : 'Não foi possível reservar.'),
        onSuccess: () => setFeedback('Reserva confirmada!'),
      },
    )
  }

  function entrarNaFila(turmaId: string) {
    setFeedback(null)
    entrarFila.mutate(
      { turmaId, data: selecionado },
      {
        onError: (err) =>
          setFeedback(err instanceof Error ? err.message : 'Não foi possível entrar na fila.'),
        onSuccess: () => setFeedback('Você entrou na fila — avisamos por e-mail se vagar.'),
      },
    )
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Agenda</h1>
      {config && (
        <p className="mb-4 text-xs text-neutral-400">
          Cancelamento até {config.horas_cancelamento}h antes, sem perda de crédito.
        </p>
      )}

      {/* O regulamento manda avisar por escrito e diz, literalmente, para
          não deixar a pessoa descobrir sozinha na hora de agendar. O
          e-mail sai na hora da terceira falta; este aviso é o segundo
          lugar onde ela não deveria ser pega de surpresa. Explica o que
          AINDA dá para fazer, não só o que foi bloqueado. */}
      {suspensao && (
        <div className="mb-4 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
          <strong className="font-semibold">Agendamento antecipado pausado</strong> até{' '}
          {fmtDataCurta(suspensao.fim)}, por {suspensao.faltas} faltas sem cancelamento.
          <span className="mt-1 block text-xs">
            Você continua treinando: dá para reservar as aulas <strong>de hoje</strong> ou
            entrar na lista de espera. Quer conversar sobre isso? Fala com o estúdio.
          </span>
        </div>
      )}

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {dias.map((d) => (
          <button
            key={d.iso}
            onClick={() => setSelecionado(d.iso)}
            className={`flex shrink-0 flex-col items-center rounded-lg px-3 py-2 text-xs transition ${
              d.iso === selecionado
                ? 'bg-brand-600 text-white'
                : 'bg-white text-neutral-500 border border-neutral-200'
            }`}
          >
            <span>{DIAS_SEMANA_CURTO[d.diaSemana]}</span>
            <span className="text-sm font-semibold">{d.diaMes}</span>
          </button>
        ))}
      </div>

      {feedback && <p className="mb-3 text-sm text-brand-700">{feedback}</p>}

      {carregandoGrade && <p className="text-sm text-neutral-400">Carregando…</p>}

      <div className="flex flex-col gap-2.5">
        {turmasDoDia.map((t) => {
          const ocupadas = vagasOcupadas(t.turma_id!)
          const capacidade = t.capacidade ?? 0
          const lotada = ocupadas >= capacidade
          const naFila = minhaFilaDe(t.turma_id!)
          return (
            <div key={t.turma_id} className="rounded-lg border border-neutral-200 bg-white p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="flex items-baseline gap-1.5 text-sm font-semibold text-neutral-900">
                  {/* Mesma cor de categoria da grade do estúdio — só o ponto,
                      sem preencher o cartão: aqui o aluno escolhe uma aula,
                      não lê a composição da semana. */}
                  {t.categoria_cor && (
                    <span
                      className="size-2 shrink-0 translate-y-[-1px] rounded-full"
                      style={{ background: t.categoria_cor }}
                      title={t.categoria_nome ?? undefined}
                    />
                  )}
                  {fmtHora(t.horario ?? '')} {t.modalidade}
                </span>
                <span
                  className={`text-xs font-medium ${lotada ? 'text-red-600' : 'text-brand-700'}`}
                >
                  {lotada ? 'Lotada' : `${capacidade - ocupadas}/${capacidade} vagas`}
                </span>
              </div>
              <div className="mb-2.5 text-xs text-neutral-500">{t.professora_nome}</div>

              {naFila?.status === 'notificada' ? (
                // Vagou e a vaga está segurada para ela — o botão precisa
                // ser o de reservar, não o da fila.
                <>
                  <p className="mb-2 rounded-md bg-success-50 px-2.5 py-1.5 text-xs text-success-700">
                    Vagou! A vaga está guardada para você por{' '}
                    {config?.minutos_reserva_espera ?? 30} min.
                  </p>
                  <button
                    disabled={agendar.isPending}
                    onClick={() => reservar(t.turma_id!)}
                    className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                  >
                    Garantir minha vaga
                  </button>
                </>
              ) : naFila ? (
                <button
                  disabled={sairFila.isPending}
                  onClick={() => sairFila.mutate(naFila.id!)}
                  className="w-full rounded-md border border-neutral-200 py-2 text-sm font-medium text-neutral-500 transition hover:border-neutral-300 disabled:opacity-50"
                >
                  Na fila · {naFila.posicao}º — sair
                </button>
              ) : lotada ? (
                <button
                  disabled={entrarFila.isPending}
                  onClick={() => entrarNaFila(t.turma_id!)}
                  className="w-full rounded-md border border-brand-300 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
                >
                  Entrar na lista de espera
                </button>
              ) : (
                <button
                  disabled={agendar.isPending}
                  onClick={() => reservar(t.turma_id!)}
                  className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                >
                  Reservar
                </button>
              )}
            </div>
          )
        })}
        {!carregandoGrade && turmasDoDia.length === 0 && (
          <p className="py-4 text-center text-sm text-neutral-400">Sem aulas nesse dia.</p>
        )}
      </div>
    </div>
  )
}
