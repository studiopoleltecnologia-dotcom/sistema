import { Copy, Pencil, Trash2 } from 'lucide-react'
import { cn } from '../../../components/ui/cn'
import { corDaCategoria, corModalidade, faixaOcupacao, type CorCartao } from '../cores'
import { ALTURA_FAIXA, type Exibicao } from '../exibicao'
import { diaDoMes, diasDaSemana, dowDe, hojeISO } from '../semana'
import { DIAS_SEMANA, fmtHora, type SalaNome, type TurmaComProfessora } from '../types'

export type OcupacaoTurma = { reservas: number; capacidade: number }

const horaDe = (horario: string) => Number(horario.slice(0, 2))

/**
 * Grade da semana. Duas mudanças de fundo em relação à versão anterior:
 *
 * 1. **Cor por ocupação, não por modalidade.** Antes eram 8 pastéis
 *    sorteados pelo hash do nome da modalidade — bonito e mudo: não dizia
 *    nada sobre a aula estar vazia. Agora é uma escala sequencial só.
 * 2. **Uma coluna por sala dentro de cada dia**, para duas aulas no mesmo
 *    horário em salas diferentes deixarem de se empilhar. Só divide quando
 *    há mais de uma sala ativa — com uma sala, dobrar as colunas seria
 *    espremer a grade à toa.
 */
