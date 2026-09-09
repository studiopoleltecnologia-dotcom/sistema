import { useState } from 'react'
import { ArrowRightLeft, CalendarClock, MapPin, Plus, X } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { fmtData } from '../../../lib/datas'
import {
  useAdicionarTurmaFixa,
  useEncerrarTurmaFixa,
  useTrocarTurmaFixa,
} from '../hooks/useMatriculas'
import { SeletorTurmaFixa } from './SeletorTurmaFixa'
import { assentosDisponiveis, descreverTurma, type MatriculaCompleta, type MatriculaTurma } from '../types'

/**
 * As turmas de uma matrícula de turma fixa — a resposta a "qual turma
 * essa pessoa realmente contratou", que o item 14 do pedido quer sem
 * ambiguidade.
 *
 * Mostra as três situações que existem no banco e que a equipe precisa
 * distinguir: o assento de hoje, o que já está agendado para a próxima
 * renovação (troca do 6.5, que é o caso mais fácil de a pessoa achar
 * que "não funcionou") e o histórico do que ficou para trás.
 */
export function TurmasVinculadas({
  matricula,
  gestao,
  compacto = false,
}: {
  matricula: MatriculaCompleta
  gestao: boolean
  /** Na ficha do aluno o espaço é estreito: some com o histórico. */
  compacto?: boolean
}) {
  const [trocando, setTrocando] = useState<MatriculaTurma | null>(null)
  const [adicionando, setAdicionando] = useState(false)
  const encerrar = useEncerrarTurmaFixa()

  const vagas = assentosDisponiveis(matricula)
  const podeMexer = gestao && !matricula.saldo.cancelamento_efetivo_em

  return (
    <div className="flex flex-col gap-1.5">
      {matricula.turmas.length === 0 && matricula.turmasFuturas.length === 0 && (
        <p className="rounded-md border border-dashed border-warning-300 bg-warning-50 px-2.5 py-1.5 text-xs text-warning-700">
          Nenhuma turma vinculada — o aluno está pagando por uma vaga que não existe em lugar
          nenhum. Vincule uma turma.
        </p>
      )}

      {matricula.turmas.map((t) => (
        <LinhaTurma
          key={t.vinculo_id}
          turma={t}
          podeMexer={podeMexer}
          onTrocar={() => setTrocando(t)}
          onEncerrar={() =>
            t.vinculo_id && encerrar.mutate({ vinculoId: t.vinculo_id })
          }
          podeEncerrar={matricula.turmas.length + matricula.turmasFuturas.length > 1}
        />
      ))}

      {matricula.turmasFuturas.map((t) => (
        <LinhaTurma key={t.vinculo_id} turma={t} futura podeMexer={false} />
      ))}

      {podeMexer && vagas > 0 && (
        <button
          onClick={() => setAdicionando(true)}
          className="flex items-center gap-1.5 self-start rounded-md border border-dashed border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-brand-400 hover:text-brand-700"
        >
          <Plus className="size-3.5" />
          Vincular {vagas === 1 ? 'a turma que falta' : `mais ${vagas} turmas`}
        </button>
      )}

      {!compacto && matricula.turmasEncerradas.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-neutral-400 transition hover:text-neutral-600">
            Histórico de turmas ({matricula.turmasEncerradas.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1 pl-1">
            {matricula.turmasEncerradas.map((t) => (
              <li key={t.vinculo_id} className="text-[11px] text-neutral-400">
                <span className="line-through">{descreverTurma(t)}</span>
                {t.fim && <span> · até {fmtData(t.fim)}</span>}
                {t.motivo_saida && <span> · {t.motivo_saida}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {trocando && (
        <ModalTrocarTurma
          vinculo={trocando}
          jaContratadas={[...matricula.turmas, ...matricula.turmasFuturas]
            .map((t) => t.turma_id)
            .filter((id): id is string => id !== null)}
          dataFim={matricula.saldo.data_fim}
          onFechar={() => setTrocando(null)}
        />
      )}

      {adicionando && matricula.saldo.matricula_id && (
        <ModalAdicionarTurma
          matriculaId={matricula.saldo.matricula_id}
          restantes={vagas}
          jaContratadas={[...matricula.turmas, ...matricula.turmasFuturas]
            .map((t) => t.turma_id)
            .filter((id): id is string => id !== null)}
          onFechar={() => setAdicionando(false)}
        />
      )}
    </div>
  )
}

function LinhaTurma({
  turma: t,
  futura = false,
  podeMexer,
  onTrocar,
  onEncerrar,
  podeEncerrar,
}: {
  turma: MatriculaTurma
  futura?: boolean
  podeMexer: boolean
  onTrocar?: () => void
  onEncerrar?: () => void
  podeEncerrar?: boolean
}) {
  return (
    <div
      className={`group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5 text-sm ${
        futura
          ? 'border-dashed border-brand-300 bg-brand-50/40'
          : 'border-neutral-200 bg-white'
      }`}
    >
      <span className="font-medium text-neutral-800">{descreverTurma(t, { comProfessora: false })}</span>
      {t.professora && <span className="text-xs text-neutral-500">Prof. {t.professora}</span>}
      {t.sala && (
        <span className="flex items-center gap-0.5 text-[11px] text-neutral-400">
          <MapPin className="size-3" />
          {t.sala}
        </span>
      )}
      {futura && (
        <Badge variant="brand" className="gap-1">
          <CalendarClock className="size-3" />a partir de {t.inicio ? fmtData(t.inicio) : '—'}
        </Badge>
      )}
      {!futura && t.fim && <Badge variant="warning">até {fmtData(t.fim)}</Badge>}

      {podeMexer && (
        <div className="ml-auto flex gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          <button
            onClick={onTrocar}
            title="Trocar de turma (vale na próxima renovação)"
            className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-brand-600"
          >
            <ArrowRightLeft className="size-3.5" />
          </button>
          {podeEncerrar && (
            <button
              onClick={onEncerrar}
              title="Encerrar esta turma (vale na próxima renovação)"
              className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-danger-600"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Regulamento 6.5: a troca vale a partir da próxima renovação, e a
 * turma nova precisa ter vaga. As duas coisas são do banco; aqui a tela
 * só precisa dizer QUANDO vai valer, senão a equipe troca, olha a grade,
 * não vê nada mudar e troca de novo.
 */
function ModalTrocarTurma({
  vinculo,
  jaContratadas,
  dataFim,
  onFechar,
}: {
  vinculo: MatriculaTurma
  jaContratadas: string[]
  dataFim: string | null
  onFechar: () => void
}) {
  const trocar = useTrocarTurmaFixa()
  const [nova, setNova] = useState<string[]>([])
  const [imediato, setImediato] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Modal title="Trocar de turma" onFechar={onFechar} size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-neutral-600">
          Saindo de <strong className="text-neutral-900">{descreverTurma(vinculo)}</strong>.
        </p>

        <SeletorTurmaFixa
          maximo={1}
          selecionadas={nova}
          onChange={setNova}
          jaContratadas={jaContratadas}
        />

        <label className="flex items-start gap-2 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          <input
            type="checkbox"
            checked={imediato}
            onChange={(e) => setImediato(e.target.checked)}
            className="mt-0.5 accent-brand-600"
          />
          <span>
            <strong>Trocar agora</strong>, sem esperar a renovação.
            <span className="mt-0.5 block text-neutral-400">
              O padrão do regulamento (6.5) é a troca valer a partir da próxima renovação
              {dataFim ? ` — ${fmtData(dataFim)}` : ''}, porque o aluno pagou por aquele assento
              até lá. Marque só em correção de cadastro ou quando a turma deixar de existir.
            </span>
          </span>
        </label>

        {erro && <p className="text-sm text-danger-600">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            disabled={nova.length !== 1}
            loading={trocar.isPending}
            onClick={() =>
              vinculo.vinculo_id &&
              trocar.mutate(
                { vinculoId: vinculo.vinculo_id, turmaNovaId: nova[0], imediato },
                { onSuccess: onFechar, onError: (e) => setErro((e as Error).message) },
              )
            }
          >
            {imediato ? 'Trocar agora' : 'Agendar troca'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Regulamento 6.3: incluir a segunda turma vale imediatamente. */
function ModalAdicionarTurma({
  matriculaId,
  restantes,
  jaContratadas,
  onFechar,
}: {
  matriculaId: string
  restantes: number
  jaContratadas: string[]
  onFechar: () => void
}) {
  const adicionar = useAdicionarTurmaFixa()
  const [novas, setNovas] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Modal title="Vincular turma" onFechar={onFechar} size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-neutral-500">
          A inclusão vale <strong>imediatamente</strong> (regulamento 6.3). A diferença
          proporcional aos dias restantes do ciclo é cobrada à parte, no Financeiro.
        </p>

        <SeletorTurmaFixa
          maximo={restantes}
          selecionadas={novas}
          onChange={setNovas}
          jaContratadas={jaContratadas}
        />

        {erro && <p className="text-sm text-danger-600">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            disabled={novas.length === 0}
            loading={adicionar.isPending}
            onClick={async () => {
              setErro(null)
              try {
                for (const turmaId of novas) {
                  await adicionar.mutateAsync({ matriculaId, turmaId })
                }
                onFechar()
              } catch (e) {
                setErro((e as Error).message)
              }
            }}
          >
            Vincular
          </Button>
        </div>
      </div>
    </Modal>
  )
}
