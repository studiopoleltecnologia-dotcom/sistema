import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { useAbaUrl } from '../../lib/aba'
import { fmtCentavos, parseCentavos } from '../../lib/dinheiro'
import { useMinhaFuncao } from '../../lib/funcao'
import { AulasCanceladasView } from './components/AulasCanceladasView'
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

/** Todas as abas possíveis; quais aparecem é decidido em tempo de execução. */
const ABAS = ['grade', 'ocupacao', 'canceladas', 'pendencias', 'faltas', 'config'] as const

export function AgendaPage() {
  // Abre na grade: a pergunta mais frequente é "como está a semana", e o dia
  // agora vive ao lado dela, não numa aba concorrente. Guardada na URL
  // (?aba=ocupacao) para o menu lateral conseguir apontar direto para a seção.
  const [aba, setAba] = useAbaUrl(ABAS, 'grade')
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
    // Permanente, ao contrário de Pendências/Faltas: cancelar uma aula é
    // tarefa que a equipe precisa achar num dia normal, não um alerta.
    { value: 'canceladas' as const, label: 'Aulas canceladas' },
    ...(nPendencias > 0 ? [{ value: 'pendencias' as const, label: `Pendências (${nPendencias})` }] : []),
    ...(nSuspensos > 0 ? [{ value: 'faltas' as const, label: `Faltas (${nSuspensos})` }] : []),
    ...(ehGestao ? [{ value: 'config' as const, label: 'Config' }] : []),
  ]

  // Agora que a aba vem da URL, ela pode pedir uma aba que não existe nesta
  // sessão: link para ?aba=config aberto pela secretária, ou ?aba=pendencias
  // depois de a fila ser resolvida. Sem este ajuste a tela ficaria em branco.
  const atual = abas.some((a) => a.value === aba) ? aba : 'grade'

  return (
    <div>
      {/* `mb-4` em vez do `mb-6` padrão: nesta tela a grade é o conteúdo, e
          cada faixa acima dela é altura que a semana perde. */}
      <PageHeader
        titulo="Grade de horários"
        filtros={
          // Grande e na cor da marca: este seletor é a navegação da tela
          // inteira, não um ajuste fino. Em cinza sobre branco ele sumia
          // entre o título e a barra de controles logo abaixo.
          <Tabs value={atual} onChange={setAba} items={abas} size="lg" variant="marca" />
        }
        className="mb-4"
      />

      {atual === 'grade' && <GradeHorarios />}
      {atual === 'ocupacao' && <OcupacaoView />}
      {atual === 'canceladas' && <AulasCanceladasView />}
      {atual === 'pendencias' && <PendenciasView />}
      {atual === 'faltas' && <FaltasView />}
      {atual === 'config' && ehGestao && <ConfigAgendamentoForm />}
    </div>
  )
}

function ConfigAgendamentoForm() {
  const { data: config } = useConfigAgendamento()
  const atualizar = useAtualizarConfigAgendamento()
  const [horas, setHoras] = useState<string | null>(null)
  const [valorWellhub, setValorWellhub] = useState<string | null>(null)
  const [cobranca, setCobranca] = useState<string | null>(null)
  const [avisoCancelamento, setAvisoCancelamento] = useState<string | null>(null)
  const [avisoFimSemestral, setAvisoFimSemestral] = useState<string | null>(null)
  const [validadeReposicao, setValidadeReposicao] = useState<string | null>(null)
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
      dias_antecedencia_cancelamento_plano: num(
        avisoCancelamento,
        config.dias_antecedencia_cancelamento_plano,
      ),
      dias_aviso_fim_compromisso: num(avisoFimSemestral, config.dias_aviso_fim_compromisso),
      dias_validade_credito_aula_cancelada: num(
        validadeReposicao,
        config.dias_validade_credito_aula_cancelada,
      ),
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
        <div>
          {/* O portal calcula a partir daqui a data que o aluno vê em "Meu
              plano" ("solicite até DD/MM") e o banco grava a mesma conta no
              pedido — mudar aqui muda os dois juntos. */}
          <label className={campo}>
            Cancelamento de plano: dias de antecedência da renovação para o pedido impedir aquela
            renovação (regulamento 7.1)
          </label>
          <input
            value={avisoCancelamento ?? String(config.dias_antecedencia_cancelamento_plano)}
            onChange={(e) => setAvisoCancelamento(e.target.value)}
            className={input}
          />
        </div>
        <div>
          {/* Precisa ser maior que o prazo de cancelamento acima, senão o
              aviso chega quando o aluno já não pode mais impedir a virada. */}
          <label className={campo}>
            Fim do semestral: quantos dias antes o aluno recebe o aviso de que o plano vai virar
            mensal (regulamento 7.7)
          </label>
          <input
            value={avisoFimSemestral ?? String(config.dias_aviso_fim_compromisso)}
            onChange={(e) => setAvisoFimSemestral(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className={campo}>
            Aula cancelada pelo estúdio: por quantos dias vale o crédito de reposição da turma fixa
            (regulamento 2.3.10 — nunca vence antes do fim do ciclo do aluno)
          </label>
          <input
            value={validadeReposicao ?? String(config.dias_validade_credito_aula_cancelada)}
            onChange={(e) => setValidadeReposicao(e.target.value)}
            className={input}
          />
        </div>

        <div className="border-t border-neutral-100 pt-4">
          <p className="mb-3 text-xs font-medium text-neutral-500">
            Faltas sem cancelamento (regulamento 4.16)
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