export function GradeSemanal({
  turmas,
  salas,
  ocupacao,
  exibicao,
  diaSelecionado,
  onSelecionarDia,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  turmas: TurmaComProfessora[]
  salas: SalaNome[]
  /** turma_id → reservas/capacidade da semana exibida. */
  ocupacao: Map<string, OcupacaoTurma>
  exibicao: Exibicao
  diaSelecionado: string
  onSelecionarDia: (dataISO: string) => void
  onEditar: (t: TurmaComProfessora) => void
  onDuplicar: (t: TurmaComProfessora) => void
  onExcluir: (t: TurmaComProfessora) => void
}) {
  const dias = diasDaSemana(diaSelecionado).filter(
    (d) => exibicao.mostrarFimDeSemana || (dowDe(d) !== 0 && dowDe(d) !== 6),
  )

  // Divide por sala só quando há mais de uma — e ignora salas sem turma
  // nenhuma na semana, para não criar coluna morta.
  const salasComTurma = salas.filter((s) => turmas.some((t) => t.sala_id === s.id))
  const dividirPorSala = salasComTurma.length > 1
  const colunasSala: (SalaNome | null)[] = dividirPorSala ? salasComTurma : [null]

  if (turmas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
        Nenhuma turma cadastrada. Crie a primeira em “Nova turma”.
      </div>
    )
  }

  const horas = turmas.map((t) => horaDe(t.horario))
  const inicio = Math.min(...horas)
  const fim = Math.max(...horas)
  const passo = exibicao.intervalo === 30 ? 0.5 : 1
  const faixas: number[] = []
  for (let h = inicio; h <= fim; h += passo) faixas.push(h)

  const larguraCol = dividirPorSala ? '7rem' : '9.5rem'
  const gridCols = `3.25rem repeat(${dias.length * colunasSala.length}, minmax(${larguraCol}, 1fr))`
  const alturaFaixa = ALTURA_FAIXA[exibicao.espacamento] * (passo === 0.5 ? 0.6 : 1)
  const hoje = hojeISO()

  const turmasEm = (dataISO: string, faixa: number, salaId: string | null) =>
    turmas
      .filter((t) => {
        if (t.dia_semana !== dowDe(dataISO)) return false
        if (salaId && t.sala_id !== salaId) return false
        const h = horaDe(t.horario)
        const min = Number(t.horario.slice(3, 5))
        const pos = h + (passo === 0.5 && min >= 30 ? 0.5 : 0)
        return passo === 0.5 ? pos === faixa : h === Math.floor(faixa)
      })
      .sort((a, b) => a.horario.localeCompare(b.horario))

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <div style={{ minWidth: dividirPorSala ? '72rem' : '56rem' }}>
        {/* Cabeçalho: dia e, abaixo, as salas */}
        <div
          className="sticky top-0 z-10 grid border-b border-neutral-200 bg-neutral-50"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div />
          {dias.map((d) =>
            colunasSala.map((sala, i) => (
              <button
                key={`${d}-${sala?.id ?? 'única'}`}
                onClick={() => onSelecionarDia(d)}
                className={cn(
                  'border-l border-neutral-200 py-2 text-center transition hover:bg-neutral-100',
                  d === diaSelecionado && 'bg-brand-50',
                )}
              >
                {i === 0 && (
                  <div
                    className={cn(
                      'text-[11px] font-bold uppercase tracking-wide',
                      d === hoje ? 'text-brand-700' : 'text-neutral-600',
                    )}
                  >
                    {DIAS_SEMANA[dowDe(d)].slice(0, 3)} {diaDoMes(d)}
                  </div>
                )}
                {dividirPorSala && (
                  <div className="truncate px-1 text-[10px] text-neutral-500">{sala?.nome}</div>
                )}
              </button>
            )),
          )}
        </div>

        {faixas.map((faixa) => (
          <div
            key={faixa}
            className="grid border-b border-neutral-100 last:border-b-0"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="py-1.5 pr-2 text-right text-[11px] font-medium tabular-nums text-neutral-400">
              {String(Math.floor(faixa)).padStart(2, '0')}:{faixa % 1 ? '30' : '00'}
            </div>
            {dias.map((d) =>
              colunasSala.map((sala) => (
                <div
                  key={`${d}-${sala?.id ?? 'única'}-${faixa}`}
                  className={cn(
                    'flex flex-col gap-1 border-l border-neutral-100 p-1',
                    d === diaSelecionado && 'bg-brand-50/40',
                  )}
                  style={{ minHeight: alturaFaixa }}
                >
                  {turmasEm(d, faixa, sala?.id ?? null).map((t) => (
                    <CartaoTurma
                      key={t.id}
                      turma={t}
                      ocupacao={ocupacao.get(t.id)}
                      exibicao={exibicao}
                      mostrarSala={!dividirPorSala}
                      onEditar={onEditar}
                      onDuplicar={onDuplicar}
                      onExcluir={onExcluir}
                    />
                  ))}
                </div>
              )),
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CartaoTurma({
  turma,
  ocupacao,
  exibicao,
  mostrarSala,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  turma: TurmaComProfessora
  ocupacao?: OcupacaoTurma
  exibicao: Exibicao
  mostrarSala: boolean
  onEditar: (t: TurmaComProfessora) => void
  onDuplicar: (t: TurmaComProfessora) => void
  onExcluir: (t: TurmaComProfessora) => void
}) {
  const reservas = ocupacao?.reservas ?? 0
  const capacidade = ocupacao?.capacidade ?? turma.capacidade
  const faixa = faixaOcupacao(reservas, capacidade)

  let cor: CorCartao = faixa.cor
  if (exibicao.colorirPor === 'categoria') cor = corDaCategoria(turma.categoria)
  else if (exibicao.colorirPor === 'modalidade') cor = corModalidade(turma.modalidade)
  else if (exibicao.colorirPor === 'professora') cor = corModalidade(turma.professora.nome ?? '—')

  const pct = capacidade > 0 ? Math.min((reservas / capacidade) * 100, 100) : 0
  const compacto = exibicao.espacamento === 'compacto'

  return (
    <div
      className="group rounded-md border px-1.5 py-1"
      style={{ background: cor.bg, borderColor: cor.borda }}
      title={[
        turma.modalidade,
        turma.categoria?.nome,
        fmtHora(turma.horario),
        `${reservas}/${capacidade} — ${faixa.label}`,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[11px] font-bold" style={{ color: cor.texto }}>
          {fmtHora(turma.horario)}
        </span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: cor.texto }}>
          {reservas}/{capacidade}
        </span>
      </div>
      <div className="truncate text-xs font-medium text-neutral-800">{turma.modalidade}</div>

      {/* Professora na cor da categoria, modalidade em tinta escura — é a
          hierarquia da grade impressa, onde a cor identifica o grupo e o
          nome da aula continua sendo o que se lê primeiro. */}
      {!compacto && (
        <div className="truncate text-[10px]" style={{ color: cor.texto }}>
          {turma.professora.nome}
          {mostrarSala && turma.sala && ` · ${turma.sala.nome}`}
        </div>
      )}

      {/* Barra de preenchimento: repete a informação sem depender da cor. */}
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/70">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(pct, reservas > 0 ? 6 : 0)}%`, background: faixa.barra }}
        />
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
