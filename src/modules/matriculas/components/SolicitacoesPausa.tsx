import { useState } from 'react'
import { CalendarClock, HeartPulse, PauseCircle, User } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { fmtData, fmtDataHora } from '../../../lib/datas'
import { useAprovarPausa, useEncerrarPausa, useRecusarPausa } from '../hooks/usePausas'
import type { Pausa } from '../api/pausas'

const ROTULO: Record<string, { texto: string; variante: 'warning' | 'brand' | 'neutral' }> = {
  solicitada: { texto: 'esperando decisão', variante: 'warning' },
  aprovada: { texto: 'aprovada · começa depois', variante: 'brand' },
  ativa: { texto: 'em curso', variante: 'neutral' },
}

/**
 * Pedidos de pausa do portal (regulamento §7).
 *
 * O pedido NÃO pausou nada: até a gestão aprovar, o plano segue ativo e a
 * cobrança também — e é isso que o aluno lê na tela dele. Aprovar é o que
 * congela o ciclo.
 *
 * Duas coisas aparecem no cartão de propósito, porque são as que a gestão
 * precisa saber antes de clicar:
 *
 * * **turma fixa** — a vaga continua guardada (o sistema não a libera), e
 *   quem quiser liberar faz à mão. Sem o aviso, ninguém lembraria de
 *   olhar a sala.
 * * **semestral** — a pausa prorroga o compromisso pelos dias pausados,
 *   então o fim do semestral muda.
 */
