import { useMeusPagamentos } from './hooks/usePortalProfessora'
import { useProfessoraAtual } from './ProfessoraContext'
import { fmtDinheiro, fmtMes } from './types'

export function PagamentosPage() {
  const professora = useProfessoraAtual()
  const pagamentos = useMeusPagamentos()

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900">Pagamentos</h1>
      <p className="mb-5 text-sm text-neutral-500">
        {fmtDinheiro(professora.valor_por_aluna_centavos)} por aluno presente.
      </p>

      {pagamentos.isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}
      {pagamentos.isError && (
        <p className="text-sm text-red-600">Não foi possível carregar seus pagamentos.</p>
      )}

      {pagamentos.data && pagamentos.data.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Ainda não há presenças registradas.
        </div>
      )}

      <div className="space-y-3">
        {(pagamentos.data ?? []).map((p) => (
          <div key={p.mes} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium capitalize text-neutral-900">
                {p.mes ? fmtMes(p.mes) : '—'}
              </span>
              <span className="text-base font-semibold text-brand-700">
                {fmtDinheiro(p.total_centavos ?? 0)}
              </span>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-neutral-500">
              <span>{p.aulas ?? 0} aulas</span>
              <span>{p.alunas_presentes ?? 0} alunos presentes</span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs text-neutral-400">
        Valor previsto, calculado pelas presenças registradas. O acerto final é feito com a equipe.
      </p>
    </div>
  )
}
