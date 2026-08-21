import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { fmtCentavos, parseCentavos } from '../../lib/dinheiro'
import { useMinhaFuncao } from '../../lib/funcao'
import { GradeHorarios } from './components/GradeHorarios'
import { OcupacaoView } from './components/OcupacaoView'
import { PendenciasView } from './components/PendenciasView'
import { FaltasView } from './components/FaltasView'
import {
  useAtualizarConfigAgendamento,
  useCheckinsPendentes,
  useConfigAgendamento,
  useSuspensoes,
} from './hooks/useAgenda'

export function AgendaPage() {
  // Abre na grade: a pergunta mais frequente é "como está a semana", e o dia
  // agora vive ao lado dela, não numa aba concorrente.
  const [aba, setAba] = useState<'grade' | 'ocupacao' | 'pendencias' | 'faltas' | 'config'>(
    'grade',
  )
  // Fila de check-ins sem turma: a aba só aparece quando há o que resolver,
  // para não virar mais um item morto no topo da Agenda.
  const { data: pendencias } = useCheckinsPendentes()
  const nPendencias = pendencias?.length ?? 0
  // Config = regras de agendamento (só gestão). Secretária opera a agenda
  // mas não muda a política; o menu esconde e a RLS recusa a gravação.
  const { data: funcao } = useMinhaFuncao()
  const ehGestao = funcao === 'gestao'
  // Mesma regra da aba de pendências: só aparece quando há suspensão
  // vigente. Aba permanente aqui seria um rótulo acusatório no topo da
  // Agenda em todo dia normal.
  const { data: suspensoes } = useSuspensoes()
  const hoje = new Date().toISOString().slice(0, 10)
  const nSuspensos = (suspensoes ?? []).filter(
    (s) => s.revogada_em === null && s.inicio <= hoje && s.fim >= hoje,
  ).length

  // Pendências só entra na lista quando há fila — aba morta no topo da
  // Agenda seria mais um item competindo por atenção sem ter o que dizer.
  const abas = [
    { value: 'grade' as const, label: 'Grade' },
    { value: 'ocupacao' as const, label: 'Ocupação' },
    ...(nPendencias > 0 ? [{ value: 'pendencias' as const, label: `Pendências (${nPendencias})` }] : []),
    ...(nSuspensos > 0 ? [{ value: 'faltas' as const, label: `Faltas (${nSuspensos})` }] : []),
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
      {aba === 'faltas' && <FaltasView />}
      {aba === 'config' && ehGestao && <ConfigAgendamentoForm />}
    </div>
  )
}

function ConfigAgendamentoForm() {
  const { data: config } = useConfigAgendamento()
  const atualizar = useAtualizarConfigAgendamento()
  const [horas, setHoras] = useState<string | null>(null)
  const [valorWellhub, setValorWellhub] = useState<string | null>(null)
  const [cobranca, setCobranca] = useState<string | null>(null)
  const [faltas, setFaltas] = useState<string | null>(null)
  const [diasSusp, setDiasSusp] = useState<string | null>(null)
  const [tolerancia, setTolerancia] = useState<string | null>(null)

  if (!config) return <p className="text-sm text-neutral-400">Carregando…</p>

  function salvar() {
    if (!config) return
    const valorCent =
      valorWellhub !== null ? parseCentavos(valorWellhub) : config.valor_checkin_wellhub_centavos
    const num = (v: string | null, atual: number) => (v !== null && v !== '' ? Number(v) : atual)
    atualizar.mutate({
      horas_cancelamento: num(horas, config.horas_cancelamento),
      valor_checkin_wellhub_centavos: valorCent ?? config.valor_checkin_wellhub_centavos,
      dias_antecedencia_cobranca: num(cobranca, config.dias_antecedencia_cobranca),
      faltas_para_suspensao: num(faltas, config.faltas_para_suspensao),
      dias_suspensao_faltas: num(diasSusp, config.dias_suspensao_faltas),
      minutos_tolerancia_atraso: num(tolerancia, config.minutos_tolerancia_atraso),
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
        <div>
          <label className={campo}>
            Cobrança do próximo ciclo: quantos dias antes do vencimento ela é gerada
          </label>
          <input
            value={cobranca ?? String(config.dias_antecedencia_cobranca)}
            onChange={(e) => setCobranca(e.target.value)}
            className={input}
          />
        </div>

        <div className="border-t border-neutral-100 pt-4">
          <p className="mb-3 text-xs font-medium text-neutral-500">
            Faltas sem cancelamento (regulamento 4.7)
          </p>
          <div className="flex flex-col gap-4">
            <div>
              <label className={campo}>Quantas faltas no mesmo ciclo suspendem</label>
              <input
                value={faltas ?? String(config.faltas_para_suspensao)}
                onChange={(e) => setFaltas(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className={campo}>Por quantos dias o agendamento antecipado fica pausado</label>
              <input
                value={diasSusp ?? String(config.dias_suspensao_faltas)}
                onChange={(e) => setDiasSusp(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className={campo}>
                Tolerância de atraso (minutos) — mostrada para a aluna e para a professora
              </label>
              <input
                value={tolerancia ?? String(config.minutos_tolerancia_atraso)}
                onChange={(e) => setTolerancia(e.target.value)}
                className={input}
              />
              {/* Honestidade na tela: quem aplica a tolerância é a
                  professora na porta, olhando o aquecimento. O sistema
                  guarda o número, não bloqueia a entrada. */}
              <p className="mt-1 text-[11px] text-neutral-400">
                O sistema não bloqueia a entrada por atraso — quem decide é a professora.
              </p>
            </div>
          </div>
        </div>

        <Button onClick={salvar} loading={atualizar.isPending} className="w-fit">
          Salvar
        </Button>
      </div>
    </div>
  )
}
