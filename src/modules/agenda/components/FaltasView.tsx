import { fmtData } from '../../../lib/datas'
import { useMinhaFuncao } from '../../../lib/funcao'
import { useConfirmar } from '../../../components/ui/ConfirmarAcao'
import { useAulasSemPresenca, useRevogarSuspensao, useSuspensoes } from '../hooks/useAgenda'

/**
 * Duas listas que existem pelo mesmo motivo: a regra das 3 faltas
 * (regulamento 4.7) só é justa se a equipe conseguir ver o que ela está
 * fazendo e desfazer quando errar.
 *
 * A segunda lista é a contrapartida de uma decisão da etapa 5: falta NÃO
 * é presumida. Aula passada que ninguém marcou não vira falta automática
 * — o que protege a aluna do esquecimento da professora, mas cria um
 * buraco. Sem esta lista o buraco seria invisível.
 */
export function FaltasView() {
  const { data: funcao } = useMinhaFuncao()
  const ehGestao = funcao === 'gestao'
  const { data: suspensoes, isLoading } = useSuspensoes()
  const { data: semPresenca } = useAulasSemPresenca()
  const revogar = useRevogarSuspensao()
  const confirmar = useConfirmar()

  const hoje = new Date().toISOString().slice(0, 10)
  const vigente = (s: { inicio: string; fim: string; revogada_em: string | null }) =>
    s.revogada_em === null && s.inicio <= hoje && s.fim >= hoje

  const lista = suspensoes ?? []
  const vigentes = lista.filter(vigente)
  const encerradas = lista.filter((s) => !vigente(s))

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <section>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">
          Suspensões por falta
        </h2>
        <p className="mb-3 text-xs text-neutral-400">
          Três faltas sem cancelamento no mesmo ciclo pausam o agendamento antecipado por 15
          dias. A aluna continua treinando — reservando no mesmo dia ou pela lista de espera.
        </p>

        {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

        {vigentes.length === 0 && !isLoading && (
          <p className="rounded-md border border-neutral-100 px-3 py-2 text-sm text-neutral-300">
            Ninguém suspenso agora.
          </p>
        )}

        <ul className="flex flex-col gap-1.5">
          {vigentes.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-md border border-warning-100 bg-warning-50/60 px-3 py-2 text-sm"
            >
              <span className="flex-1 font-medium text-neutral-900">
                {s.clientes?.nome ?? '—'}
              </span>
              <span className="text-xs text-warning-700">{s.faltas} faltas</span>
              <span className="text-xs text-neutral-500">até {fmtData(s.fim)}</span>
              {ehGestao && (
                <button
                  onClick={() =>
                    confirmar.pedir({
                      titulo: 'Revogar a suspensão?',
                      tom: 'arquivar',
                      textoConfirmar: 'Revogar',
                      descricao: (
                        <>
                          {s.clientes?.nome ?? 'A aluna'} volta a poder agendar com
                          antecedência na hora. O registro da suspensão continua no
                          histórico — nada é apagado.
                        </>
                      ),
                      aoConfirmar: async () => {
                        await revogar.mutateAsync({ id: s.id, motivo: 'revogada pela equipe' })
                      },
                    })
                  }
                  disabled={revogar.isPending}
                  className="rounded-md px-2 py-0.5 text-xs font-medium text-neutral-500 transition hover:bg-white hover:text-neutral-800 disabled:opacity-40"
                >
                  revogar
                </button>
              )}
            </li>
          ))}
        </ul>

        {encerradas.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-600">
              Histórico ({encerradas.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {encerradas.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-1 text-xs text-neutral-400">
                  <span className="flex-1">{s.clientes?.nome ?? '—'}</span>
                  <span>{s.faltas} faltas</span>
                  <span>
                    {fmtData(s.inicio)} → {fmtData(s.fim)}
                  </span>
                  <span className="text-neutral-300">
                    {s.revogada_em ? 'revogada' : 'cumprida'}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">
          Aulas sem presença marcada
        </h2>
        <p className="mb-3 text-xs text-neutral-400">
          Já aconteceram e ninguém marcou presença nem falta. O sistema{' '}
          <strong className="font-medium text-neutral-500">não presume falta</strong> — então
          estas aulas não contam para a regra acima até alguém marcar.
        </p>

        {(semPresenca ?? []).length === 0 ? (
          <p className="rounded-md border border-neutral-100 px-3 py-2 text-sm text-neutral-300">
            Nada em aberto.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {(semPresenca ?? []).map((a) => (
              <li
                key={a.agendamento_id}
                className="flex items-center gap-3 rounded-md border border-neutral-100 px-3 py-2 text-sm"
              >
                <span className="w-20 shrink-0 text-xs text-neutral-400">{fmtData(a.data)}</span>
                <span className="flex-1 text-neutral-900">{a.cliente_nome}</span>
                <span className="text-xs text-neutral-400">{a.modalidade}</span>
                <span className="text-xs text-neutral-300">{a.horario?.slice(0, 5)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmar.dialogo}
    </div>
  )
}
