import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ROTULO_MOTIVO_AULA } from '../agenda/types'
import { useAulasCanceladas, useMinhasTurmas } from './hooks/usePortalProfessora'
import { useProfessoraAtual } from './ProfessoraContext'
import {
  diaSemanaDe,
  fmtDataCurta,
  fmtHora,
  hojeISO,
  somarDias,
} from './types'

/** Sete dias a partir de hoje — a professora raramente olha além disso. */
function proximosDias(): string[] {
  const base = hojeISO()
  return Array.from({ length: 7 }, (_, i) => somarDias(base, i))
}

export function AulasPage() {
  const professora = useProfessoraAtual()
  const turmas = useMinhasTurmas()
  const [dia, setDia] = useState(hojeISO)
  const dias = proximosDias()
  const canceladas = useAulasCanceladas(dias[0], dias[dias.length - 1])
  const canceladaDe = (turmaId: string) =>
    (canceladas.data ?? []).find((c) => c.turma_id === turmaId && c.data === dia)

  const doDia = (turmas.data ?? [])
    .filter((t) => t.dia_semana === diaSemanaDe(dia))
    .sort((a, b) => a.horario.localeCompare(b.horario))

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900">Olá, {professora.nome}</h1>
      <p className="mb-5 text-sm text-neutral-500">Suas aulas e a chamada de cada uma.</p>

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {dias.map((d) => (
          <button
            key={d}
            onClick={() => setDia(d)}
            className={`shrink-0 rounded-lg border px-3 py-2 text-xs transition ${
              d === dia
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
            }`}
          >
            {d === hojeISO() ? 'Hoje' : fmtDataCurta(d)}
          </button>
        ))}
      </div>

      {turmas.isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {turmas.isError && (
        <p className="text-sm text-red-600">Não foi possível carregar suas turmas.</p>
      )}

      {turmas.data && doDia.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Nenhuma aula sua neste dia.
        </div>
      )}

      <div className="space-y-3">
        {doDia.map((t) => {
          // Aula cancelada pelo estúdio não tem chamada: os alunos já foram
          // avisados e os créditos devolvidos.
          const cancelada = canceladaDe(t.id)
          if (cancelada) {
            return (
              <div key={t.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 opacity-80">
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-medium text-neutral-500 line-through">{fmtHora(t.horario)}</span>
                  <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-600">
                    cancelada
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-neutral-500">{t.modalidade}</div>
                <div className="mt-2 text-xs text-neutral-400">
                  {ROTULO_MOTIVO_AULA[cancelada.motivo]} · os alunos foram avisados
                </div>
              </div>
            )
          }
          return (
          <Link
            key={t.id}
            to={`aula/${t.id}/${dia}`}
            className="block rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-brand-300"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-base font-medium text-neutral-900">{fmtHora(t.horario)}</span>
              <span className="text-xs text-neutral-400">{t.duracao_minutos} min</span>
            </div>
            <div className="mt-0.5 text-sm text-neutral-600">{t.modalidade}</div>
            <div className="mt-2 text-xs text-neutral-400">
              Até {t.capacidade} alunos · toque para fazer a chamada
            </div>
          </Link>
          )
        })}
      </div>
    </div>
  )
}
