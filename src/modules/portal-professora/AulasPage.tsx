import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMinhasTurmas } from './hooks/usePortalProfessora'
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

  const doDia = (turmas.data ?? [])
    .filter((t) => t.dia_semana === diaSemanaDe(dia))
    .sort((a, b) => a.horario.localeCompare(b.horario))

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900">Olá, {professora.nome}</h1>
      <p className="mb-5 text-sm text-neutral-500">Suas aulas e a chamada de cada uma.</p>

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {proximosDias().map((d) => (
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
        {doDia.map((t) => (
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
        ))}
      </div>
    </div>
  )
}
