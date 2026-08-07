import { useOcupacao } from '../hooks/useAgenda'
import { DIAS_SEMANA, fmtHora } from '../types'

type Faixa = { label: string; dica: string | null; barra: string; chip: string }

// Ocupação alta é "bom problema" (abrir horário); vazia é o alerta (vermelho).
function faixaDe(pct: number): Faixa {
  if (pct >= 85)
    return {
      label: 'Lotada',
      dica: 'Abrir novo horário',
      barra: 'bg-brand-500',
      chip: 'bg-brand-50 text-brand-700',
    }
  if (pct >= 50)
    return { label: 'Saudável', dica: null, barra: 'bg-success-500', chip: 'bg-success-50 text-success-700' }
  if (pct >= 25)
    return {
      label: 'Morna',
      dica: 'Divulgar o horário',
      barra: 'bg-warning-500',
      chip: 'bg-warning-50 text-warning-700',
    }
  return {
    label: 'Vazia',
    dica: 'Repensar o horário',
    barra: 'bg-danger-500',
    chip: 'bg-danger-50 text-danger-700',
  }
}

export function OcupacaoView() {
  const { data: turmas, isLoading } = useOcupacao()

  if (isLoading) return <p className="text-sm text-neutral-400">Carregando…</p>
  const linhas = turmas ?? []
  if (linhas.length === 0)
    return <p className="text-sm text-neutral-400">Nenhuma turma ativa para analisar.</p>

  const totalReservas = linhas.reduce((s, t) => s + (t.reservas ?? 0), 0)
  const totalVagas = linhas.reduce((s, t) => s + (t.ocorrencias ?? 0) * (t.capacidade ?? 0), 0)
  const ocupacaoGeral = totalVagas > 0 ? Math.round((100 * totalReservas) / totalVagas) : 0
  const lotadas = linhas.filter((t) => (t.ocupacao_pct ?? 0) >= 85).length
  const vazias = linhas.filter((t) => (t.ocupacao_pct ?? 0) < 25).length

  const stat = (valor: string, rotulo: string, cor = 'text-neutral-900') => (
    <div className="rounded-lg border border-neutral-100 bg-white px-4 py-3">
      <div className={`font-display text-xl font-bold ${cor}`}>{valor}</div>
      <div className="text-[11px] text-neutral-400">{rotulo}</div>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-neutral-400">Média das últimas 8 semanas · reservas por aula ÷ capacidade.</p>

      <div className="grid grid-cols-3 gap-3">
        {stat(`${ocupacaoGeral}%`, 'ocupação geral', 'text-brand-700')}
        {stat(String(lotadas), 'turma(s) lotada(s)', lotadas > 0 ? 'text-brand-600' : 'text-neutral-900')}
        {stat(String(vazias), 'turma(s) vazia(s)', vazias > 0 ? 'text-danger-600' : 'text-neutral-900')}
      </div>

      <ul className="flex flex-col gap-2">
        {linhas.map((t) => {
          const pct = t.ocupacao_pct ?? 0
          const f = faixaDe(pct)
          const mediaAula = t.ocorrencias
            ? ((t.reservas ?? 0) / t.ocorrencias).toFixed(1).replace('.', ',')
            : '0'
          return (
            <li key={t.turma_id} className="rounded-lg border border-neutral-100 bg-white p-3.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm font-medium text-neutral-800">
                  {t.modalidade}
                </span>
                <span className="text-xs text-neutral-400">
                  {DIAS_SEMANA[t.dia_semana ?? 0]} · {fmtHora(t.horario ?? '00:00')}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${f.chip}`}>
                  {f.label}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${f.barra}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-neutral-700">
                  {pct}%
                </span>
              </div>

              <div className="mt-1.5 flex items-center justify-between text-[11px] text-neutral-400">
                <span>
                  ~{mediaAula} de {t.capacidade} por aula
                </span>
                {f.dica && <span className="font-medium text-neutral-500">→ {f.dica}</span>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
