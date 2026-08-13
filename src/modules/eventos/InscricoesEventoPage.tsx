import { CheckCircle2, Clock, MessageCircle, Ticket, UserPlus, Users } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { KpiCard } from '../../components/ui/KpiCard'
import { fmtDataHora } from '../../lib/datas'
import { fmtCentavos } from '../../lib/dinheiro'
import { useSocias } from '../clientes/hooks/useClientes'
import { useConfirmarPagamento, useInscricoes } from './hooks/useEventos'
import { calcularKpis, type InscricaoEvento } from './types'

/** Só dígitos; celular brasileiro sem país ganha o 55. */
function linkWhatsapp(telefone: string): string | null {
  const d = (telefone || '').replace(/\D/g, '')
  if (!d) return null
  return `https://wa.me/${d.length === 10 || d.length === 11 ? `55${d}` : d}`
}

export function InscricoesEventoPage() {
  const { data: inscricoes, isLoading, error } = useInscricoes()
  const { data: socias } = useSocias()

  if (isLoading) return <p className="text-sm text-neutral-400">Carregando…</p>

  if (error) {
    return (
      <EmptyState
        title="Não foi possível carregar as inscrições"
        description={error instanceof Error ? error.message : 'Tente novamente em instantes.'}
      />
    )
  }

  const lista = inscricoes ?? []
  const kpis = calcularKpis(lista)
  const nomePorId = new Map((socias ?? []).map((s) => [s.id, s.nome]))

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-xl font-bold tracking-tight text-neutral-900">
          Pic Nic Day
        </h1>
        <p className="mt-0.5 text-xs text-neutral-400">
          30 de agosto · inscrições recebidas pela página pública
        </p>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Inscrições" value={String(kpis.total)} icon={Ticket} tone="brand" />
        <KpiCard
          label="Confirmados"
          value={String(kpis.confirmados)}
          icon={CheckCircle2}
          tone="success"
          hint="pagamento validado"
        />
        <KpiCard
          label="Pendentes"
          value={String(kpis.pendentes)}
          icon={Clock}
          tone="warning"
          hint="aguardando comprovante"
        />
        <KpiCard
          label="Acompanhantes"
          value={String(kpis.acompanhantes)}
          icon={UserPlus}
          hint="ingressos dupla"
        />
        <KpiCard
          label="Pessoas esperadas"
          value={String(kpis.pessoasEsperadas)}
          icon={Users}
          tone="brand"
          hint="inscritos + acompanhantes"
        />
      </div>

      <Card className="mb-4" padding="sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-neutral-500">
          <span className="font-medium text-neutral-400">Por tipo de ingresso</span>
          <span>
            Individual <strong className="text-neutral-800">{kpis.porTipo.individual}</strong>
          </span>
          <span>
            Dupla <strong className="text-neutral-800">{kpis.porTipo.dupla}</strong>
          </span>
        </div>
      </Card>

      <Card padding="none">
        <div className="p-5 pb-0">
          <CardHeader
            title="Inscrições"
            subtitle="Quem ainda não pagou aparece primeiro. Confirmar registra seu nome e o horário."
          />
        </div>

        {lista.length === 0 ? (
          <div className="p-5 pt-0">
            <EmptyState
              title="Nenhuma inscrição ainda"
              description="Assim que alguém se inscrever pela página, aparece aqui."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-400">
                  <th className="px-5 py-2 font-medium">Nome</th>
                  <th className="px-5 py-2 font-medium">Contato</th>
                  <th className="px-5 py-2 font-medium">Ingresso</th>
                  <th className="px-5 py-2 font-medium">Valor</th>
                  <th className="px-5 py-2 font-medium">Situação</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => (
                  <Linha key={i.id} inscricao={i} confirmadaPor={nomePorId.get(i.confirmado_por ?? '')} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Linha({
  inscricao: i,
  confirmadaPor,
}: {
  inscricao: InscricaoEvento
  confirmadaPor?: string
}) {
  const confirmar = useConfirmarPagamento()
  const wa = linkWhatsapp(i.telefone)

  function alternar() {
    // Desfazer limpa autor e data — a tabela guarda só o estado atual, então
    // a confirmação anterior não fica registrada em lugar nenhum.
    if (i.pago && !window.confirm(`Desfazer a confirmação de pagamento de ${i.nome}?`)) return
    confirmar.mutate({ id: i.id, confirmado: !i.pago })
  }

  return (
    <tr className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/60">
      <td className="px-5 py-3">
        <div className="font-medium text-neutral-800">{i.nome}</div>
        {i.nome_acompanhante && (
          <div className="text-xs text-neutral-400">com {i.nome_acompanhante}</div>
        )}
        <div className="text-[11px] text-neutral-300">{fmtDataHora(i.criado_em)}</div>
      </td>

      <td className="px-5 py-3">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
          >
            <MessageCircle className="size-3.5" />
            {i.telefone}
          </a>
        ) : (
          <span className="text-xs text-neutral-400">{i.telefone}</span>
        )}
      </td>

      <td className="px-5 py-3">
        <Badge variant={i.tipo_ingresso === 'dupla' ? 'brand' : 'neutral'}>
          {i.tipo_ingresso === 'dupla' ? 'Dupla' : 'Individual'}
        </Badge>
      </td>

      <td className="px-5 py-3 text-neutral-600">{fmtCentavos(i.valor_centavos)}</td>

      <td className="px-5 py-3">
        {i.pago ? (
          <div>
            <Badge variant="success">Confirmado</Badge>
            <div className="mt-0.5 text-[11px] text-neutral-400">
              {confirmadaPor ? `por ${confirmadaPor}` : 'autor não identificado'}
              {i.pago_em && ` · ${fmtDataHora(i.pago_em)}`}
            </div>
          </div>
        ) : (
          <Badge variant="warning">Pendente</Badge>
        )}
      </td>

      <td className="px-5 py-3 text-right">
        <Button
          size="sm"
          variant={i.pago ? 'ghost' : 'primary'}
          loading={confirmar.isPending}
          onClick={alternar}
        >
          {i.pago ? 'Desfazer' : 'Confirmar pagamento'}
        </Button>
      </td>
    </tr>
  )
}
