import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PartyPopper, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Card, CardHeader } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Input } from '../../../components/ui/Input'
import { requireSupabase } from '../../../lib/supabase'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos, parseCentavos } from '../../../lib/dinheiro'
import { mesAtual } from '../periodo'
import type { Entrada } from '../types'
import { PlanosWellhub } from './PlanosWellhub'
import { ImportarRepasseWellhub } from './ImportarRepasseWellhub'

/**
 * Conciliação do repasse Wellhub (CLAUDE.md §12.6).
 *
 * ## As duas previsões, que não se somam
 *
 * A tela mostrava um número só, "estimado", e chamava de **check-in**
 * toda entrada `wellhub` + `prevista` do mês. Isso misturava coisas de
 * naturezas diferentes:
 *
 *  · **check-in a reconciliar** — uma linha por visita, criada pela
 *    integração e valorizada pelo plano do assinante. Previsão
 *    *derivada*;
 *  · **previsão do repasse** — uma linha por competência, digitada pela
 *    gestão ("acho que dezembro fecha em R$ 3.360"). Previsão
 *    *declarada*, e hoje a única que existe de fato, porque a
 *    integração ainda não alimenta presença em produção.
 *
 * São duas estimativas do MESMO dinheiro. Somá-las conta duas vezes —
 * era o que acontecia, e por isso duas tentativas de prever dezembro
 * viravam "2 check-ins · estimado R$ 6.720".
 *
 * ## O que o fechamento faz com cada uma
 *
 * Com check-ins no mês, o repasse real se distribui entre eles e a
 * previsão declarada é cancelada. Sem check-ins, a própria previsão
 * declarada vira a entrada recebida com o valor real.
 */

type Competencia = {
  competencia: string
  check_ins: number
  checkins_centavos: number
  previsao_centavos: number
  linhas_previsao: number
  previsao_vence_em: string | null
}

function useCompetencias() {
  return useQuery({
    queryKey: ['wellhub-competencias'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('vw_wellhub_competencias')
        .select('*')
        .order('competencia')
      if (error) throw error
      return (data ?? []) as unknown as Competencia[]
    },
  })
}

/** As linhas de check-in, para o detalhe de cada competência. */
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

const fmtMes = (mes: string) => {
  const [ano, m] = mes.split('-')
  return `${m}/${ano}`
}

/** Dia 15 do mês seguinte à competência — a regra de repasse deles. */
function venceEm(competencia: string) {
  const [ano, mes] = competencia.split('-').map(Number)
  return new Date(ano, mes, 15).toISOString().slice(0, 10)
}

