import { Card, CardHeader } from '../../../components/ui/Card'
import { useAnaliseModalidade, useAnaliseProfessora, useOcupacaoTendencia } from '../hooks/useAnalises'
import { DIAS_SEMANA, fmtHora } from '../types'

function topN<T>(itens: T[], n: number, chave: (t: T) => number, desc = true) {
  return [...itens].sort((a, b) => (desc ? chave(b) - chave(a) : chave(a) - chave(b))).slice(0, n)
}

function Lista({ titulo, itens }: { titulo: string; itens: { label: string; valor: string }[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-neutral-500">{titulo}</p>
      {itens.length === 0 ? (
        <p className="text-xs text-neutral-400">Sem dado ainda.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {itens.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="w-4 shrink-0 text-xs font-semibold text-neutral-300">{i + 1}</span>
              <span className="flex-1 truncate text-neutral-700">{it.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-neutral-800">{it.valor}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function Rankings() {
  const horarios = useOcupacaoTendencia()
  const modalidades = useAnaliseModalidade()
  const professoras = useAnaliseProfessora()
  const carregando = horarios.isLoading || modalidades.isLoading || professoras.isLoading

  const linhasHorarios = (horarios.data ?? []).filter((t) => (t.ocorrencias_atual ?? 0) > 0)
  const maisProcurados = topN(linhasHorarios, 5, (t) => t.ocupacao_atual_pct ?? 0, true)
  const menosProcurados = topN(linhasHorarios, 5, (t) => t.ocupacao_atual_pct ?? 0, false)

  const linhasModalidade = (modalidades.data ?? []).filter((m) => (m.turmas ?? 0) > 0)
  const modalidadesPopulares = topN(linhasModalidade, 5, (m) => m.ocupacao_atual_pct ?? 0, true)

  const professorasRanking = topN(professoras.data ?? [], 5, (p) => p.ocupacao_atual_pct ?? 0, true)

  // Dias da semana: ocupação ponderada por vaga somando todas as turmas do dia.
  const porDia = new Map<number, { vagas: number; reservas: number }>()
  for (const t of linhasHorarios) {
    const dia = t.dia_semana ?? 0
    const vagas = (t.ocorrencias_atual ?? 0) * (t.capacidade ?? 0)
    const acc = porDia.get(dia) ?? { vagas: 0, reservas: 0 }
    acc.vagas += vagas
    acc.reservas += t.reservas_atual ?? 0
    porDia.set(dia, acc)
  }
  const diasRanking = [...porDia.entries()]
    .map(([dia, v]) => ({ dia, pct: v.vagas > 0 ? Math.round((100 * v.reservas) / v.vagas) : 0 }))
    .sort((a, b) => b.pct - a.pct)

  return (
    <Card>
      <CardHeader title="Rankings" subtitle="Top 5 por ocupação nas últimas 4 semanas" />
      {carregando ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Lista
            titulo="Horários mais procurados"
            itens={maisProcurados.map((t) => ({
              label: `${t.modalidade} · ${DIAS_SEMANA[t.dia_semana ?? 0]} ${fmtHora(t.horario ?? '00:00')}`,
              valor: `${t.ocupacao_atual_pct}%`,
            }))}
          />
          <Lista
            titulo="Horários menos procurados"
            itens={menosProcurados.map((t) => ({
              label: `${t.modalidade} · ${DIAS_SEMANA[t.dia_semana ?? 0]} ${fmtHora(t.horario ?? '00:00')}`,
              valor: `${t.ocupacao_atual_pct}%`,
            }))}
          />
          <Lista
            titulo="Modalidades mais populares"
            itens={modalidadesPopulares.map((m) => ({
              label: m.modalidade ?? '—',
              valor: `${m.ocupacao_atual_pct}%`,
            }))}
          />
          <Lista
            titulo="Professoras por ocupação"
            itens={professorasRanking.map((p) => ({
              label: `${p.professora} · ${p.modalidade}`,
              valor: `${p.ocupacao_atual_pct}%`,
            }))}
          />
          <Lista
            titulo="Dias da semana mais fortes"
            itens={diasRanking.map((d) => ({ label: DIAS_SEMANA[d.dia], valor: `${d.pct}%` }))}
          />
        </div>
      )}
    </Card>
  )
}
