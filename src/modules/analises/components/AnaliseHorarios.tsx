import { useMemo, useState } from 'react'
import { CalendarClock, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardHeader } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useOcupacaoTendencia } from '../hooks/useAnalises'
import { DIAS_SEMANA, fmtHora, labelTendencia } from '../types'

function faixaTendencia(t: string | null) {
  if (t === 'crescendo') return { Icone: TrendingUp, cls: 'text-success-600' }
  if (t === 'caindo') return { Icone: TrendingDown, cls: 'text-danger-600' }
  return { Icone: Minus, cls: 'text-neutral-400' }
}

const selectCls =
  'rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 outline-none transition focus:border-brand-500'

export function AnaliseHorarios({ destaqueId }: { destaqueId: string | null }) {
  const { data, isLoading } = useOcupacaoTendencia()
  const todas = data ?? []
  const [modalidade, setModalidade] = useState('')
  const [diaSemana, setDiaSemana] = useState('')

  const modalidades = useMemo(
    () => [...new Set(todas.map((t) => t.modalidade).filter((m): m is string => !!m))].sort(),
    [todas],
  )
  const linhas = todas.filter(
    (t) =>
      (!modalidade || t.modalidade === modalidade) &&
      (!diaSemana || String(t.dia_semana) === diaSemana),
  )

  const totalReservas = linhas.reduce((s, t) => s + (t.reservas_atual ?? 0), 0)
  const totalVagas = linhas.reduce((s, t) => s + (t.ocorrencias_atual ?? 0) * (t.capacidade ?? 0), 0)
  const ocupacaoGeral = totalVagas > 0 ? Math.round((100 * totalReservas) / totalVagas) : 0
  const lotadas = linhas.filter((t) => (t.ocupacao_atual_pct ?? 0) >= 85).length
  const criticas = linhas.filter(
    (t) =>
      t.tendencia !== 'insuficiente' &&
      (t.ocupacao_atual_pct ?? 0) < 40 &&
      (t.ocupacao_anterior_pct ?? 0) < 40,
  ).length

  const stat = (valor: string, rotulo: string, cor = 'text-neutral-900') => (
    <div className="rounded-lg border border-neutral-100 bg-white px-4 py-3">
      <div className={`font-display text-xl font-bold ${cor}`}>{valor}</div>
      <div className="text-[11px] text-neutral-400">{rotulo}</div>
    </div>
  )

  return (
    <Card>
      <CardHeader
        title="Horários"
        subtitle="Ocupação das últimas 4 semanas vs. as 4 anteriores, por turma"
        action={
          todas.length > 0 && (
            <div className="flex gap-2">
              <select
                value={modalidade}
                onChange={(e) => setModalidade(e.target.value)}
                className={selectCls}
              >
                <option value="">Toda modalidade</option>
                {modalidades.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={diaSemana}
                onChange={(e) => setDiaSemana(e.target.value)}
                className={selectCls}
              >
                <option value="">Todo dia</option>
                {DIAS_SEMANA.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )
        }
      />
      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : todas.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nenhuma turma ativa para analisar." />
      ) : linhas.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nenhum horário bate com esse filtro." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {stat(`${ocupacaoGeral}%`, 'ocupação geral')}
            {stat(
              String(lotadas),
              'horário(s) lotado(s)',
              lotadas > 0 ? 'text-brand-600' : 'text-neutral-900',
            )}
            {stat(
              String(criticas),
              'horário(s) crítico(s)',
              criticas > 0 ? 'text-danger-600' : 'text-neutral-900',
            )}
          </div>

          <ul className="flex flex-col gap-2">
            {linhas.map((t) => {
              const pct = t.ocupacao_atual_pct ?? 0
              const insuficiente = t.tendencia === 'insuficiente'
              const { Icone, cls } = faixaTendencia(t.tendencia)
              const destacada = destaqueId === t.turma_id
              return (
                <li
                  key={t.turma_id}
                  id={`turma-${t.turma_id}`}
                  className={`rounded-lg border p-3.5 transition ${
                    destacada ? 'border-brand-400 ring-2 ring-brand-100' : 'border-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-medium text-neutral-800">
                      {t.modalidade}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {DIAS_SEMANA[t.dia_semana ?? 0]} · {fmtHora(t.horario ?? '00:00')}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className={`h-full rounded-full ${
                          pct >= 85 ? 'bg-brand-500' : pct < 40 ? 'bg-danger-500' : 'bg-success-500'
                        }`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-neutral-700">
                      {pct}%
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
                    {insuficiente ? (
                      <span>Dados insuficientes ainda</span>
                    ) : (
                      <>
                        <Icone className={`size-3 ${cls}`} />
                        <span className={cls}>{labelTendencia(t.tendencia)}</span>
                        <span>· era {t.ocupacao_anterior_pct}% há 4 semanas</span>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}
