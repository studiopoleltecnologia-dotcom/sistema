import { cn } from '../../../components/ui/cn'
import { corDaCategoria, corModalidade, faixaOcupacao } from '../cores'
import type { Exibicao } from '../exibicao'
import { diaDoMes, dowDe, hojeISO, semanasDoMes } from '../semana'
import { fmtHora, type TurmaComProfessora } from '../types'
import type { OcupacaoTurma } from './GradeSemanal'

const CABECALHO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/**
 * Visão do mês: serve para enxergar padrão (que semana está fraca), não para
 * editar turma. Cada dia mostra as aulas em miniatura com o mesmo código de
 * cor da semana, então a leitura não muda ao trocar de visão — inclusive o
 * "colorir por", que antes era ignorado aqui e sempre desenhava ocupação.
 */
export function GradeMensal({
  turmas,
  ocupacao,
  exibicao,
  mesReferencia,
  diaSelecionado,
  onSelecionarDia,
}: {
  turmas: TurmaComProfessora[]
  ocupacao: Map<string, OcupacaoTurma>
  exibicao: Exibicao
  mesReferencia: string
  diaSelecionado: string
  onSelecionarDia: (dataISO: string) => void
}) {
  const semanas = semanasDoMes(mesReferencia)
  const mesAtual = mesReferencia.slice(0, 7)
  const hoje = hojeISO()

  const doDia = (dataISO: string) =>
    turmas
      .filter((t) => t.dia_semana === dowDe(dataISO))
      .sort((a, b) => a.horario.localeCompare(b.horario))

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
        {CABECALHO.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-neutral-600">
            {d}
          </div>
        ))}
      </div>

      {semanas.map((semana) => (
        <div key={semana[0]} className="grid grid-cols-7 border-b border-neutral-100 last:border-b-0">
          {semana.map((dia) => {
            const foraDoMes = dia.slice(0, 7) !== mesAtual
            const aulas = doDia(dia)
            return (
              <button
                key={dia}
                onClick={() => onSelecionarDia(dia)}
                className={cn(
                  'flex min-h-[6.5rem] flex-col gap-0.5 border-l border-neutral-100 p-1.5 text-left align-top transition first:border-l-0 hover:bg-neutral-50',
                  foraDoMes && 'bg-neutral-50/60',
                  dia === diaSelecionado && 'bg-brand-50 hover:bg-brand-50',
                )}
              >
                <span
                  className={cn(
                    'text-[11px] font-semibold tabular-nums',
                    dia === hoje
                      ? 'text-brand-700'
                      : foraDoMes
                        ? 'text-neutral-300'
                        : 'text-neutral-600',
                  )}
                >
                  {diaDoMes(dia)}
                </span>
                {!foraDoMes &&
                  aulas.slice(0, 3).map((t) => {
                    const oc = ocupacao.get(t.id)
                    const faixa = faixaOcupacao(oc?.reservas ?? 0, oc?.capacidade ?? t.capacidade)
                    const cor =
                      exibicao.colorirPor === 'categoria'
                        ? corDaCategoria(t.categoria)
                        : exibicao.colorirPor === 'modalidade'
                          ? corModalidade(t.modalidade)
                          : exibicao.colorirPor === 'professora'
                            ? corModalidade(t.professora.nome ?? '—')
                            : faixa.cor
                    return (
                      <span
                        key={t.id}
                        className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px]"
                        style={{ background: cor.bg, color: cor.texto }}
                        title={`${fmtHora(t.horario)} ${t.modalidade} — ${oc?.reservas ?? 0}/${oc?.capacidade ?? t.capacidade}`}
                      >
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: faixa.barra }} />
                        <span className="truncate">
                          {fmtHora(t.horario)} {t.modalidade}
                        </span>
                      </span>
                    )
                  })}
                {!foraDoMes && aulas.length > 3 && (
                  <span className="px-1 text-[10px] text-neutral-400">+{aulas.length - 3} aula(s)</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
