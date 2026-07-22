import { useState, type FormEvent } from 'react'
import {
  useCriarTurma,
  useDesativarTurma,
  useNomesProfessoras,
  useTurmas,
} from '../hooks/useAgenda'
import { DIAS_SEMANA, fmtHora } from '../types'

const inputCls =
  'rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500'

/** Grade semanal: turmas por dia + cadastro de nova turma. */
export function GradeView() {
  const { data: turmas, isLoading } = useTurmas()
  const { data: professoras } = useNomesProfessoras()
  const criar = useCriarTurma()
  const desativar = useDesativarTurma()

  const [modalidade, setModalidade] = useState('Pole Dance')
  const [professoraId, setProfessoraId] = useState('')
  const [dia, setDia] = useState('1')
  const [horario, setHorario] = useState('19:00')
  const [capacidade, setCapacidade] = useState('8')

  function adicionar(e: FormEvent) {
    e.preventDefault()
    if (!professoraId) return
    criar.mutate({
      modalidade,
      professora_id: professoraId,
      dia_semana: Number(dia),
      horario,
      capacidade: Number(capacidade),
    })
  }

  return (
    <div>
      <form onSubmit={adicionar} className="mb-5 flex flex-wrap items-end gap-2">
        <input
          value={modalidade}
          onChange={(e) => setModalidade(e.target.value)}
          placeholder="Modalidade"
          className={`${inputCls} w-36`}
        />
        <select
          value={professoraId}
          onChange={(e) => setProfessoraId(e.target.value)}
          required
          className={inputCls}
        >
          <option value="">Professora…</option>
          {(professoras ?? []).map((p) => (
            <option key={p.id} value={p.id ?? ''}>
              {p.nome}
            </option>
          ))}
        </select>
        <select value={dia} onChange={(e) => setDia(e.target.value)} className={inputCls}>
          {DIAS_SEMANA.map((d, i) => (
            <option key={i} value={i}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={horario}
          onChange={(e) => setHorario(e.target.value)}
          className={inputCls}
        />
        <input
          type="number"
          min={1}
          value={capacidade}
          onChange={(e) => setCapacidade(e.target.value)}
          title="Capacidade (vagas)"
          className={`${inputCls} w-16`}
        />
        <button
          type="submit"
          disabled={criar.isPending}
          className="rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          Criar turma
        </button>
      </form>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {DIAS_SEMANA.map((nome, diaSemana) => {
          const doDia = (turmas ?? []).filter((t) => t.dia_semana === diaSemana)
          if (doDia.length === 0) return null
          return (
            <div key={diaSemana} className="rounded-lg border border-neutral-100 p-4">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500">
                {nome.toUpperCase()}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {doDia.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-neutral-900">{fmtHora(t.horario)}</span>
                    <span className="flex-1 truncate text-neutral-600">
                      {t.modalidade} · {t.professora.nome}
                    </span>
                    <span className="text-xs text-neutral-400">{t.capacidade} vagas</span>
                    <button
                      onClick={() => desativar.mutate(t.id)}
                      title="Desativar turma"
                      className="px-1 text-xs text-neutral-300 transition hover:text-red-500"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
