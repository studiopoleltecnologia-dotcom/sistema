import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { useDesativarTurma, useSalas, useTurmas } from '../hooks/useAgenda'
import { DIAS_SEMANA, fmtHora, type TurmaComProfessora } from '../types'
import { GradeSemanal } from './GradeSemanal'
import { TurmaForm, type TurmaInicial } from './TurmaForm'

/** Grade semanal (estilo calendário) + criação/edição de turmas. */
export function GradeView() {
  const { data: turmas, isLoading } = useTurmas()
  const { data: salas } = useSalas()
  const desativar = useDesativarTurma()

  const [form, setForm] = useState<{ inicial: TurmaInicial; turmaId: string | null } | null>(null)

  const novoInicial = (): TurmaInicial => ({
    modalidadeId: '',
    modalidade: '',
    salaId: salas?.[0]?.id ?? '',
    professoraId: '',
    dia: '1',
    horario: '19:00',
    duracao: '60',
    capacidade: '8',
  })

  const deTurma = (t: TurmaComProfessora): TurmaInicial => ({
    modalidadeId: t.modalidade_id ?? '',
    modalidade: t.modalidade,
    salaId: t.sala_id ?? salas?.[0]?.id ?? '',
    professoraId: t.professora_id,
    dia: String(t.dia_semana),
    horario: fmtHora(t.horario),
    duracao: String(t.duracao_minutos),
    capacidade: String(t.capacidade),
  })

  function excluir(t: TurmaComProfessora) {
    const quando = `${DIAS_SEMANA[t.dia_semana]} ${fmtHora(t.horario)}`
    if (window.confirm(`Excluir a turma de ${t.modalidade} (${quando})?`)) {
      desativar.mutate(t.id)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-neutral-400">
          Passe o mouse numa turma para editar, duplicar ou excluir.
        </p>
        <Button onClick={() => setForm({ inicial: novoInicial(), turmaId: null })}>
          <Plus className="size-4" />
          Nova turma
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : (
        <GradeSemanal
          turmas={turmas ?? []}
          onEditar={(t) => setForm({ inicial: deTurma(t), turmaId: t.id })}
          onDuplicar={(t) => setForm({ inicial: deTurma(t), turmaId: null })}
          onExcluir={excluir}
        />
      )}

      {form && (
        <TurmaForm inicial={form.inicial} turmaId={form.turmaId} onFechar={() => setForm(null)} />
      )}
    </div>
  )
}
