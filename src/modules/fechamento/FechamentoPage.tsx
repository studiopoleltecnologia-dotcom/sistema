import { useMemo, useState } from 'react'
import { fmtCentavos } from '../../lib/dinheiro'
import { cn } from '../../components/ui/cn'
import { useProfessoras } from '../professoras/hooks/useProfessoras'
import { FechamentoDetalhe } from './components/FechamentoDetalhe'
import { useFechamentosMes, useHistorico, usePagamentoMes } from './hooks/useFechamento'

type Vista = 'folha' | 'historico'

const mesAtual = () => {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`
}

const inputCls =
  'rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand-500'

export function FechamentoPage() {
  const [competencia, setCompetencia] = useState(mesAtual)
  const [vista, setVista] = useState<Vista>('folha')
  const [selecionada, setSelecionada] = useState<string | null>(null)

  const { data: professoras } = useProfessoras()
  const { data: pagamentos } = usePagamentoMes(competencia)
  const { data: fechamentos } = useFechamentosMes(competencia)

  const pagamentoPor = useMemo(
    () => new Map((pagamentos ?? []).map((p) => [p.professora_id, p])),
    [pagamentos],
  )
  const fechamentoPor = useMemo(
    () => new Map((fechamentos ?? []).map((f) => [f.professora_id, f])),
    [fechamentos],
  )

  const linhas = (professoras ?? []).map((prof) => {
    const pg = pagamentoPor.get(prof.id)
    const fech = fechamentoPor.get(prof.id)
    const aprovado = fech?.status === 'aprovado'
    const bruto = aprovado ? fech?.bruto_centavos ?? 0 : pg?.total_centavos ?? 0
    const ajustes = (fech?.ajustes ?? []).reduce((s, a) => s + a.valor_centavos, 0)
    return {
      prof,
      aulas: aprovado ? fech?.aulas ?? 0 : pg?.aulas ?? 0,
      horas: aprovado ? Number(fech?.horas ?? 0) : Number(pg?.horas ?? 0),
      alunas: aprovado ? fech?.alunas ?? 0 : pg?.alunas_presentes ?? 0,
      bruto,
      ajustes,
      final: bruto + ajustes,
      aprovado,
      iniciado: !!fech,
    }
  })

  const totalFolha = linhas.reduce((s, l) => s + l.final, 0)
  const profSel = (professoras ?? []).find((p) => p.id === selecionada)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
          {(['folha', 'historico'] as Vista[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm font-medium capitalize transition',
                vista === v ? 'bg-white text-brand-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800',
              )}
            >
              {v === 'folha' ? 'Folha do mês' : 'Histórico'}
            </button>
          ))}
        </div>
        {vista === 'folha' && (
          <input
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className={inputCls}
          />
        )}
      </div>

      {vista === 'folha' ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2.5">Professora</th>
                  <th className="px-2 py-2.5 text-right">Aulas</th>
                  <th className="px-2 py-2.5 text-right">Horas</th>
                  <th className="px-2 py-2.5 text-right">Alunos</th>
                  <th className="px-2 py-2.5 text-right">Bruto</th>
                  <th className="px-2 py-2.5 text-right">Ajustes</th>
                  <th className="px-2 py-2.5 text-right">Final</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr
                    key={l.prof.id}
                    onClick={() => setSelecionada(l.prof.id)}
                    className="cursor-pointer border-b border-neutral-100 transition last:border-b-0 hover:bg-neutral-50"
                  >
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{l.prof.nome}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">{l.aulas}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">{l.horas}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">{l.alunas}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">
                      {fmtCentavos(l.bruto)}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-2.5 text-right tabular-nums',
                        l.ajustes < 0 ? 'text-danger-600' : l.ajustes > 0 ? 'text-success-600' : 'text-neutral-300',
                      )}
                    >
                      {l.ajustes !== 0 ? fmtCentavos(l.ajustes) : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-neutral-900">
                      {fmtCentavos(l.final)}
                    </td>
                    <td className="px-4 py-2.5">
                      {l.aprovado ? (
                        <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-medium text-success-700">
                          Aprovado
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                          {l.iniciado ? 'Aberto' : 'A fechar'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-neutral-300">
                      Nenhuma professora ativa.
                    </td>
                  </tr>
                )}
              </tbody>
              {linhas.length > 0 && (
                <tfoot>
                  <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold text-neutral-900">
                    <td className="px-4 py-2.5" colSpan={6}>
                      Total da folha
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{fmtCentavos(totalFolha)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-3 text-xs text-neutral-400">
            Clique numa professora para ver o detalhe, lançar ajustes e aprovar. Aprovado congela o
            mês; depois é só lançar no Financeiro.
          </p>
        </>
      ) : (
        <Historico />
      )}

      {profSel && (
        <FechamentoDetalhe
          professora={{ id: profSel.id, nome: profSel.nome }}
          competencia={competencia}
          pagamento={pagamentoPor.get(profSel.id)}
          fechamento={fechamentoPor.get(profSel.id)}
          onFechar={() => setSelecionada(null)}
        />
      )}
    </div>
  )
}

function Historico() {
  const { data: professoras } = useProfessoras()
  const [professoraId, setProfessoraId] = useState('')
  const [ano, setAno] = useState('')
  const { data: itens } = useHistorico({
    professoraId: professoraId || undefined,
    ano: ano || undefined,
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={professoraId}
          onChange={(e) => setProfessoraId(e.target.value)}
          className={inputCls}
        >
          <option value="">Todas as professoras</option>
          {(professoras ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <input
          value={ano}
          onChange={(e) => setAno(e.target.value)}
          placeholder="Ano (ex: 2026)"
          className={`${inputCls} w-32`}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2.5">Mês</th>
              <th className="px-4 py-2.5">Professora</th>
              <th className="px-2 py-2.5 text-right">Aulas</th>
              <th className="px-2 py-2.5 text-right">Bruto</th>
              <th className="px-2 py-2.5 text-right">Final</th>
            </tr>
          </thead>
          <tbody>
            {(itens ?? []).map((f) => {
              const ajustes = (f.ajustes ?? []).reduce((s, a) => s + a.valor_centavos, 0)
              const final = (f.bruto_centavos ?? 0) + ajustes
              return (
                <tr key={f.id} className="border-b border-neutral-100 last:border-b-0">
                  <td className="px-4 py-2.5 tabular-nums text-neutral-700">{f.competencia}</td>
                  <td className="px-4 py-2.5 text-neutral-700">{f.professora?.nome ?? '—'}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">
                    {f.aulas ?? 0}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">
                    {fmtCentavos(f.bruto_centavos ?? 0)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-neutral-900">
                    {fmtCentavos(final)}
                  </td>
                </tr>
              )
            })}
            {(itens ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-neutral-300">
                  Nenhum fechamento aprovado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
