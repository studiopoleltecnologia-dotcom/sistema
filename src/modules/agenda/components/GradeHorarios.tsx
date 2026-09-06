import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, Plus, Settings2, Tag, X } from 'lucide-react'
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
import { ModalidadesModal } from './ModalidadesModal'
import { ConfigExibicao } from './ConfigExibicao'
import { DiaView } from './DiaView'
import { LegendaCategorias } from './LegendaCategorias'
import { GradeMensal } from './GradeMensal'
import { GradeSemanal, type OcupacaoTurma } from './GradeSemanal'
import { TurmaForm, type TurmaInicial } from './TurmaForm'

type Visao = 'semana' | 'mes'

const DIAS_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/**
 * Tela inicial da Grade de horários.
 *
 * O painel do dia deixou de ser uma coluna fixa e virou **gaveta**. A
 * coluna de 21rem custava um quinto da largura o tempo todo, inclusive nas
 * horas em que ninguém estava mexendo em agendamento, e era ela que, somada
 * à largura mínima da grade, empurrava a página inteira para além da
 * viewport — o vazamento lateral não vinha do painel ser largo, vinha de
 * grade e painel disputarem a mesma linha sem nenhum poder encolher.
 *
 * Como gaveta, a grade usa a largura toda e o painel abre exatamente
 * quando se clica numa aula ou num dia, que é quando ele tem o que dizer.
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
  const [modalidadesAbertas, setModalidadesAbertas] = useState(false)
  const [form, setForm] = useState<{ inicial: TurmaInicial; turmaId: string | null } | null>(null)
  const [painelAberto, setPainelAberto] = useState(false)
  const [turmaSelecionada, setTurmaSelecionada] = useState<string | null>(null)

  const { data: turmas, isLoading } = useTurmas()
  const { data: salas } = useSalas()
  const { data: categorias } = useCategorias()
  const desativar = useDesativarTurma()
  const confirmar = useConfirmar()

  // Esc fecha a gaveta. Ela cobre parte da grade no desktop e a grade
  // inteira no celular — sair dela precisa custar uma tecla.
  useEffect(() => {
    if (!painelAberto) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPainelAberto(false)
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [painelAberto])

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

  function abrirDia(dataISO: string) {
    setDia(dataISO)
    setTurmaSelecionada(null)
    setPainelAberto(true)
  }

  function abrirTurma(t: TurmaComProfessora, dataISO: string) {
    setDia(dataISO)
    setTurmaSelecionada(t.id)
    setPainelAberto(true)
  }

  const rotulo = visao === 'semana' ? rotuloSemana(dia) : rotuloMes(dia)
  const diaSemanaLabel = DIAS_EXTENSO[new Date(dia + 'T00:00:00').getDay()]
  const semCategoria = (turmas ?? []).some((t) => !t.categoria)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Barra de controles: navegação à esquerda, ações à direita, uma
          linha só quando cabe. Antes eram duas faixas (controles + legenda)
          gastando altura acima da grade, que é o conteúdo da tela. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2 shadow-sm">
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
        {/* `first-letter`, não `capitalize`: o rótulo é "7 – 13 de setembro"
            e `capitalize` maiusculiza cada palavra, entregando "7 – 13 De
            Setembro". Só a primeira letra da frase sobe. */}
        <span className="min-w-0 truncate font-display text-sm font-bold text-ink first-letter:uppercase">
          {rotulo}
        </span>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <Tabs
            value={visao}
            onChange={setVisao}
            size="sm"
            items={[
              { value: 'semana', label: 'Semana' },
              { value: 'mes', label: 'Mês' },
            ]}
          />
          <BotaoIcone
            onClick={() => setPainelAberto(true)}
            titulo="Abrir o painel do dia"
            ativo={painelAberto}
          >
            <CalendarRange className="size-4" />
          </BotaoIcone>
          {/* Modalidades fica na barra e não só atrás da legenda: a legenda
              só existe no modo "colorir por categoria", e o cadastro precisa
              estar alcançável em qualquer modo. */}
          <BotaoIcone
            onClick={() => setModalidadesAbertas(true)}
            titulo="Modalidades por categoria — organizar o que está em cada grupo"
          >
            <Tag className="size-4" />
          </BotaoIcone>
          <BotaoIcone onClick={() => setConfigAberta(true)} titulo="Configurações de exibição">
            <Settings2 className="size-4" />
          </BotaoIcone>
          <Button size="sm" onClick={() => setForm({ inicial: novoInicial(), turmaId: null })}>
            <Plus className="size-4" />
            Nova turma
          </Button>
        </div>
      </div>

      {exibicao.colorirPor === 'categoria' && (
        <LegendaCategorias
          categorias={categorias ?? []}
          temSemCategoria={semCategoria}
          onGerenciar={() => setCategoriasAbertas(true)}
        />
      )}

      <div className="min-w-0">
        {isLoading ? (
          <p className="text-sm text-neutral-400">Carregando…</p>
        ) : visao === 'semana' ? (
          <GradeSemanal
            turmas={turmas ?? []}
            salas={salas ?? []}
            ocupacao={ocupacao}
            exibicao={exibicao}
            diaSelecionado={dia}
            turmaSelecionada={turmaSelecionada}
            onSelecionarDia={abrirDia}
            onSelecionarTurma={abrirTurma}
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
            onSelecionarDia={abrirDia}
          />
        )}
      </div>

      {/* Gaveta do dia. `w-[min(23rem,100vw-1.5rem)]` é a trava que impede
          o painel de sair da tela em qualquer largura, inclusive 360px. */}
      {painelAberto && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div
            className="absolute inset-0 bg-ink/25 backdrop-blur-[1px]"
            onClick={() => setPainelAberto(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label={`Aulas de ${diaSemanaLabel}, ${Number(dia.slice(8, 10))}`}
            className="relative flex h-full w-[min(23rem,100vw-1.5rem)] min-w-0 flex-col border-l border-neutral-200 bg-white shadow-lg"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-3 py-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-sm font-bold uppercase tracking-wide text-ink">
                  {diaSemanaLabel}, {Number(dia.slice(8, 10))}
                </h3>
                <p className="text-[11px] text-neutral-400">
                  {dia === hojeISO() ? 'Hoje' : 'Aulas do dia'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <BotaoSeta onClick={() => setDia(somarDias(dia, -1))} titulo="Dia anterior">
                  <ChevronLeft className="size-4" />
                </BotaoSeta>
                <BotaoSeta onClick={() => setDia(somarDias(dia, 1))} titulo="Próximo dia">
                  <ChevronRight className="size-4" />
                </BotaoSeta>
                <button
                  onClick={() => setPainelAberto(false)}
                  aria-label="Fechar painel do dia"
                  className="ml-1 rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-800"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="min-w-0 flex-1 overflow-y-auto p-3">
              <DiaView
                data={dia}
                turmaSelecionada={turmaSelecionada}
                onSelecionarTurma={setTurmaSelecionada}
              />
            </div>
          </aside>
        </div>
      )}

      {configAberta && (
        <ConfigExibicao
          exibicao={exibicao}
          onAlterar={alterarExibicao}
          onFechar={() => setConfigAberta(false)}
        />
      )}
      {categoriasAbertas && <CategoriasModal onFechar={() => setCategoriasAbertas(false)} />}
      {modalidadesAbertas && <ModalidadesModal onFechar={() => setModalidadesAbertas(false)} />}
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
        'rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 transition',
        'hover:border-neutral-400 hover:text-neutral-900',
      )}
    >
      {children}
    </button>
  )
}

function BotaoIcone({
  onClick,
  titulo,
  ativo,
  children,
}: {
  onClick: () => void
  titulo: string
  ativo?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo}
      className={cn(
        'rounded-md border p-2 transition',
        ativo
          ? 'border-brand-300 bg-brand-50 text-brand-700'
          : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400 hover:text-neutral-800',
      )}
    >
      {children}
    </button>
  )
}
