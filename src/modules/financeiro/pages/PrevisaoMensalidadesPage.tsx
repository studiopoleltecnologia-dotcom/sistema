import { useMemo } from 'react'
import { CalendarClock, Coins, RefreshCw, TriangleAlert, Users } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { CardColapsavel } from '../../../components/ui/CardColapsavel'
import { EmptyState } from '../../../components/ui/EmptyState'
import { KpiCard } from '../../../components/ui/KpiCard'
import { PageHeader } from '../../../components/ui/PageHeader'
import { fmtCentavos } from '../../../lib/dinheiro'
import { LinhaPrevisaoEditavel } from '../components/LinhaPrevisao'
import type { LinhaPrevisao } from '../api/previsao'
import {
  usePrevisaoAsaas,
  useSincronizarPrevisao,
  useSyncPrevisao,
} from '../hooks/usePrevisao'

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

function nomeDoMes(ym: string) {
  const [ano, mes] = ym.split('-').map(Number)
  return `${MESES[mes - 1]} de ${ano}`
}

function desdeQuando(iso: string | null) {
  if (!iso) return null
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 2) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `há ${horas}h`
  return `há ${Math.round(horas / 24)} dia(s)`
}

/**
 * Previsão de mensalidades — o que o Asaas vai cobrar, e quando.
 *
 * ## De onde sai o número (mudou em 04/11/2026)
 *
 * Do **gateway**, não das matrículas. A decisão da gestão foi essa:
 * toda cobrança de mensalidade sai do Asaas, então a previsão de
 * receita é a conta dele. São duas coisas somadas:
 *
 *  · **cobrança pendente** — o Asaas já emitiu, com data e valor. Não é
 *    estimativa;
 *  · **ciclo projetado** — o que a assinatura ainda vai gerar depois da
 *    última cobrança emitida. Supõe que ninguém cancela.
 *
 * ## O que ela deliberadamente NÃO mostra
 *
 * Quem paga por fora do gateway (dinheiro, transferência, link avulso)
 * não aparece aqui — nem as matrículas marcadas como `cobranca_externa`.
 * Isso é escolha, não esquecimento: previsão com duas fontes seria dois
 * números discordando. Enquanto a migração para o Asaas não terminar,
 * este total é menor que a receita real, e a tela diz isso em voz alta.
 *
 * ## Por que é editável
 *
 * A gestão sabe coisas que o gateway não sabe: o aluno que avisou que
 * vai sair, o valor combinado à parte, a assinatura que ficou com preço
 * velho lá. Linha editada é respeitada pela sincronização (o cron das
 * 8h não desfaz a correção), e "voltar ao Asaas" devolve a linha ao
 * gateway.
 */
export function PrevisaoMensalidadesPage() {
  const { data, isLoading } = usePrevisaoAsaas()
  const { data: sync } = useSyncPrevisao()
  const sincronizar = useSincronizarPrevisao()

  const linhas = data ?? []
  const visiveis = linhas.filter((l) => !l.oculto)

  const porMes = useMemo(() => {
    const mapa = new Map<string, LinhaPrevisao[]>()
    for (const l of linhas) {
      const atual = mapa.get(l.mes) ?? []
      atual.push(l)
      mapa.set(l.mes, atual)
    }
    return [...mapa.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, itens]) => ({
        mes,
        itens: [...itens].sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
        total: itens
          .filter((i) => !i.oculto)
          .reduce((s, i) => s + i.valor_centavos, 0),
      }))
  }, [linhas])

  // Os próximos 6, que é o horizonte de decisão real do estúdio — os 12
  // existem para o semestral aparecer inteiro, não para somar de enfeite.
  const seisMeses = porMes.slice(0, 6)
  const totalSeis = seisMeses.reduce((s, m) => s + m.total, 0)
  const mediaMes = seisMeses.length > 0 ? Math.round(totalSeis / seisMeses.length) : 0
  const assinantes = new Set(visiveis.map((l) => l.asaas_customer_id)).size
  const semVinculo = visiveis.filter((l) => l.sem_vinculo).length
  const orfas = linhas.filter((l) => l.fora_do_gateway).length
  const maior = Math.max(1, ...porMes.map((m) => m.total))

  const erroSync = sincronizar.error instanceof Error ? sincronizar.error.message : null
  const nunca = !sync?.ultima_em

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Previsão de mensalidades"
        subtitulo="O que o Asaas vai cobrar nos próximos 12 meses, e em que dia cada cobrança cai."
        acoes={
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-neutral-400 sm:inline">
              {nunca ? 'nunca sincronizada' : `atualizada ${desdeQuando(sync!.ultima_em)}`}
            </span>
            <Button
              variant="secondary"
              onClick={() => sincronizar.mutate()}
              loading={sincronizar.isPending}
            >
              <RefreshCw className="size-4" />
              Atualizar do Asaas
            </Button>
          </div>
        }
      />

      {erroSync && (
        <p className="rounded-lg border border-danger-100 bg-danger-50/60 px-3 py-2 text-sm text-danger-700">
          Não deu para falar com o Asaas: {erroSync}. A previsão que está na tela continua sendo a
          da última sincronização.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-neutral-400">Carregando…</p>
      ) : porMes.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={nunca ? 'Previsão ainda não sincronizada' : 'Nada previsto no gateway'}
          description={
            nunca
              ? 'A previsão vem das assinaturas do Asaas. Clique em "Atualizar do Asaas" — se o ambiente não tiver a chave configurada, a mensagem de erro vai dizer isso.'
              : 'O Asaas não tem assinatura ativa nem cobrança pendente a vencer. Quem paga por fora do gateway não aparece aqui, por decisão: a previsão é a conta do Asaas.'
          }
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
              hint="o que o Asaas deve cobrar"
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
              label="Assinantes no gateway"
              value={String(assinantes)}
              icon={Users}
              hint={
                semVinculo > 0
                  ? `${semVinculo} linha(s) sem aluno vinculado`
                  : 'todos vinculados ao cadastro'
              }
            />
          </div>

          {/*
            O aviso fica acima dos números porque quem abre a tela está
            prestes a somar isto com o caixa — e porque o total exclui,
            de propósito, quem paga fora do Asaas. Um número menor que a
            realidade precisa dizer por que é menor.
          */}
          <p className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3 text-xs leading-relaxed text-neutral-600 shadow-sm">
            <b className="text-neutral-800">Esta é a conta do Asaas, não o "a receber".</b> O ciclo
            que já virou dinheiro não aparece aqui — ele está em <b>Entradas</b>, e é ele que entra
            no saldo do Resumo. Quem paga <b>por fora do gateway</b> também não aparece: enquanto a
            migração não terminar, a receita real é maior que esta previsão.
          </p>

          {orfas > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-warning-100 bg-warning-50/60 px-3 py-2 text-sm text-warning-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                {orfas} linha(s) editada(s) já não existem mais no Asaas (cobrança paga, assinatura
                cancelada ou vencimento remarcado). Ficaram para você conferir — "voltar ao Asaas"
                remove.
              </span>
            </p>
          )}

          <div className="flex flex-col gap-3">
            {porMes.map((m) => (
              <CardColapsavel
                key={m.mes}
                persistKey={`previsao-mes-${m.mes}`}
                defaultOpen={false}
                title={nomeDoMes(m.mes)}
                subtitle={`${m.itens.length} cobrança${m.itens.length === 1 ? '' : 's'}`}
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
                    <LinhaPrevisaoEditavel key={l.id} l={l} />
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
