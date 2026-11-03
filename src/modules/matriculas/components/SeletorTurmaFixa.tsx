import { useMemo, useState } from 'react'
import { Ban, Check, Search } from 'lucide-react'
import { useTurmasAssentoFixo } from '../hooks/useContratacoes'
import { DIAS_SEMANA, fmtHoraCurta } from '../types'

/**
 * Escolher a turma da grade — não a modalidade.
 *
 * É a diferença que o formato inteiro depende de acertar: "Calistenia"
 * não identifica nada (há três turmas de Calistenia na semana, e
 * contratar uma não dá acesso às outras, regulamento 2.3.4). Por isso o
 * item selecionável é sempre `modalidade · dia · hora · professora`, e
 * o valor devolvido é o `turma_id`.
 *
 * As turmas não elegíveis (Pole e derivadas, Flexibilidade, Treino
 * Livre — 2.3.6) NÃO são escondidas: aparecem riscadas e desabilitadas,
 * com o motivo. Sumir com metade da grade faria a equipe achar que a
 * turma foi arquivada e ir procurar na Agenda; mostrar bloqueado ensina
 * a regra. (No portal do aluno o critério é o oposto, e está comentado
 * lá: para quem só quer escolher um horário, 34 linhas riscadas são um
 * muro, não uma lição.)
 *
 * ⚠️ **A vaga vem do banco.** Esta tela somava os vínculos de
 * `matricula_turmas` por conta própria, e a conta estava incompleta:
 * `validar_assento_fixo()` conta também as reservas por crédito já
 * feitas para a próxima ocorrência da turma. Dava para a equipe ver
 * "3/8" e o banco recusar o assento no clique seguinte. Agora a fonte é
 * `turmas_para_assento_fixo()`, a mesma que valida.
 */
export function SeletorTurmaFixa({
  maximo,
  selecionadas,
  onChange,
  /** Assentos que a matrícula já tem — a turma atual não é opção de novo. */
  jaContratadas = [],
  /** Quem vai assinar, quando se sabe: marca onde essa pessoa já tem assento. */
  clienteId,
}: {
  maximo: number
  selecionadas: string[]
  onChange: (ids: string[]) => void
  jaContratadas?: string[]
  clienteId?: string
}) {
  const { data: turmas, isLoading } = useTurmasAssentoFixo(clienteId)
  const [busca, setBusca] = useState('')

  const porDia = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtradas = (turmas ?? []).filter(
      (t) =>
        termo === '' ||
        t.modalidade.toLowerCase().includes(termo) ||
        (t.professora_nome ?? '').toLowerCase().includes(termo),
    )
    const grupos = new Map<number, typeof filtradas>()
    for (const t of filtradas) {
      grupos.set(t.dia_semana, [...(grupos.get(t.dia_semana) ?? []), t])
    }
    return [...grupos.entries()].sort((a, b) => a[0] - b[0])
  }, [turmas, busca])

  const cheio = selecionadas.length >= maximo

  function alternar(id: string) {
    if (selecionadas.includes(id)) onChange(selecionadas.filter((x) => x !== id))
    else if (!cheio) onChange([...selecionadas, id])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por modalidade ou professora…"
            className="w-full rounded-md border border-neutral-200 py-1.5 pl-8 pr-2 text-sm outline-none transition focus:border-brand-500"
          />
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            cheio ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {selecionadas.length} de {maximo}
        </span>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50/50 p-2">
        {isLoading && (
          <p className="px-1 py-3 text-center text-xs text-neutral-400">Carregando a grade…</p>
        )}
        {!isLoading && porDia.length === 0 && (
          <p className="px-1 py-3 text-center text-xs text-neutral-400">
            Nenhuma turma encontrada.
          </p>
        )}
        {porDia.map(([dia, lista]) => (
          <div key={dia} className="mb-2 last:mb-0">
            <h4 className="sticky top-0 z-10 mb-1 bg-neutral-50/95 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500 backdrop-blur">
              {DIAS_SEMANA[dia]}
            </h4>
            <div className="grid gap-1">
              {lista.map((t) => {
                // `jaContratadas` é desta MATRÍCULA; `ja_contratada` é
                // desta PESSOA (ela pode ter duas matrículas). As duas
                // bloqueiam, por motivos diferentes.
                const jaTem = jaContratadas.includes(t.turma_id)
                const marcada = selecionadas.includes(t.turma_id)
                const bloqueada = jaTem || t.motivo !== null
                const motivo = jaTem ? 'já contratada nesta matrícula' : t.motivo

                return (
                  <button
                    key={t.turma_id}
                    type="button"
                    disabled={bloqueada || (cheio && !marcada)}
                    onClick={() => alternar(t.turma_id)}
                    aria-pressed={marcada}
                    className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition ${
                      marcada
                        ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-300'
                        : bloqueada
                          ? 'cursor-not-allowed border-neutral-200 bg-white/40 opacity-60'
                          : cheio
                            ? 'cursor-not-allowed border-neutral-200 bg-white opacity-50'
                            : 'border-neutral-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
                    }`}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded ${
                        marcada
                          ? 'bg-brand-600 text-white'
                          : bloqueada
                            ? 'text-neutral-300'
                            : 'ring-1 ring-neutral-300'
                      }`}
                    >
                      {marcada ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : bloqueada ? (
                        <Ban className="size-3" />
                      ) : null}
                    </span>

                    <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-neutral-500">
                      {fmtHoraCurta(t.horario)}
                    </span>

                    <span
                      className={`min-w-0 flex-1 truncate font-medium ${
                        !t.elegivel ? 'text-neutral-400 line-through' : 'text-neutral-800'
                      }`}
                    >
                      {t.modalidade}
                    </span>

                    <span className="hidden shrink-0 truncate text-xs text-neutral-400 sm:block">
                      {t.professora_nome ?? '—'}
                    </span>

                    {motivo ? (
                      <span className="shrink-0 text-[10px] font-medium text-neutral-400">
                        {motivo}
                      </span>
                    ) : (
                      <span
                        className="shrink-0 text-[11px] tabular-nums text-neutral-400"
                        title="Lugares ocupados na próxima ocorrência: assento fixo + reserva por crédito"
                      >
                        {t.ocupadas}/{t.capacidade}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-snug text-neutral-400">
        A vaga fica reservada para o aluno enquanto o plano estiver ativo — ela sai da capacidade
        da turma e deixa de ser oferecida para crédito, avulsa, Wellhub e TotalPass.
      </p>
    </div>
  )
}
