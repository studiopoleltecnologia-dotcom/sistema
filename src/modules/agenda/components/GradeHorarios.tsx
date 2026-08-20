import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Tabs } from '../../../components/ui/Tabs'
import { cn } from '../../../components/ui/cn'
import {
  useCategorias,
  useDesativarTurma,
  useOcupacaoPeriodo,
  useSalas,
  useTurmas,
} from '../hooks/useAgenda'
import { useExibicao } from '../exibicao'
import {
  fimMesExclusivo,
  hojeISO,
  inicioMes,
  inicioSemana,
  rotuloMes,
  rotuloSemana,
  semanasDoMes,
  somarDias,
} from '../semana'
import { DIAS_SEMANA, fmtHora, type TurmaComProfessora } from '../types'
import { useConfirmar } from '../../../components/ui/ConfirmarAcao'
import { CategoriasModal } from './CategoriasModal'
import { ConfigExibicao } from './ConfigExibicao'
import { DiaView } from './DiaView'
import { LegendaCategorias } from './LegendaCategorias'
import { GradeMensal } from './GradeMensal'
import { GradeSemanal, type OcupacaoTurma } from './GradeSemanal'
import { TurmaForm, type TurmaInicial } from './TurmaForm'

type Visao = 'semana' | 'mes'

const DIAS_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/**
 * Tela inicial da Grade de horários: a grade (semana ou mês) e, ao lado, o
 * dia selecionado. Antes eram duas abas irmãs — "Dia" e "Grade" —, então
 * conferir quem está agendado numa aula exigia trocar de aba e perder a
 * visão do todo.
 *
 * A ocupação exibida é a REAL do período visível (fn_ocupacao_turma), não a
 * média histórica: a pergunta aqui é "como está esta semana", e a média das
 * 8 semanas continua nas Análises.
 */