export function SolicitacoesPausa({ pausas, gestao }: { pausas: Pausa[]; gestao: boolean }) {
  const [recusando, setRecusando] = useState<Pausa | null>(null)
  const [encerrando, setEncerrando] = useState<Pausa | null>(null)
  const aprovar = useAprovarPausa()

  if (pausas.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-400">
        Nenhuma pausa pedida ou em curso.
      </p>
    )
  }

  return (
    <>
      {!gestao && (
        <p className="text-sm text-neutral-500">
          Quem decide a pausa é a gestão. Se o aluno falar com você, o pedido já está registrado — e o
          plano dele segue ativo até a confirmação.
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {pausas.map((p) => {
          const r = ROTULO[p.status ?? ''] ?? { texto: p.status ?? '', variante: 'neutral' as const }
          return (
            <article
              key={p.id}
              className="rounded-lg border border-neutral-200/80 bg-white p-3.5 shadow-sm"
            >
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-display text-sm font-bold text-neutral-900">{p.cliente_nome}</h4>
                  <p className="mt-0.5 text-sm text-neutral-600">{p.plano_nome}</p>
                </div>
                <Badge variant={r.variante}>{r.texto}</Badge>
              </header>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="neutral">
                  {p.tipo === 'atestado' ? (
                    <>
                      <HeartPulse className="size-3" />
                      Afastamento de saúde
                    </>
                  ) : (
                    <>
                      <PauseCircle className="size-3" />
                      Pausa normal
                    </>
                  )}
                </Badge>
                {p.semestral && <Badge variant="brand">semestral</Badge>}
                {p.turma_fixa && <Badge variant="warning">turma fixa</Badge>}
              </div>

              <div className="mt-2.5 rounded-md border border-brand-100 bg-brand-50/60 px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
                  <CalendarClock className="size-3.5" />
                  {fmtData(p.inicio!)} a {fmtData(p.fim!)}
                  <span className="font-normal text-brand-700">
                    · {p.dias_pedidos} {p.dias_pedidos === 1 ? 'dia' : 'dias'}
                  </span>
                </p>
                {p.status === 'ativa' && p.ativada_em && (
                  <p className="mt-0.5 text-[11px] text-brand-700">
                    Pausado desde {fmtData(p.ativada_em)}. O plano volta sozinho no fim do prazo.
                  </p>
                )}
              </div>

              {p.observacao && (
                <p className="mt-2 rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs leading-relaxed text-neutral-700">
                  “{p.observacao}”
                </p>
              )}

              {p.turma_fixa && p.status !== 'solicitada' && (
                <p className="mt-2 text-[11px] leading-snug text-warning-700">
                  A vaga da turma fixa continua reservada — o sistema não libera. Se quiser oferecê-la a
                  outra pessoa, encerre o assento na matrícula.
                </p>
              )}
              {p.semestral && (
                <p className="mt-1 text-[11px] leading-snug text-neutral-400">
                  No semestral, os dias pausados prorrogam o compromisso.
                </p>
              )}

              <p className="mt-2 flex items-center gap-1 text-[11px] text-neutral-400">
                <User className="size-2.5" />
                Pedido em {fmtDataHora(p.solicitada_em!)}
                {p.decisor_nome && ` · decidido por ${p.decisor_nome}`}
              </p>

              {gestao && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                  {p.status === 'solicitada' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => p.id && aprovar.mutate({ id: p.id })}
                        disabled={aprovar.isPending}
                      >
                        Aprovar pausa
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRecusando(p)}
                        className="text-neutral-500 hover:bg-danger-50 hover:text-danger-700"
                      >
                        Recusar
                      </Button>
                    </>
                  )}
                  {p.status === 'ativa' && (
                    <Button size="sm" variant="secondary" onClick={() => setEncerrando(p)}>
                      O aluno voltou
                    </Button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      {recusando && <Recusar pausa={recusando} onFechar={() => setRecusando(null)} />}
      {encerrando && <Encerrar pausa={encerrando} onFechar={() => setEncerrando(null)} />}
    </>
  )
}

function Recusar({ pausa, onFechar }: { pausa: Pausa; onFechar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const recusar = useRecusarPausa()

  return (
    <Modal title="Recusar a pausa" onFechar={onFechar}>
      <p className="text-sm text-neutral-600">
        O plano de <strong className="text-neutral-900">{pausa.cliente_nome}</strong> continua ativo,
        sem nenhuma alteração. O motivo abaixo vai no e-mail que ele recebe.
      </p>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={3}
        placeholder="Ex.: o plano mensal permite uma pausa a cada 6 meses, e a anterior foi em agosto."
        className="mt-3 w-full rounded-md border border-neutral-200 px-2.5 py-2 text-sm outline-none focus:border-brand-500"
      />
      {recusar.isError && (
        <p className="mt-2 text-sm text-danger-600">{(recusar.error as Error).message}</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onFechar}>
          Voltar
        </Button>
        <Button
          variant="danger"
          disabled={motivo.trim() === '' || recusar.isPending}
          onClick={() =>
            pausa.id &&
            recusar.mutate({ id: pausa.id, motivo: motivo.trim() }, { onSuccess: onFechar })
          }
        >
          Recusar pausa
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Retorno antecipado.
 *
 * A data importa: ela define quantos dias a vigência ganha. Quem voltou
 * segunda e só avisou na quarta não deve levar dois dias a mais, então o
 * campo existe em vez de assumir "hoje".
 */
function Encerrar({ pausa, onFechar }: { pausa: Pausa; onFechar: () => void }) {
  const [em, setEm] = useState('')
  const encerrar = useEncerrarPausa()

  return (
    <Modal title="O aluno voltou" onFechar={onFechar}>
      <p className="text-sm text-neutral-600">
        A pausa de <strong className="text-neutral-900">{pausa.cliente_nome}</strong> ia até{' '}
        {fmtData(pausa.fim!)}. Encerrando agora, só os dias efetivamente pausados entram na vigência.
      </p>
      <label className="mt-3 mb-1 block text-xs font-medium text-neutral-500">
        Voltou em (deixe vazio para hoje)
      </label>
      <input
        type="date"
        value={em}
        min={pausa.ativada_em ?? undefined}
        max={pausa.fim ?? undefined}
        onChange={(e) => setEm(e.target.value)}
        className="w-48 rounded-md border border-neutral-200 px-2.5 py-2 text-sm outline-none focus:border-brand-500"
      />
      <p className="mt-2 text-[11px] leading-snug text-neutral-400">
        A vigência do plano e a validade dos créditos ganham esses dias, e o dia de cobrança anda
        junto — é o que faz o aluno não pagar por tempo que não usou.
      </p>
      {encerrar.isError && (
        <p className="mt-2 text-sm text-danger-600">{(encerrar.error as Error).message}</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onFechar}>
          Voltar
        </Button>
        <Button
          disabled={encerrar.isPending}
          onClick={() =>
            pausa.id &&
            encerrar.mutate({ id: pausa.id, em: em || undefined }, { onSuccess: onFechar })
          }
        >
          Retomar o plano
        </Button>
      </div>
    </Modal>
  )
}
