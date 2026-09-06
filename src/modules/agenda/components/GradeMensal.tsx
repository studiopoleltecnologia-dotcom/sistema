import { cn } from '../../../components/ui/cn'
import { corDaTurma, corModalidade, faixaOcupacao } from '../cores'
import type { Exibicao } from '../exibicao'
import { diaDoMes, dowDe, hojeISO, semanasDoMes } from '../semana'
import { fmtHora, type TurmaComProfessora } from '../types'
import type { OcupacaoTurma } from './GradeSemanal'

// Espelha `diasDaSemana`, que começa no domingo. Se um dia divergir do
// outro, o mês desenha a aula na coluna errada — e em silêncio.
const CABECALHO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

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
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-white">
        {CABECALHO.map((d) => (
          <div
            key={d}
            className="py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-neutral-500"
          >
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
                  'flex min-h-[6.5rem] min-w-0 flex-col gap-0.5 border-l border-neutral-100 p-1.5 text-left align-top transition first:border-l-0 hover:bg-neutral-50',
                  foraDoMes ? 'bg-neutral-100/50' : 'bg-white',
                  dia === diaSelecionado && 'bg-brand-50 hover:bg-brand-50',
                )}
              >
                <span
                  className={cn(
                    'mb-0.5 flex h-5 min-w-5 items-center justify-center self-start rounded-full px-1 text-[11px] font-bold tabular-nums',
                    dia === hoje
                      ? 'bg-brand-700 text-white'
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
                      exibicao.colorirPor === 'modalidade'
                        ? corModalidade(t.modalidade)
                        : exibicao.colorirPor === 'professora'
                          ? corModalidade(t.professora.nome ?? '—')
                          : exibicao.colorirPor === 'ocupacao'
                            ? {
                                bg: faixa.pastilha,
                                borda: faixa.trilho,
                                texto: '#3f3f46',
                                acento: faixa.barra,
                              }
                            : corDaTurma(t)
                    return (
                      <span
                        key={t.id}
                        className="flex items-center gap-1 truncate rounded border-l-2 px-1 py-0.5 text-[10px]"
                        style={{
                          background: cor.bg,
                          color: cor.texto,
                          borderLeftColor: cor.acento,
                        }}
                        title={`${fmtHora(t.horario)} ${t.modalidade} — ${oc?.reservas ?? 0}/${oc?.capacidade ?? t.capacidade} (${faixa.label})`}
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
