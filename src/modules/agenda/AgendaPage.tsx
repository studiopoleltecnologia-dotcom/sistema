import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { fmtCentavos, parseCentavos } from '../../lib/dinheiro'
import { useMinhaFuncao } from '../../lib/funcao'
import { GradeHorarios } from './components/GradeHorarios'
import { OcupacaoView } from './components/OcupacaoView'
import { PendenciasView } from './components/PendenciasView'
import {
  useAtualizarConfigAgendamento,
  useCheckinsPendentes,
  useConfigAgendamento,
} from './hooks/useAgenda'

export function AgendaPage() {
  // Abre na grade: a pergunta mais frequente é "como está a semana", e o dia
  // agora vive ao lado dela, não numa aba concorrente.
  const [aba, setAba] = useState<'grade' | 'ocupacao' | 'pendencias' | 'config'>('grade')
  // Fila de check-ins sem turma: a aba só aparece quando há o que resolver,
  // para não virar mais um item morto no topo da Agenda.
  const { data: pendencias } = useCheckinsPendentes()
  const nPendencias = pendencias?.length ?? 0
  // Config = regras de agendamento (só gestão). Secretária opera a agenda
  // mas não muda a política; o menu esconde e a RLS recusa a gravação.
  const { data: funcao } = useMinhaFuncao()
  const ehGestao = funcao === 'gestao'

  // Pendências só entra na lista quando há fila — aba morta no topo da
  // Agenda seria mais um item competindo por atenção sem ter o que dizer.
  const abas = [
    { value: 'grade' as const, label: 'Grade' },
    { value: 'ocupacao' as const, label: 'Ocupação' },
    ...(nPendencias > 0 ? [{ value: 'pendencias' as const, label: `Pendências (${nPendencias})` }] : []),
    ...(ehGestao ? [{ value: 'config' as const, label: 'Config' }] : []),
  ]

  return (
    <div>
      <PageHeader
        titulo="Grade de horários"
        filtros={<Tabs value={aba} onChange={setAba} items={abas} />}
      />

      {aba === 'grade' && <GradeHorarios />}
      {aba === 'ocupacao' && <OcupacaoView />}
      {aba === 'pendencias' && <PendenciasView />}
      {aba === 'config' && ehGestao && <ConfigAgendamentoForm />}
    </div>
  )
}

function ConfigAgendamentoForm() {
  const { data: config } = useConfigAgendamento()
  const atualizar = useAtualizarConfigAgendamento()
  const [horas, setHoras] = useState<string | null>(null)
  const [valorWellhub, setValorWellhub] = useState<string | null>(null)

  if (!config) return <p className="text-sm text-neutral-400">Carregando…</p>

  function salvar() {
    if (!config) return
    const valorCent =
      valorWellhub !== null ? parseCentavos(valorWellhub) : config.valor_checkin_wellhub_centavos
    atualizar.mutate({
      horas_cancelamento: horas !== null ? Number(horas) : config.horas_cancelamento,
      valor_checkin_wellhub_centavos: valorCent ?? config.valor_checkin_wellhub_centavos,
    })
  }

  const campo = 'mb-1 block text-xs font-medium text-neutral-500'
  const input =
    'w-40 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500'

  return (
    <div className="max-w-md">
      <div className="flex flex-col gap-4">
        <div>
          <label className={campo}>
            Cancelamento de mensalista: antecedência mínima (horas) para devolver o crédito
          </label>
          <input
            value={horas ?? String(config.horas_cancelamento)}
            onChange={(e) => setHoras(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className={campo}>
            Valor estimado por check-in Wellhub (hoje{' '}
            {fmtCentavos(config.valor_checkin_wellhub_centavos)}) — usado no "a reconciliar"
          </label>
          <input
            value={valorWellhub ?? String(config.valor_checkin_wellhub_centavos / 100)}
            onChange={(e) => setValorWellhub(e.target.value)}
            className={input}
          />
        </div>
        <Button onClick={salvar} loading={atualizar.isPending} className="w-fit">
          Salvar
        </Button>
      </div>
    </div>
  )
}
