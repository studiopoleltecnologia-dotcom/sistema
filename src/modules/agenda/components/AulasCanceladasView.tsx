import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarX2, Undo2 } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../components/ui/cn'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Modal } from '../../../components/ui/Modal'
import { SectionTitle } from '../../../components/ui/SectionTitle'
import { useConfirmar } from '../../../components/ui/ConfirmarAcao'
import {
  useAulasCanceladas,
  useCancelarAulas,
  usePreviaCancelamento,
  useReabrirAula,
  useTurmas,
} from '../hooks/useAgenda'
import { hojeISO, somarDias } from '../semana'
import {
  DIAS_SEMANA,
  MOTIVOS_CANCELAMENTO_AULA,
  ROTULO_MOTIVO_AULA,
  type AulaCancelada,
  type MotivoCancelamentoAula,
  type TurmaComProfessora,
} from '../types'

/** Quantos dias para trás a lista mostra, para conferir o que já passou. */
const HISTORICO_DIAS = 14

function diaDaSemana(data: string) {
  return new Date(`${data}T12:00:00`).getDay()
}

function rotuloData(data: string) {
  const [, m, d] = data.split('-')
  return `${DIAS_SEMANA[diaDaSemana(data)]}, ${d}/${m}`
}

const hhmm = (h: string | null | undefined) => (h ?? '').slice(0, 5)

/**
 * Aulas canceladas pelo estúdio — professora com imprevisto, feriado,
 * chuva que alagou a rua, turma que não fechou o mínimo.
 *
 * Cancelar aqui não é "cancelar os agendamentos um por um": o banco
 * encerra a fila, devolve o crédito de quem agendou (sem olhar o prazo de
 * 4h, que é regra do aluno), dá reposição a quem tem turma fixa e avisa
 * cada pessoa por e-mail. A equipe vê antes quem vai ser atingido.
 */
