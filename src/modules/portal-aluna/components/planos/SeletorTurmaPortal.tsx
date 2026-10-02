import { useMemo } from 'react'
import { Ban, Check } from 'lucide-react'
import { useTurmasAssentoFixo } from '../../hooks/usePortalAluna'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const hhmm = (h: string) => h.slice(0, 5)

/**
 * Escolher a turma — pelo aluno, no portal.
 *
 * Duas decisões que valem registrar, porque a tela da equipe
 * (`matriculas/SeletorTurmaFixa`) resolve as mesmas duas de outro jeito,
 * de propósito:
 *
 * 1. **A vaga vem do banco, não de uma conta no front.** A fonte é
 *    `turmas_para_assento_fixo()`, que usa a MESMA conta de
 *    `validar_assento_fixo()`. A tela da equipe contava sozinha e
 *    esquecia as reservas por crédito já feitas para a próxima aula —
 *    mostrava vaga onde o banco ia recusar.
 *
 * 2. **Turma não elegível não entra na lista aqui.** Na tela da equipe
 *    ela aparece riscada, e está certo: a equipe precisa aprender a
 *    regra. Para o aluno, 34 das 46 turmas da grade não aceitam turma
 *    fixa (2.3.6) — uma lista com 34 linhas riscadas não é informação, é
 *    um muro. A regra é dita embaixo, nomeando as modalidades de fora,
 *    que é o que ele precisa saber.
 *
 * Turma elegível SEM vaga continua aparecendo, desabilitada: saber que o
 * horário existe e está cheio é diferente de achar que ele não existe.
 */
export function SeletorTurmaPortal({
  maximo,
  selecionadas,
  onChange,
}: {
  maximo: number
  selecionadas: string[]
  onChange: (ids: string[]) => void
}) {
  const { data: turmas, isLoading } = useTurmasAssentoFixo()

  const elegiveis = useMemo(() => (turmas ?? []).filter((t) => t.elegivel), [turmas])

  /** As modalidades que não aceitam turma fixa — para dizer a regra sem listar tudo. */
  const deFora = useMemo(() => {
    const nomes = new Set((turmas ?? []).filter((t) => !t.elegivel).map((t) => t.modalidade))
    return [...nomes].sort()
  }, [turmas])

  const porDia = useMemo(() => {
    const grupos = new Map<number, typeof elegiveis>()
    for (const t of elegiveis) {
      grupos.set(t.dia_semana, [...(grupos.get(t.dia_semana) ?? []), t])
    }
    return [...grupos.entries()].sort((a, b) => a[0] - b[0])
  }, [elegiveis])

  const cheio = selecionadas.length >= maximo

  function alternar(id: string) {
    if (selecionadas.includes(id)) onChange(selecionadas.filter((x) => x !== id))
    else if (!cheio) onChange([...selecionadas, id])
  }

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-neutral-400">Carregando a grade…</p>
  }

  if (elegiveis.length === 0) {
    return (
      <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
        Nenhuma turma está aberta para vaga fixa neste momento. Fale com a gente pelo WhatsApp e
        avisamos assim que abrir.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          {maximo === 1 ? 'Escolha a sua turma' : `Escolha ${maximo} turmas`}
        </h3>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            cheio ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {selecionadas.length} de {maximo}
        </span>
      </div>

      <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50/60 p-2">
        {porDia.map(([dia, lista]) => (
          <div key={dia} className="mb-2 last:mb-0">
            <h4 className="sticky top-0 z-10 mb-1 bg-neutral-50/95 px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500 backdrop-blur">
              {DIAS[dia]}
            </h4>
            <div className="grid gap-1">
              {lista.map((t) => {
                const marcada = selecionadas.includes(t.turma_id)
                const bloqueada = t.motivo !== null
                return (
                  <button
                    key={t.turma_id}
                    type="button"
                    disabled={bloqueada || (cheio && !marcada)}
                    onClick={() => alternar(t.turma_id)}
                    aria-pressed={marcada}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition ${
                      marcada
                        ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-300'
                        : bloqueada
                          ? 'cursor-not-allowed border-neutral-200 bg-white/50 opacity-60'
                          : cheio
                            ? 'cursor-not-allowed border-neutral-200 bg-white opacity-50'
                            : 'border-neutral-200 bg-white hover:border-brand-300'
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

                    <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-neutral-500">
                      {hhmm(t.horario)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-800">
                        {t.modalidade}
                      </span>
                      <span className="block truncate text-xs text-neutral-400">
                        {[t.professora_nome, t.sala_nome].filter(Boolean).join(' · ')}
                      </span>
                    </span>

                    <span className="shrink-0 text-[11px] font-medium text-neutral-400">
                      {t.motivo
                        ? t.motivo
                        : t.vagas === 1
                          ? 'última vaga'
                          : `${t.vagas} vagas`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {deFora.length > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-neutral-400">
          Vaga fixa existe só nas modalidades acima. {deFora.join(', ')} funcionam por crédito, com
          agendamento aula a aula (regulamento 2.3.6).
        </p>
      )}
    </div>
  )
}
