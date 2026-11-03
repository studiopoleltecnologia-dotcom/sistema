import { useState } from 'react'
import { CalendarClock, Phone, UserPlus, Users } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { fmtData, fmtDataHora } from '../../../lib/datas'
import { useConfirmarConvidado, useRecusarConvidado } from '../hooks/useConvidados'
import type { Convidado } from '../api/convidados'

const ROTULO: Record<string, { texto: string; variante: 'warning' | 'brand' | 'neutral' }> = {
  solicitado: { texto: 'esperando confirmação', variante: 'warning' },
  confirmado: { texto: 'confirmado · vaga reservada', variante: 'brand' },
}

/**
 * A fila de convidados do semestral (regulamento 11.1).
 *
 * O sistema já conferiu tudo o que é conferível: plano ativo do
 * convidado, carência de 6 meses, benefício do ciclo, turma certa no dia
 * e se o titular está mesmo naquela aula. **O que sobra para a pessoa
 * decidir é nível e segurança** — por isso o cartão mostra o que ajuda
 * nessa decisão e nada mais:
 *
 * * **a vaga** da aula, porque "depende de vaga" é condição do benefício
 *   e descobrir a turma lotada pelo erro do banco seria descobrir depois
 *   de já ter prometido;
 * * **o que o titular contou** sobre a pessoa, que costuma ser a única
 *   informação de nível que existe;
 * * **se ela já passou pelo estúdio**, que muda a conversa (ex-aluna é
 *   outro assunto, e é retorno, não primeira visita).
 *
 * Recusar NÃO gasta o benefício do aluno: ele pode indicar outra pessoa
 * no mesmo ciclo. É por isso que recusar por nível é seguro.
 */
export function FilaConvidados({
  convidados,
  podeDecidir,
}: {
  convidados: Convidado[]
  podeDecidir: boolean
}) {
  const [recusando, setRecusando] = useState<Convidado | null>(null)
  const confirmar = useConfirmarConvidado()
  const [erro, setErro] = useState<string | null>(null)

  if (convidados.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-400">
        Nenhum convidado indicado ou confirmado.
      </p>
    )
  }

  return (
    <>
      {!podeDecidir && (
        <p className="text-sm text-neutral-500">
          Quem confirma o convidado é a operação. A lista está aqui para você saber quem vai chegar.
        </p>
      )}

      {erro && <p className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{erro}</p>}

      <div className="grid gap-3 xl:grid-cols-2">
        {convidados.map((c) => {
          const r = ROTULO[c.status ?? ''] ?? { texto: c.status ?? '', variante: 'neutral' as const }
          return (
            <article
              key={c.id}
              className="rounded-lg border border-neutral-200/80 bg-white p-3.5 shadow-sm"
            >
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="flex items-center gap-1.5 font-display text-sm font-bold text-neutral-900">
                    <UserPlus className="size-3.5 text-brand-500" />
                    {c.convidado_nome}
                  </h4>
                  <p className="mt-0.5 text-sm text-neutral-600">
                    convidado de {c.titular_nome} · {c.plano_nome}
                  </p>
                </div>
                <Badge variant={r.variante}>{r.texto}</Badge>
              </header>

              <div className="mt-2.5 rounded-md border border-brand-100 bg-brand-50/60 px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
                  <CalendarClock className="size-3.5" />
                  {c.turma_rotulo} · {fmtData(c.data!)}
                </p>
                {/* A view calcula a vaga sempre (aula sem ninguém = turma
                    livre inteira); o `!== null` é só para o tipo gerado,
                    que marca toda coluna de view como anulável. */}
                {c.vagas !== null && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-brand-700">
                    <Users className="size-3" />
                    {c.vagas === 0
                      ? 'Turma lotada — não há vaga para o convidado'
                      : `${c.vagas} de ${c.capacidade} vagas livres`}
                  </p>
                )}
              </div>

              <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-600">
                <Phone className="size-3" />
                {c.convidado_telefone || 'sem telefone'}
                {c.convidado_email && ` · ${c.convidado_email}`}
              </p>

              {c.observacao && (
                <p className="mt-2 rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs leading-relaxed text-neutral-700">
                  “{c.observacao}”
                </p>
              )}

              {c.convidado_ultima_aula ? (
                <p className="mt-2 text-[11px] leading-snug text-warning-700">
                  Esta pessoa já treinou aqui — última aula em {fmtData(c.convidado_ultima_aula)}.
                </p>
              ) : (
                <p className="mt-2 text-[11px] leading-snug text-neutral-400">
                  Primeira vez no estúdio. Entra no funil como quem fez experimental.
                </p>
              )}

              <p className="mt-2 text-[11px] text-neutral-400">
                Indicado em {fmtDataHora(c.solicitada_em!)}
                {c.decisor_nome && ` · decidido por ${c.decisor_nome}`}
              </p>

              {podeDecidir && c.status === 'solicitado' && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                  <Button
                    size="sm"
                    onClick={() => {
                      setErro(null)
                      if (!c.id) return
                      confirmar.mutate(c.id, {
                        onError: (e) => setErro((e as Error).message),
                      })
                    }}
                    disabled={confirmar.isPending || c.vagas === 0}
                  >
                    Confirmar convidado
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRecusando(c)}
                    className="text-neutral-500 hover:bg-danger-50 hover:text-danger-700"
                  >
                    Recusar
                  </Button>
                </div>
              )}

              {c.status === 'confirmado' && (
                <p className="mt-2 border-t border-neutral-100 pt-2 text-[11px] leading-snug text-neutral-500">
                  A vaga está reservada no nome dela e ela aparece na chamada da professora. A
                  presença é o que encerra o convite.
                </p>
              )}
            </article>
          )
        })}
      </div>

      {recusando && <Recusar convidado={recusando} onFechar={() => setRecusando(null)} />}
    </>
  )
}

/**
 * Recusar com motivo obrigatório.
 *
 * O motivo vai no e-mail do titular, e é a parte que faz o "não" não
 * soar arbitrário — "é uma turma de Pole 2, e a primeira aula dela
 * precisa ser numa Pole 1" é uma recusa que vende a próxima.
 */
function Recusar({ convidado: c, onFechar }: { convidado: Convidado; onFechar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const recusar = useRecusarConvidado()

  return (
    <Modal title="Recusar o convidado" onFechar={onFechar}>
      <p className="text-sm text-neutral-600">
        <strong className="text-neutral-900">{c.titular_nome}</strong> continua com o convidado
        deste ciclo disponível — recusar não gasta o benefício. O motivo abaixo vai no e-mail.
      </p>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={3}
        placeholder="Ex.: essa turma é de Pole 2 e a primeira aula precisa ser numa Pole 1 — temos vaga na quarta às 19h."
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
            c.id && recusar.mutate({ id: c.id, motivo: motivo.trim() }, { onSuccess: onFechar })
          }
        >
          Recusar convidado
        </Button>
      </div>
    </Modal>
  )
}
