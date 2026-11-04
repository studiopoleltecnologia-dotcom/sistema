import { useMemo } from 'react'
import { CalendarClock, Coins, Users } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { CardColapsavel } from '../../../components/ui/CardColapsavel'
import { EmptyState } from '../../../components/ui/EmptyState'
import { KpiCard } from '../../../components/ui/KpiCard'
import { PageHeader } from '../../../components/ui/PageHeader'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos } from '../../../lib/dinheiro'
import { usePrevisaoMensalidades } from '../hooks/useFinanceiro'

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

function nomeDoMes(iso: string) {
  const [ano, mes] = iso.slice(0, 7).split('-').map(Number)
  return `${MESES[mes - 1]} de ${ano}`
}

type Linha = {
  matricula_id: string | null
  cliente: string | null
  ciclo: number | null
  vencimento: string | null
  mes: string | null
  plano: string | null
  valor_centavos: number | null
  cobranca_externa: boolean | null
  status_matricula: string | null
}

/**
 * Previsão de mensalidades — quanto entra de assinatura, e em que dia.
 *
 * ## Por que esta tela existe separada de Entradas
 *
 * O motor de cobrança só cria a entrada prevista do próximo ciclo em
 * D-3 (`config_agendamento.dias_antecedencia_cobranca`). É a decisão
 * certa para cobrar — ninguém quer um link de pagamento emitido com um
 * mês de antecedência —, mas significa que "a receber" nunca mostra o
 * mês que vem. Para planejar, a gestão precisa justamente do que ainda
 * não é cobrança.
 *
 * ## Previsão não é "a receber", e a tela precisa dizer isso
 *
 * `vw_previsao_mensalidades` projeta as renovações sem gravar linha
 * nenhuma, e tira da conta o ciclo que já tem entrada — esse já é
 * receita a receber, e aparece em Entradas. Somar os dois números no
 * Resumo inflaria o saldo do fim do mês, que é exatamente o erro
 * corrigido na revisão da equação do caixa. Por isso a previsão vive
 * aqui, com nome próprio, e não entra no card de saldo.
 *
 * ## O que ela não sabe
 *
 * Projeção supõe que ninguém cancela e ninguém entra. O número do mês
 * 12 é o teto de um cenário em que o quadro de hoje se repete — útil
 * para dimensionar, não para prometer.
 */
export function PrevisaoMensalidadesPage() {
  const { data, isLoading } = usePrevisaoMensalidades()
  const linhas = (data ?? []) as Linha[]

  const porMes = useMemo(() => {
    const mapa = new Map<string, Linha[]>()
    for (const l of linhas) {
      if (!l.mes) continue
      const atual = mapa.get(l.mes) ?? []
      atual.push(l)
      mapa.set(l.mes, atual)
    }
    return [...mapa.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, itens]) => ({
        mes,
        itens: [...itens].sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? '')),
        total: itens.reduce((s, i) => s + (i.valor_centavos ?? 0), 0),
      }))
  }, [linhas])

  // Os próximos 6, que é o horizonte de decisão real do estúdio — os 12
  // existem para o semestral aparecer inteiro, não para somar de enfeite.
  const seisMeses = porMes.slice(0, 6)
  const totalSeis = seisMeses.reduce((s, m) => s + m.total, 0)
  const mediaMes = seisMeses.length > 0 ? Math.round(totalSeis / seisMeses.length) : 0
  const assinaturas = new Set(linhas.map((l) => l.matricula_id)).size
  const externas = new Set(
    linhas.filter((l) => l.cobranca_externa).map((l) => l.matricula_id),
  ).size

  const maior = Math.max(1, ...porMes.map((m) => m.total))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Previsão de mensalidades"
        subtitulo="O que as assinaturas ativas renovam nos próximos 12 meses, e em que dia cada uma cai."
      />

      {isLoading ? (
        <p className="text-sm text-neutral-400">Calculando…</p>
      ) : porMes.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nenhuma assinatura para projetar"
          description="A previsão sai das matrículas ativas que renovam automaticamente. Cadastre os alunos em Matrículas e o mês que vem aparece aqui."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              size="lg"
              label="Próximos 6 meses"
              value={fmtCentavos(totalSeis)}
              icon={Coins}
              tone="success"
              hint="soma das renovações previstas"
            />
            <KpiCard
              size="lg"
              label="Média por mês"
              value={fmtCentavos(mediaMes)}
              icon={CalendarClock}
              hint="no mesmo horizonte de 6 meses"
            />
            <KpiCard
              size="lg"
              label="Assinaturas"
              value={String(assinaturas)}
              icon={Users}
              hint={
                externas > 0
                  ? `${externas} cobrada${externas === 1 ? '' : 's'} fora do sistema`
                  : 'todas cobradas pelo sistema'
              }
            />
          </div>

          {/*
            O aviso fica acima dos números, não abaixo: quem abre a tela
            está prestes a somar isso com o saldo do caixa, e precisa
            saber antes que são coisas diferentes.
          */}
          <p className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3 text-xs leading-relaxed text-neutral-600 shadow-sm">
            <b className="text-neutral-800">Isto é projeção, não "a receber".</b> O ciclo que já
            virou cobrança não aparece aqui — ele está em <b>Entradas</b>, e é ele que entra no
            saldo do Resumo. A conta supõe que ninguém cancela e ninguém novo entra.
          </p>

          <div className="flex flex-col gap-3">
            {porMes.map((m) => (
              <CardColapsavel
                key={m.mes}
                persistKey={`previsao-mes-${m.mes}`}
                defaultOpen={false}
                title={nomeDoMes(m.mes)}
                subtitle={`${m.itens.length} renovaç${m.itens.length === 1 ? 'ão' : 'ões'}`}
                right={
                  <span className="text-sm font-semibold tabular-nums text-neutral-900">
                    {fmtCentavos(m.total)}
                  </span>
                }
              >
                {/* Barra proporcional ao maior mês: o desenho responde
                    "qual mês pesa mais" sem ler doze números. */}
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.round((m.total / maior) * 100)}%` }}
                  />
                </div>

                <ul className="divide-y divide-neutral-100">
                  {m.itens.map((l) => (
                    <li
                      key={`${l.matricula_id}-${l.ciclo}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-800">
                          {l.cliente ?? 'Aluno'}
                        </p>
                        <p className="truncate text-[11px] text-neutral-400">
                          {l.plano ?? 'Plano'} · vence {l.vencimento ? fmtData(l.vencimento) : '—'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {l.cobranca_externa && <Badge variant="neutral">cobrança por fora</Badge>}
                        {l.status_matricula === 'inadimplente' && (
                          <Badge variant="warning">em atraso</Badge>
                        )}
                        <span className="text-sm font-semibold tabular-nums text-neutral-700">
                          {fmtCentavos(l.valor_centavos ?? 0)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardColapsavel>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