export function AulasCanceladasView() {
  const hoje = hojeISO()
  const { data: canceladas, isLoading } = useAulasCanceladas(somarDias(hoje, -HISTORICO_DIAS))
  const { data: turmas } = useTurmas()
  const reabrir = useReabrirAula()
  const confirmar = useConfirmar()
  const [aberto, setAberto] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)

  const porTurma = useMemo(() => new Map((turmas ?? []).map((t) => [t.id, t])), [turmas])
  const lista = canceladas ?? []
  const futuras = lista.filter((c) => c.data >= hoje && !c.reaberta_em)
  const historico = lista.filter((c) => c.data < hoje || c.reaberta_em)

  const porData = new Map<string, AulaCancelada[]>()
  for (const c of futuras) porData.set(c.data, [...(porData.get(c.data) ?? []), c])

  function pedirReabertura(c: AulaCancelada) {
    const t = porTurma.get(c.turma_id)
    confirmar.pedir({
      titulo: 'Reabrir esta aula?',
      tom: 'arquivar',
      textoConfirmar: 'Reabrir aula',
      descricao: (
        <>
          {t?.modalidade} de {rotuloData(c.data)} às {hhmm(t?.horario)} volta a aceitar agendamento.
          Quem já foi avisado <strong>não</strong> é reagendado sozinho: os créditos devolvidos e as
          reposições de turma fixa continuam com os alunos.
        </>
      ),
      aoConfirmar: async () => {
        await reabrir.mutateAsync(c.id)
      },
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-neutral-500">
          Aula que não vai acontecer. Ao cancelar, quem agendou recebe o crédito de volta, quem tem
          turma fixa ganha uma reposição e todos são avisados por e-mail.
        </p>
        <Button onClick={() => { setFeito(null); setAberto(true) }}>
          <CalendarX2 className="size-4" />
          Cancelar aula
        </Button>
      </div>

      {feito && (
        <p className="rounded-md bg-success-50 px-3 py-2 text-sm text-success-700">{feito}</p>
      )}

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {!isLoading && futuras.length === 0 && (
        <EmptyState
          icon={CalendarX2}
          title="Nenhuma aula cancelada daqui para frente"
          description="Quando a professora tiver um imprevisto, num feriado ou se a turma não fechar o mínimo, cancele por aqui — os alunos são avisados na hora."
        />
      )}

      {[...porData.entries()].map(([data, itens]) => (
        <section key={data}>
          <SectionTitle>{rotuloData(data)}</SectionTitle>
          <div className="grid gap-2 xl:grid-cols-2">
            {itens.map((c) => (
              <CartaoCancelada
                key={c.id}
                c={c}
                turma={porTurma.get(c.turma_id)}
                onReabrir={() => pedirReabertura(c)}
              />
            ))}
          </div>
        </section>
      ))}

      {historico.length > 0 && (
        <section className="opacity-70">
          <SectionTitle>Últimos {HISTORICO_DIAS} dias</SectionTitle>
          <ul className="flex flex-col gap-1 text-sm text-neutral-600">
            {historico.map((c) => {
              const t = porTurma.get(c.turma_id)
              return (
                <li key={c.id}>
                  {rotuloData(c.data)} · {hhmm(t?.horario)} {t?.modalidade ?? 'Aula'} —{' '}
                  {ROTULO_MOTIVO_AULA[c.motivo]}
                  {c.reaberta_em && <span className="text-neutral-400"> (reaberta)</span>}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {aberto && (
        <CancelarAulasModal
          turmas={turmas ?? []}
          canceladas={futuras}
          onFechar={(resumo) => {
            setAberto(false)
            if (resumo) setFeito(resumo)
          }}
        />
      )}
      {confirmar.dialogo}
    </div>
  )
}

function CartaoCancelada({
  c,
  turma,
  onReabrir,
}: {
  c: AulaCancelada
  turma: TurmaComProfessora | undefined
  onReabrir: () => void
}) {
  const impacto = [
    c.agendamentos_cancelados > 0 &&
      `${c.agendamentos_cancelados} agendamento(s) cancelado(s), ${c.creditos_devolvidos} crédito(s) devolvido(s)`,
    c.reposicoes_concedidas > 0 && `${c.reposicoes_concedidas} reposição(ões) de turma fixa`,
    c.fila_encerrada > 0 && `${c.fila_encerrada} da lista de espera avisado(s)`,
  ].filter(Boolean)

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-neutral-200/80 bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-neutral-900">
            <span className="tabular-nums">{hhmm(turma?.horario)}</span> · {turma?.modalidade ?? 'Aula'}
          </p>
          <p className="text-xs text-neutral-500">
            {[turma?.professora?.nome, turma?.sala?.nome].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Badge variant="warning">{ROTULO_MOTIVO_AULA[c.motivo]}</Badge>
      </div>
      {c.mensagem && <p className="text-sm text-neutral-600">“{c.mensagem}”</p>}
      <p className="text-xs text-neutral-500">
        {impacto.length > 0 ? impacto.join(' · ') : 'Ninguém agendado nem com turma fixa nesta aula.'}
      </p>
      {c.agendamentos_app > 0 && (
        <p className="flex items-start gap-1.5 rounded-md bg-warning-50 px-2.5 py-1.5 text-xs text-warning-700">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {c.agendamentos_app} reserva(s) feita(s) pelo Wellhub/ClassPass: cancele também no portal do
          parceiro — o sistema do estúdio não consegue cancelar lá (regulamento 9.1).
        </p>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onReabrir}>
          <Undo2 className="size-3.5" />
          Reabrir
        </Button>
      </div>
    </article>
  )
}

// ------------------------------------------------------------
// O formulário
// ------------------------------------------------------------

function CancelarAulasModal({
  turmas,
  canceladas,
  onFechar,
}: {
  turmas: TurmaComProfessora[]
  canceladas: AulaCancelada[]
  onFechar: (resumo?: string) => void
}) {
  const hoje = hojeISO()
  const [data, setData] = useState(hoje)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [motivo, setMotivo] = useState<MotivoCancelamentoAula | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [repor, setRepor] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const cancelar = useCancelarAulas()

  const doDia = turmas
    .filter((t) => t.dia_semana === diaDaSemana(data))
    .sort((a, b) => a.horario.localeCompare(b.horario))
  const jaCanceladas = new Set(canceladas.filter((c) => c.data === data).map((c) => c.turma_id))
  const disponiveis = doDia.filter((t) => !jaCanceladas.has(t.id))
  const ids = [...selecionadas].filter((id) => disponiveis.some((t) => t.id === id))
  const todas = disponiveis.length > 0 && ids.length === disponiveis.length

  const previa = usePreviaCancelamento(ids, data)
  const total = (previa.data ?? []).reduce(
    (s, p) => ({
      agendados: s.agendados + p.agendados,
      app: s.app + p.pelo_app,
      fixa: s.fixa + p.turma_fixa,
      fila: s.fila + p.na_fila,
    }),
    { agendados: 0, app: 0, fixa: 0, fila: 0 },
  )

  function alternar(id: string) {
    const novo = new Set(selecionadas)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    setSelecionadas(novo)
  }

  function trocarData(nova: string) {
    setData(nova)
    setSelecionadas(new Set())
  }

  const precisaRecado = motivo === 'outro' && !mensagem.trim()
  const podeEnviar = ids.length > 0 && motivo !== null && !precisaRecado

  function enviar() {
    if (!podeEnviar || !motivo) return
    setErro(null)
    cancelar.mutate(
      { turmas: ids, data, motivo, mensagem, reporTurmaFixa: repor },
      {
        onSuccess: (n) =>
          onFechar(
            `${n} aula(s) de ${rotuloData(data)} cancelada(s). Os alunos atingidos foram avisados por e-mail.`,
          ),
        onError: (e) => setErro((e as { message?: string })?.message ?? 'Não foi possível cancelar.'),
      },
    )
  }

  return (
    <Modal title="Cancelar aula" size="lg" onFechar={() => !cancelar.isPending && onFechar()}>
      <div className="flex flex-col gap-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-600">Data</span>
          <input
            type="date"
            value={data}
            min={hoje}
            onChange={(e) => e.target.value && trocarData(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <span className="ml-2 text-sm text-neutral-500">{DIAS_SEMANA[diaDaSemana(data)]}</span>
        </label>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-neutral-600">Aulas</span>
            {disponiveis.length > 1 && (
              <button
                type="button"
                onClick={() => setSelecionadas(todas ? new Set() : new Set(disponiveis.map((t) => t.id)))}
                className="text-xs font-semibold text-brand-700 hover:underline"
              >
                {todas ? 'Desmarcar todas' : 'Selecionar o dia inteiro'}
              </button>
            )}
          </div>
          {doDia.length === 0 ? (
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">Não há aulas neste dia da semana.</p>
          ) : (
            <ul className="max-h-60 divide-y divide-neutral-100 overflow-y-auto rounded-md border border-neutral-200">
              {doDia.map((t) => {
                const ja = jaCanceladas.has(t.id)
                return (
                  <li key={t.id}>
                    <label
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 text-sm',
                        ja ? 'cursor-not-allowed text-neutral-400' : 'cursor-pointer hover:bg-neutral-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={ja}
                        checked={ja || selecionadas.has(t.id)}
                        onChange={() => alternar(t.id)}
                        className="size-4 accent-brand-600"
                      />
                      <span className="w-12 font-semibold tabular-nums">{hhmm(t.horario)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {t.modalidade}
                        <span className="text-neutral-400"> · {t.professora?.nome}</span>
                      </span>
                      {ja && <Badge variant="neutral">já cancelada</Badge>}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-neutral-600">Motivo</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {MOTIVOS_CANCELAMENTO_AULA.map((m) => (
              <label
                key={m.valor}
                className={cn(
                  'flex cursor-pointer flex-col rounded-md border px-3 py-2 text-sm transition',
                  motivo === m.valor
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                    : 'border-neutral-200 hover:border-neutral-300',
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="motivo"
                    checked={motivo === m.valor}
                    onChange={() => setMotivo(m.valor)}
                    className="accent-brand-600"
                  />
                  <span className="font-medium text-neutral-800">{m.rotulo}</span>
                </span>
                <span className="ml-6 text-xs text-neutral-400">{m.exemplo}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-600">
            Recado para os alunos{' '}
            <span className="font-normal text-neutral-400">
              {motivo === 'outro' ? '(obrigatório)' : '(opcional — vai no e-mail e no app)'}
            </span>
          </span>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ex.: A Joanne teve um imprevisto. A aula de quinta que vem acontece normalmente."
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </label>

        <label className="flex items-start gap-2.5 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={repor}
            onChange={(e) => setRepor(e.target.checked)}
            className="mt-0.5 size-4 accent-brand-600"
          />
          <span>
            Dar 1 crédito de reposição a quem tem turma fixa nestas aulas
            <span className="block text-xs text-neutral-400">
              Regulamento 2.3.10. Não conta no limite de reposições do aluno.
            </span>
          </span>
        </label>

        {ids.length > 0 && (
          <div className="rounded-md bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">
            {previa.isLoading ? (
              'Calculando quem será avisado…'
            ) : (
              <>
                <strong>{ids.length}</strong> aula(s): {total.agendados} agendamento(s) com crédito devolvido ·{' '}
                {total.fixa} de turma fixa{repor ? ' (ganham reposição)' : ''} · {total.fila} na lista de espera.
                {total.app > 0 && (
                  <span className="mt-1 block text-xs text-warning-700">
                    {total.app} reserva(s) pelo Wellhub/ClassPass — cancele também no portal do parceiro.
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {erro && <p className="text-sm text-danger-600">{erro}</p>}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onFechar()} disabled={cancelar.isPending} autoFocus>
          Voltar
        </Button>
        <Button variant="danger" onClick={enviar} disabled={!podeEnviar} loading={cancelar.isPending}>
          Cancelar {ids.length > 1 ? `${ids.length} aulas` : 'aula'} e avisar
        </Button>
      </div>
    </Modal>
  )
}
