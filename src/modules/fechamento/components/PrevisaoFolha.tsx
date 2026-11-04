import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../components/ui/cn'
import { fmtCentavos } from '../../../lib/dinheiro'
import { useProfessoras } from '../../professoras/hooks/useProfessoras'
import { useGerarPrevisaoFolha, usePrevisaoFolha } from '../hooks/useFechamento'

/**
 * Quanto a folha deve custar nos próximos meses.
 *
 * O número sai de uma média ponderada dos até 3 últimos meses aprovados
 * (o mais recente pesa 3, o anterior 2, o terceiro 1), e a tela mostra a
 * conta inteira: quais meses entraram, quanto a professora costuma
 * oscilar e o quanto dá para confiar no resultado.
 *
 * Mostrar a base não é enfeite. Previsão de dinheiro que ninguém consegue
 * refazer não serve para decidir gasto — e metade do quadro aqui tem um
 * mês só de histórico, o que muda completamente como usar o número.
 */
const CONFIANCA: Record<string, { rotulo: string; cls: string; explica: string }> = {
  alta: {
    rotulo: 'Alta',
    cls: 'bg-success-50 text-success-700',
    explica: '3 meses ou mais, com pouca oscilação',
  },
  media: {
    rotulo: 'Média',
    cls: 'bg-warning-50 text-warning-700',
    explica: 'Pouco histórico, ou valor que oscila bastante',
  },
  baixa: {
    rotulo: 'Baixa',
    cls: 'bg-neutral-100 text-neutral-600',
    explica: 'Um mês só de histórico — é o único palpite possível',
  },
}

export function PrevisaoFolha() {
  const { data: previsoes, isLoading } = usePrevisaoFolha()
  const { data: professoras } = useProfessoras()
  const gerar = useGerarPrevisaoFolha()

  const lista = previsoes ?? []
  const total = lista.reduce((s, p) => s + (p.previsto_centavos ?? 0), 0)

  // Professora ativa sem nenhum mês aprovado não entra na conta. Sem este
  // aviso, o total parece a folha inteira quando é a folha de uma parte.
  const comPrevisao = new Set(lista.map((p) => p.professora_id))
  const semHistorico = (professoras ?? []).filter((p) => !comPrevisao.has(p.id))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-neutral-500">Previsão de folha por mês</p>
          <p className="font-display text-2xl font-bold text-neutral-900">{fmtCentavos(total)}</p>
          <p className="mt-1 text-xs text-neutral-400">
            Média ponderada dos últimos 3 meses fechados — o mês mais recente pesa mais. Lançada
            como saída prevista nos próximos 3 meses, vencendo dia 15.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => gerar.mutate(3)}
          loading={gerar.isPending}
        >
          <RefreshCw className="size-3.5" />
          Recalcular
        </Button>
      </div>

      {gerar.isError && (
        <p className="mb-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
          {(gerar.error as Error).message}
        </p>
      )}

      {semHistorico.length > 0 && (
        <div className="mb-4 flex gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-600" />
          <p className="text-xs leading-relaxed text-warning-800">
            <strong>
              {semHistorico.length} professora{semHistorico.length > 1 ? 's' : ''} fora da previsão
            </strong>{' '}
            — {semHistorico.map((p) => p.nome).join(', ')}. Ainda não {semHistorico.length > 1 ? 'têm' : 'tem'}{' '}
            nenhum mês aprovado, então não há de onde prever. O total acima está{' '}
            <strong>abaixo</strong> do custo real enquanto isso.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2.5">Professora</th>
              <th className="px-2 py-2.5 text-right">Previsto/mês</th>
              <th className="px-4 py-2.5">Base do cálculo</th>
              <th className="px-2 py-2.5 text-right">Oscilação</th>
              <th className="px-4 py-2.5">Confiança</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const c = CONFIANCA[p.confianca ?? 'baixa'] ?? CONFIANCA.baixa
              return (
                <tr key={p.professora_id} className="border-b border-neutral-100 last:border-b-0">
                  <td className="px-4 py-2.5 font-medium text-neutral-900">{p.nome}</td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-neutral-900">
                    {fmtCentavos(p.previsto_centavos ?? 0)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-500">
                    {p.meses_considerados} de {p.meses_no_historico} mês
                    {(p.meses_no_historico ?? 0) > 1 ? 'es' : ''} ·{' '}
                    {p.desde === p.ate ? p.desde : `${p.desde} a ${p.ate}`}
                  </td>
                  <td
                    className={cn(
                      'px-2 py-2.5 text-right text-xs tabular-nums',
                      (p.variacao_pct ?? 0) >= 25 ? 'text-warning-700' : 'text-neutral-400',
                    )}
                  >
                    {(p.variacao_pct ?? 0).toFixed(1).replace('.', ',')}%
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', c.cls)}
                      title={c.explica}
                    >
                      {c.rotulo}
                    </span>
                  </td>
                </tr>
              )
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-neutral-300">
                  {isLoading
                    ? 'Carregando…'
                    : 'Nenhum mês aprovado ainda — aprove uma folha para a previsão começar.'}
                </td>
              </tr>
            )}
          </tbody>
          {lista.length > 0 && (
            <tfoot>
              <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold text-neutral-900">
                <td className="px-4 py-2.5">Total por mês</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{fmtCentavos(total)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-neutral-400">
        A previsão vira saída no Financeiro, em <strong>Saídas → Variável</strong>, com
        “· previsão” na descrição. Quando você aprova o fechamento daquele mês, a mesma linha passa
        a valer o valor real — não existem duas. Recalcular não mexe em linha que já virou valor
        real nem em valor que você editou à mão.
      </p>
    </div>
  )
}