export function WellhubTab() {
  const qc = useQueryClient()
  const { data: competencias, isLoading } = useCompetencias()
  const { data: pendentes } = usePendentesWellhub()

  const checkinsPorMes = useMemo(() => {
    const mapa = new Map<string, Entrada[]>()
    for (const e of pendentes ?? []) {
      if (!e.presenca_id) continue // previsão declarada não é check-in
      const mes = e.data_competencia.slice(0, 7)
      mapa.set(mes, [...(mapa.get(mes) ?? []), e])
    }
    return mapa
  }, [pendentes])

  const [valores, setValores] = useState<Record<string, string>>({})
  const [datas, setDatas] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [acerto, setAcerto] = useState<Acerto | null>(null)

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['wellhub-pendentes'] })
    qc.invalidateQueries({ queryKey: ['wellhub-competencias'] })
    qc.invalidateQueries({ queryKey: ['entradas'] })
    qc.invalidateQueries({ queryKey: ['mei'] })
    qc.invalidateQueries({ queryKey: ['saldo-caixa'] })
  }

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
    onSuccess: (resultado) => {
      setErro(null)
      setAcerto(resultado as unknown as Acerto)
      invalidar()
    },
    onError: (e) => setErro((e as Error).message),
  })

  const prever = useMutation({
    mutationFn: async (args: { mes: string; valor_centavos: number }) => {
      const { error } = await requireSupabase().rpc('prever_repasse_wellhub', {
        p_mes: `${args.mes}-01`,
        p_valor_centavos: args.valor_centavos,
        p_data_prevista: null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setErro(null)
      invalidar()
    },
    onError: (e) => setErro((e as Error).message),
  })

  const removerPrevisao = useMutation({
    mutationFn: async (mes: string) => {
      const { error } = await requireSupabase().rpc('remover_previsao_repasse_wellhub', {
        p_mes: `${mes}-01`,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setErro(null)
      invalidar()
    },
    onError: (e) => setErro((e as Error).message),
  })

  if (isLoading) return <p className="text-sm text-neutral-400">Carregando…</p>

  const lista = competencias ?? []

  return (
    <div className="max-w-3xl">
      {/* A importação do relatório vem primeiro: ela é o caminho certo
          desde que o relatório de setembro mostrou que o valor por
          check-in não é previsível — varia no tempo, e só o arquivo
          deles sabe. A conciliação por total, abaixo, ficou como saída
          para quando não houver o detalhe. */}
      <ImportarRepasseWellhub />

      <PlanosWellhub />

      <PreverRepasse
        onPrever={(mes, centavos) => prever.mutate({ mes, valor_centavos: centavos })}
        salvando={prever.isPending}
      />

      <p className="mb-4 text-xs leading-relaxed text-neutral-400">
        <b className="text-neutral-600">Previsão</b> é o que você espera receber;{' '}
        <b className="text-neutral-600">check-ins</b> são as visitas já registradas, cada uma
        valorizada pelo plano da aluna. São duas estimativas do mesmo dinheiro, por isso aparecem
        separadas e não somadas. <b className="text-neutral-600">Conciliar</b> fecha o mês com o
        valor real do relatório do Portal do Parceiro (pago todo dia 15, referente ao mês
        anterior): havendo check-ins, o real é distribuído entre eles e a previsão é cancelada;
        não havendo, a própria previsão vira a entrada recebida.
      </p>

      {erro && <p className="mb-3 text-sm text-danger-600">{erro}</p>}

      {acerto && <ResultadoDoAcerto acerto={acerto} onFechar={() => setAcerto(null)} />}

      {lista.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title="Nenhuma competência Wellhub em aberto"
          description="Não há check-in a reconciliar nem previsão lançada. Use o campo acima para estimar um mês."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {lista.map((c) => {
            const checkins = checkinsPorMes.get(c.competencia) ?? []
            const total = c.check_ins > 0 ? c.checkins_centavos : c.previsao_centavos
            return (
              <Card key={c.competencia}>
                <CardHeader
                  title={`Competência ${fmtMes(c.competencia)}`}
                  subtitle={
                    c.check_ins > 0
                      ? `${c.check_ins} check-in${c.check_ins === 1 ? '' : 's'} · ${fmtCentavos(c.checkins_centavos)}`
                      : 'sem check-in registrado'
                  }
                />

                {/* A previsão declarada, com nome próprio. Antes ela se
                    disfarçava de check-in na lista abaixo. */}
                {c.previsao_centavos > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-xs">
                    <span className="font-medium text-brand-700">Previsão lançada</span>
                    <span className="font-semibold tabular-nums text-brand-800">
                      {fmtCentavos(c.previsao_centavos)}
                    </span>
                    {c.previsao_vence_em && (
                      <span className="text-neutral-400">
                        a receber em {fmtData(c.previsao_vence_em)}
                      </span>
                    )}
                    {c.linhas_previsao > 1 && (
                      <span className="rounded-full bg-warning-50 px-2 py-0.5 text-warning-700">
                        {c.linhas_previsao} linhas — salve a previsão de novo para consolidar
                      </span>
                    )}
                    {c.check_ins > 0 && (
                      <span className="text-neutral-400">
                        · não soma com os check-ins: é o mesmo dinheiro
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removerPrevisao.mutate(c.competencia)}
                      title="Remover a previsão deste mês"
                      className="ml-auto rounded p-1 text-neutral-300 transition hover:text-danger-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}

                {checkins.length > 0 && (
                  <ul className="mb-3 flex flex-col gap-1">
                    {/* Com a integração no ar isto vira centenas de linhas:
                        mostra as primeiras e conta o resto. */}
                    {checkins.slice(0, 8).map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-xs text-neutral-500">
                        <span className="flex-1 truncate">{e.descricao}</span>
                        <span>{fmtData(e.data_competencia)}</span>
                        <span className="w-20 text-right">{fmtCentavos(e.valor_centavos)}</span>
                      </li>
                    ))}
                    {checkins.length > 8 && (
                      <li className="text-xs text-neutral-400">
                        + {checkins.length - 8} check-in(s)
                      </li>
                    )}
                  </ul>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    value={valores[c.competencia] ?? ''}
                    onChange={(e) =>
                      setValores((v) => ({ ...v, [c.competencia]: e.target.value }))
                    }
                    placeholder="R$ valor real do repasse"
                    className="w-44"
                  />
                  <Input
                    type="date"
                    value={datas[c.competencia] ?? new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDatas((d) => ({ ...d, [c.competencia]: e.target.value }))}
                    title="Data em que o repasse caiu na conta"
                    className="w-40"
                  />
                  <Button
                    onClick={() => {
                      const centavos = parseCentavos(valores[c.competencia] ?? '')
                      if (!centavos) return
                      conciliar.mutate({
                        mes: c.competencia,
                        valor_centavos: centavos,
                        data: datas[c.competencia] ?? new Date().toISOString().slice(0, 10),
                      })
                    }}
                    disabled={!parseCentavos(valores[c.competencia] ?? '')}
                    loading={conciliar.isPending}
                  >
                    Conciliar mês
                  </Button>
                  <span className="text-xs text-neutral-400">
                    fecha {fmtCentavos(total)} em previsão
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Lançar a previsão de um mês que ainda não tem nada.
 *
 * Precisa existir separado da lista porque a lista só mostra
 * competências que JÁ têm linha — e o problema era justamente não haver
 * porta de entrada para o primeiro valor de um mês futuro. O default é
 * o mês seguinte: prever o mês corrente é o caso raro.
 */
function PreverRepasse({
  onPrever,
  salvando,
}: {
  onPrever: (mes: string, centavos: number) => void
  salvando: boolean
}) {
  const proximo = useMemo(() => {
    const [ano, mes] = mesAtual().split('-').map(Number)
    const d = new Date(ano, mes, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])
  const [mes, setMes] = useState(proximo)
  const [valor, setValor] = useState('')
  const centavos = parseCentavos(valor)

  return (
    <Card className="mb-4">
      <CardHeader
        title="Prever o repasse de um mês"
        subtitle="Entra no fluxo de caixa como a receber, e é substituída pelo valor real na conciliação"
      />
      <div className="flex flex-wrap items-end gap-2">
        <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-40" />
        <Input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="R$ previsto no mês"
          className="w-44"
        />
        <Button
          variant="secondary"
          disabled={!centavos || !mes}
          loading={salvando}
          onClick={() => {
            if (!centavos || !mes) return
            onPrever(mes, centavos)
            setValor('')
          }}
        >
          Salvar previsão
        </Button>
        {mes && (
          <span className="text-xs text-neutral-400">a receber em {fmtData(venceEm(mes))}</span>
        )}
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        Um valor por mês: salvar de novo corrige o que já estava lá, em vez de criar outra linha.
      </p>
    </Card>
  )
}

/** O que `conciliar_wellhub()` devolve depois de fechar a competência. */
type Acerto = {
  modo?: 'check_ins' | 'previsao_declarada'
  check_ins: number
  previsto_centavos: number
  real_centavos: number
  diferenca_centavos: number
  previsoes_canceladas?: number
  por_plano: { plano: string; check_ins: number; previsto_centavos: number }[]
}

/**
 * Previsto × real, logo depois de conciliar.
 *
 * A gestão foi direta sobre por que isto precisa existir: *"isso pode
 * mudar/alterar... a construção do sistema não pode ser 100% baseada em
 * cima disso"*. A tabela de preços por plano é um palpite; o relatório
 * do Portal é o que aconteceu. A diferença entre os dois é a única forma
 * de saber que o palpite envelheceu — e ela só aparece neste momento,
 * porque depois do acerto a competência some da tela.
 */
function ResultadoDoAcerto({ acerto, onFechar }: { acerto: Acerto; onFechar: () => void }) {
  const dif = acerto.diferenca_centavos
  // 2% de folga: repasse nunca bate ao centavo (primeira visita, teto de
  // visitas no mês, ajuste deles). Abaixo disso não é notícia.
  const relevante = acerto.previsto_centavos > 0
    && Math.abs(dif) > acerto.previsto_centavos * 0.02

  return (
    <Card className="mb-4 border-brand-200 bg-brand-50/40">
      <CardHeader
        title="Competência fechada"
        subtitle={
          acerto.modo === 'previsao_declarada'
            ? 'sem check-in registrado — a previsão lançada virou a entrada recebida'
            : `${acerto.check_ins} check-in${acerto.check_ins === 1 ? '' : 's'} conciliados`
        }
        action={
          <Button size="sm" variant="ghost" onClick={onFechar}>
            Fechar
          </Button>
        }
      />
      <div className="flex flex-wrap gap-6 text-sm">
        <span>
          <span className="block text-xs text-neutral-500">Previsto</span>
          <strong className="text-neutral-800">{fmtCentavos(acerto.previsto_centavos)}</strong>
        </span>
        <span>
          <span className="block text-xs text-neutral-500">Repasse real</span>
          <strong className="text-neutral-900">{fmtCentavos(acerto.real_centavos)}</strong>
        </span>
        <span>
          <span className="block text-xs text-neutral-500">Diferença</span>
          <strong className={dif < 0 ? 'text-danger-700' : 'text-success-700'}>
            {dif > 0 ? '+' : ''}
            {fmtCentavos(dif)}
          </strong>
        </span>
      </div>

      {!!acerto.previsoes_canceladas && acerto.previsoes_canceladas > 0 && (
        <p className="mt-3 text-xs text-neutral-500">
          {acerto.previsoes_canceladas} previsão(ões) deste mês foram canceladas — o dinheiro real
          já está lançado, e deixá-las abertas contaria duas vezes.
        </p>
      )}

      {acerto.por_plano.length > 0 && (
        <ul className="mt-3 flex flex-col gap-0.5 border-t border-brand-100 pt-2">
          {acerto.por_plano.map((p) => (
            <li key={p.plano} className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="flex-1 truncate">{p.plano}</span>
              <span>{p.check_ins} check-in{p.check_ins === 1 ? '' : 's'}</span>
              <span className="w-24 text-right">{fmtCentavos(p.previsto_centavos)}</span>
            </li>
          ))}
        </ul>
      )}

      {relevante && (
        <p className="mt-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-relaxed text-warning-800">
          O repasse ficou {dif < 0 ? 'abaixo' : 'acima'} da previsão em{' '}
          <strong>{fmtCentavos(Math.abs(dif))}</strong>. Pode ser só a primeira visita de quem veio
          pela primeira vez (que não é paga) ou o teto de visitas do mês — mas se a diferença se
          repetir, vale conferir o valor de cada plano na tabela acima.
        </p>
      )}
    </Card>
  )
}