export function GradeHorarios() {
  const [visao, setVisao] = useState<Visao>('semana')
  const [dia, setDia] = useState(hojeISO())
  const [exibicao, alterarExibicao] = useExibicao()
  const [configAberta, setConfigAberta] = useState(false)
  const [categoriasAbertas, setCategoriasAbertas] = useState(false)
  const [form, setForm] = useState<{ inicial: TurmaInicial; turmaId: string | null } | null>(null)

  const { data: turmas, isLoading } = useTurmas()
  const { data: salas } = useSalas()
  const { data: categorias } = useCategorias()
  const desativar = useDesativarTurma()
  const confirmar = useConfirmar()

  // Janela consultada = exatamente o que está na tela. No mês, pega as
  // semanas completas que a grade desenha, senão os dias das bordas (que
  // vêm do mês vizinho) apareceriam sem reserva nenhuma.
  const [inicio, fim] = useMemo(() => {
    if (visao === 'semana') {
      const ini = inicioSemana(dia)
      return [ini, somarDias(ini, 7)]
    }
    const semanas = semanasDoMes(dia)
    return [semanas[0][0], somarDias(semanas[semanas.length - 1][6], 1)]
  }, [visao, dia])

  const { data: ocupacaoLinhas } = useOcupacaoPeriodo(inicio, fim)

  // No mês a janela cobre várias ocorrências da mesma turma; divido pelo
  // número de ocorrências para o cartão continuar lendo "média por aula" em
  // vez de somar o mês inteiro contra a capacidade de uma aula só.
  const ocupacao = useMemo(() => {
    const m = new Map<string, OcupacaoTurma>()
    for (const l of ocupacaoLinhas ?? []) {
      const ocorrencias = Math.max(l.ocorrencias ?? 1, 1)
      m.set(l.turma_id, {
        reservas: visao === 'semana' ? l.reservas : Math.round(l.reservas / ocorrencias),
        capacidade: l.capacidade,
      })
    }
    return m
  }, [ocupacaoLinhas, visao])

  const novoInicial = (): TurmaInicial => ({
    modalidadeId: '',
    modalidade: '',
    salaId: salas?.[0]?.id ?? '',
    professoraId: '',
    dia: '1',
    horario: '19:00',
    duracao: '60',
    capacidade: '8',
  })

  const deTurma = (t: TurmaComProfessora): TurmaInicial => ({
    modalidadeId: t.modalidade_id ?? '',
    modalidade: t.modalidade,
    salaId: t.sala_id ?? salas?.[0]?.id ?? '',
    professoraId: t.professora_id,
    dia: String(t.dia_semana),
    horario: fmtHora(t.horario),
    duracao: String(t.duracao_minutos),
    capacidade: String(t.capacidade),
  })

  function excluir(t: TurmaComProfessora) {
    const quando = `${DIAS_SEMANA[t.dia_semana]} às ${fmtHora(t.horario)}`
    // "Excluir turma" sempre foi `ativa = false` — o diálogo passa a dizer
    // isso em vez de prometer uma exclusão que nunca aconteceu.
    confirmar.pedir({
      titulo: `Arquivar a turma de ${t.modalidade}?`,
      tom: 'arquivar',
      descricao: (
        <>
          A aula de <b>{quando}</b> sai da grade e ninguém consegue mais reservar nela. As
          reservas e presenças já registradas continuam no histórico e no pagamento da professora.
        </>
      ),
      aoConfirmar: () => desativar.mutateAsync(t.id),
    })
  }

  const navegar = (passo: number) =>
    setDia((d) => {
      if (visao === 'semana') return somarDias(d, passo * 7)
      const base = inicioMes(d)
      return passo > 0 ? fimMesExclusivo(base) : somarDias(base, -1)
    })

  const rotulo = visao === 'semana' ? rotuloSemana(dia) : rotuloMes(dia)
  const diaSemanaLabel = DIAS_EXTENSO[new Date(dia + 'T00:00:00').getDay()]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setDia(hojeISO())}>
          Hoje
        </Button>
        <div className="flex items-center gap-0.5">
          <BotaoSeta onClick={() => navegar(-1)} titulo="Anterior">
            <ChevronLeft className="size-4" />
          </BotaoSeta>
          <BotaoSeta onClick={() => navegar(1)} titulo="Próximo">
            <ChevronRight className="size-4" />
          </BotaoSeta>
        </div>
        <span className="font-display text-sm font-bold capitalize text-ink">{rotulo}</span>

        <div className="ml-auto flex items-center gap-2">
          <Tabs
            value={visao}
            onChange={setVisao}
            size="sm"
            items={[
              { value: 'semana', label: 'Semana' },
              { value: 'mes', label: 'Mês' },
            ]}
          />
          <button
            onClick={() => setConfigAberta(true)}
            title="Configurações de exibição"
            className="rounded-md border border-neutral-300 bg-white p-2 text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-800"
          >
            <Settings2 className="size-4" />
          </button>
          <Button onClick={() => setForm({ inicial: novoInicial(), turmaId: null })}>
            <Plus className="size-4" />
            Nova turma
          </Button>
        </div>
      </div>

      {exibicao.colorirPor === 'categoria' && (
        <LegendaCategorias
          categorias={categorias ?? []}
          temSemCategoria={(turmas ?? []).some((t) => !t.categoria)}
          onGerenciar={() => setCategoriasAbertas(true)}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 lg:order-1">
          {isLoading ? (
            <p className="text-sm text-neutral-400">Carregando…</p>
          ) : visao === 'semana' ? (
            <GradeSemanal
              turmas={turmas ?? []}
              salas={salas ?? []}
              ocupacao={ocupacao}
              exibicao={exibicao}
              diaSelecionado={dia}
              onSelecionarDia={setDia}
              onEditar={(t) => setForm({ inicial: deTurma(t), turmaId: t.id })}
              onDuplicar={(t) => setForm({ inicial: deTurma(t), turmaId: null })}
              onExcluir={excluir}
            />
          ) : (
            <GradeMensal
              turmas={turmas ?? []}
              ocupacao={ocupacao}
              exibicao={exibicao}
              mesReferencia={dia}
              diaSelecionado={dia}
              onSelecionarDia={setDia}
            />
          )}
        </div>

        {/* Painel do dia — no celular vem antes da grade, que exige rolagem. */}
        <aside className="min-w-0 lg:order-2">
          <div className="rounded-lg border border-neutral-200 bg-white p-3.5">
            <h3 className="mb-3 font-display text-xs font-bold uppercase tracking-wider text-neutral-500">
              {diaSemanaLabel}, {Number(dia.slice(8, 10))}
            </h3>
            <DiaView data={dia} />
          </div>
        </aside>
      </div>

      {configAberta && (
        <ConfigExibicao
          exibicao={exibicao}
          onAlterar={alterarExibicao}
          onFechar={() => setConfigAberta(false)}
        />
      )}
      {categoriasAbertas && <CategoriasModal onFechar={() => setCategoriasAbertas(false)} />}
      {confirmar.dialogo}
      {form && (
        <TurmaForm inicial={form.inicial} turmaId={form.turmaId} onFechar={() => setForm(null)} />
      )}
    </div>
  )
}

function BotaoSeta({
  onClick,
  titulo,
  children,
}: {
  onClick: () => void
  titulo: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={cn(
        'rounded-md border border-neutral-300 bg-white p-1.5 text-neutral-500 transition',
        'hover:border-neutral-400 hover:text-neutral-900',
      )}
    >
      {children}
    </button>
  )
}
