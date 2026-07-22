import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PartyPopper } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Card, CardHeader } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { requireSupabase } from '../../../lib/supabase'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import type { Entrada } from '../types'

function usePendentesWellhub() {
  return useQuery({
    queryKey: ['wellhub-pendentes'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('entradas_financeiras')
        .select('*')
        .eq('categoria', 'wellhub')
        .eq('status', 'prevista')
        .order('data_competencia')
      if (error) throw error
      return data
    },
  })
}

/**
 * Conciliação do repasse Wellhub (CLAUDE.md 12.6): a sócia pega o valor
 * do relatório no Portal do Parceiro e o sistema distribui entre os
 * check-ins "a reconciliar" do mês, marcando tudo como recebido.
 */
export function WellhubTab() {
  const qc = useQueryClient()
  const { data: pendentes, isLoading } = usePendentesWellhub()

  const meses = useMemo(() => {
    const grupos = new Map<string, Entrada[]>()
    for (const e of pendentes ?? []) {
      const mes = e.data_competencia.slice(0, 7)
      grupos.set(mes, [...(grupos.get(mes) ?? []), e])
    }
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [pendentes])

  const [valores, setValores] = useState<Record<string, string>>({})
  const [datas, setDatas] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  const conciliar = useMutation({
    mutationFn: async (args: { mes: string; valor_centavos: number; data: string }) => {
      const { data, error } = await requireSupabase().rpc('conciliar_wellhub', {
        p_mes: `${args.mes}-01`,
        p_valor_total_centavos: args.valor_centavos,
        p_data_caixa: args.data,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      setErro(null)
      qc.invalidateQueries({ queryKey: ['wellhub-pendentes'] })
      qc.invalidateQueries({ queryKey: ['entradas'] })
      qc.invalidateQueries({ queryKey: ['mei'] })
      qc.invalidateQueries({ queryKey: ['saldo-caixa'] })
    },
    onError: (e) => setErro((e as Error).message),
  })

  const fmtMes = (mes: string) => {
    const [ano, m] = mes.split('-')
    return `${m}/${ano}`
  }

  if (isLoading) return <p className="text-sm text-neutral-400">Carregando…</p>

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-xs text-neutral-400">
        Confira o valor do repasse na aba Financeiro do Portal do Parceiro Wellhub
        (pago todo dia 15, referente ao mês anterior) e concilie aqui: o valor real
        é distribuído entre os check-ins do mês e tudo vira entrada recebida.
      </p>

      {erro && <p className="mb-3 text-sm text-danger-600">{erro}</p>}

      {meses.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title="Nenhum check-in Wellhub a reconciliar"
          description="Tudo em dia por aqui."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {meses.map(([mes, entradas]) => {
            const estimado = entradas.reduce((s, e) => s + e.valor_centavos, 0)
            return (
              <Card key={mes}>
                <CardHeader
                  title={`Competência ${fmtMes(mes)}`}
                  subtitle={`${entradas.length} check-in${entradas.length === 1 ? '' : 's'} · estimado ${fmtCentavos(estimado)}`}
                />

                <ul className="mb-3 flex flex-col gap-1">
                  {entradas.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-xs text-neutral-500">
                      <span className="flex-1 truncate">{e.descricao}</span>
                      <span>{fmtData(e.data_competencia)}</span>
                      <span className="w-20 text-right">{fmtCentavos(e.valor_centavos)}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    value={valores[mes] ?? ''}
                    onChange={(e) => setValores((v) => ({ ...v, [mes]: e.target.value }))}
                    placeholder="R$ valor real do repasse"
                    className="w-44"
                  />
                  <Input
                    type="date"
                    value={datas[mes] ?? new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDatas((d) => ({ ...d, [mes]: e.target.value }))}
                    title="Data em que o repasse caiu na conta"
                    className="w-40"
                  />
                  <Button
                    onClick={() => {
                      const centavos = parseCentavos(valores[mes] ?? '')
                      if (!centavos) return
                      conciliar.mutate({
                        mes,
                        valor_centavos: centavos,
                        data: datas[mes] ?? new Date().toISOString().slice(0, 10),
                      })
                    }}
                    disabled={!parseCentavos(valores[mes] ?? '')}
                    loading={conciliar.isPending}
                  >
                    Conciliar mês
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
