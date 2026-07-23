import { Copy, Pencil, Trash2 } from 'lucide-react'
import { corModalidade } from '../cores'
import { DIAS_SEMANA, fmtHora, type TurmaComProfessora } from '../types'

// Semana começando na segunda; domingo por último (grade de estúdio).
const DIAS_ORDEM = [1, 2, 3, 4, 5, 6, 0]

const horaDe = (horario: string) => Number(horario.slice(0, 2))

function IconeAcao({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded p-0.5 text-neutral-500 transition hover:bg-white/70 hover:text-neutral-900"
    >
      {children}
    </button>
  )
}

function CartaoTurma({
  turma,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  turma: TurmaComProfessora
  onEditar: (t: TurmaComProfessora) => void
  onDuplicar: (t: TurmaComProfessora) => void
  onExcluir: (t: TurmaComProfessora) => void
}) {
  const cor = corModalidade(turma.modalidade)
  return (
    <div
      className="group rounded-md border px-2 py-1.5"
      style={{ background: cor.bg, borderColor: cor.borda }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold" style={{ color: cor.texto }}>
          {fmtHora(turma.horario)}
        </span>
        {turma.sala && (
          <span className="rounded bg-white/70 px-1 text-[9px] font-medium text-neutral-500">
            {turma.sala.nome}
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-xs font-medium text-neutral-800">{turma.modalidade}</div>
      <div className="truncate text-[10px] text-neutral-500">
        {turma.professora.nome} · {turma.capacidade} vagas
      </div>
      <div className="mt-1 hidden justify-end gap-0.5 group-hover:flex">
        <IconeAcao title="Editar" onClick={() => onEditar(turma)}>
          <Pencil className="size-3" />
        </IconeAcao>
        <IconeAcao title="Duplicar" onClick={() => onDuplicar(turma)}>
          <Copy className="size-3" />
        </IconeAcao>
        <IconeAcao title="Excluir" onClick={() => onExcluir(turma)}>
          <Trash2 className="size-3" />
        </IconeAcao>
      </div>
    </div>
  )
}

export function GradeSemanal({
  turmas,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  turmas: TurmaComProfessora[]
  onEditar: (t: TurmaComProfessora) => void
  onDuplicar: (t: TurmaComProfessora) => void
  onExcluir: (t: TurmaComProfessora) => void
}) {
  if (turmas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 py-16 text-center text-sm text-neutral-400">
        Nenhuma turma cadastrada. Crie a primeira em “Nova turma”.
      </div>
    )
  }

  const horas = turmas.map((t) => horaDe(t.horario))
  const inicio = Math.min(...horas)
  const fim = Math.max(...horas)
  const faixaHoras = Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i)

  const gridCols = `3.5rem repeat(${DIAS_ORDEM.length}, minmax(8.5rem, 1fr))`

  const turmasEm = (dia: number, hora: number) =>
    turmas
      .filter((t) => t.dia_semana === dia && horaDe(t.horario) === hora)
      .sort((a, b) => a.horario.localeCompare(b.horario))

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <div className="min-w-[60rem]">
        {/* Cabeçalho de dias */}
        <div className="grid border-b border-neutral-200 bg-neutral-50" style={{ gridTemplateColumns: gridCols }}>
          <div />
          {DIAS_ORDEM.map((d) => (
            <div
              key={d}
              className="border-l border-neutral-200 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
            >
              {DIAS_SEMANA[d].slice(0, 3)}
            </div>
          ))}
        </div>

        {/* Linhas por hora */}
        {faixaHoras.map((h) => (
          <div
            key={h}
            className="grid border-b border-neutral-100 last:border-b-0"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="py-2 pr-2 text-right text-[11px] font-medium tabular-nums text-neutral-400">
              {String(h).padStart(2, '0')}:00
            </div>
            {DIAS_ORDEM.map((d) => (
              <div
                key={d}
                className="flex min-h-[3.75rem] flex-col gap-1 border-l border-neutral-100 p-1"
              >
                {turmasEm(d, h).map((t) => (
                  <CartaoTurma
                    key={t.id}
                    turma={t}
                    onEditar={onEditar}
                    onDuplicar={onDuplicar}
                    onExcluir={onExcluir}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
