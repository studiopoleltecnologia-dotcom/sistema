import { useState } from 'react'
import { CalendarClock, CheckCircle2, Circle, Moon, Plus, Sun, Trash2, X } from 'lucide-react'
import { useConfirmar } from '../../components/ui/ConfirmarAcao'
import { useAbaUrl } from '../../lib/aba'
import { fmtData } from '../../lib/datas'
import { useSocias } from '../clientes/hooks/useClientes'
import {
  useAlternarTarefa,
  useChecklist,
  useCriarItemChecklist,
  useCriarTarefa,
  useDesmarcarItem,
  useExcluirTarefa,
  useMarcarItem,
  useRemoverItemChecklist,
  useTarefas,
} from './hooks/useTarefas'
import { ROTINA_LABEL, ROTINAS, type RotinaChecklist } from './types'

const hojeISO = () => new Date().toISOString().slice(0, 10)

const ABAS = ['rotinas', 'tarefas'] as const

export function TarefasPage() {
  const [aba, setAba] = useAbaUrl(ABAS, 'rotinas')
  const abaCls = (ativa: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition ${
      ativa ? 'bg-brand-50 text-brand-700' : 'text-neutral-400 hover:text-neutral-700'
    }`

  return (
    <div>
      <div className="mb-6 flex gap-1">
        <button className={abaCls(aba === 'rotinas')} onClick={() => setAba('rotinas')}>
          Rotinas do dia
        </button>
        <button className={abaCls(aba === 'tarefas')} onClick={() => setAba('tarefas')}>
          Tarefas
        </button>
      </div>

      {aba === 'rotinas' ? <RotinasDoDia /> : <ListaTarefas />}
    </div>
  )
}

// --- Checklists de abertura/fechamento ---

const ICONE_ROTINA: Record<RotinaChecklist, typeof Sun> = { abertura: Sun, fechamento: Moon }

function RotinasDoDia() {
  const [data, setData] = useState(hojeISO())
  const { data: checklist } = useChecklist(data)
  const marcar = useMarcarItem()
  const desmarcar = useDesmarcarItem()
  const criarItem = useCriarItemChecklist()
  const removerItem = useRemoverItemChecklist()
  const confirmar = useConfirmar()

  const itens = checklist?.itens ?? []
  const feitos = checklist?.feitos ?? new Set<string>()

  function alternar(itemId: string) {
    if (feitos.has(itemId)) desmarcar.mutate({ itemId, data })
    else marcar.mutate({ itemId, data })
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-neutral-400">
          As rotinas reiniciam a cada dia. Marque conforme for fazendo.
        </p>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ROTINAS.map((rotina) => {
          const Icone = ICONE_ROTINA[rotina]
          const daRotina = itens.filter((i) => i.rotina === rotina)
          const nFeitos = daRotina.filter((i) => feitos.has(i.id)).length
          const completa = daRotina.length > 0 && nFeitos === daRotina.length
          return (
            <div key={rotina} className="rounded-xl border border-neutral-200/80 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-lg bg-brand-50 p-1.5 text-brand-600">
                  <Icone className="size-4" />
                </span>
                <h3 className="flex-1 text-sm font-semibold text-neutral-800">
                  {ROTINA_LABEL[rotina]}
                </h3>
                <span
                  className={`text-xs font-medium ${completa ? 'text-success-600' : 'text-neutral-400'}`}
                >
                  {nFeitos}/{daRotina.length}
                  {completa ? ' ✓' : ''}
                </span>
              </div>

              <ul className="flex flex-col">
                {daRotina.map((item) => {
                  const feito = feitos.has(item.id)
                  return (
                    <li key={item.id} className="group flex items-center gap-2 py-1.5">
                      <button
                        onClick={() => alternar(item.id)}
                        className={`flex flex-1 items-center gap-2 text-left text-sm transition ${
                          feito ? 'text-neutral-400 line-through' : 'text-neutral-700'
                        }`}
                      >
                        {feito ? (
                          <CheckCircle2 className="size-4 shrink-0 text-success-500" />
                        ) : (
                          <Circle className="size-4 shrink-0 text-neutral-300" />
                        )}
                        {item.titulo}
                      </button>
                      <button
                        onClick={() =>
                          confirmar.pedir({
                            titulo: 'Remover do checklist?',
                            descricao: (
                              <>
                                <b>{item.titulo}</b> some da rotina de todos os dias, não só de
                                hoje. O histórico de quando ele foi marcado é apagado junto.
                              </>
                            ),
                            textoConfirmar: 'Remover',
                            aoConfirmar: () => removerItem.mutateAsync(item.id),
                          })
                        }
                        className="rounded p-0.5 text-neutral-200 transition hover:text-danger-500 md:opacity-0 md:group-hover:opacity-100"
                        title="Remover do checklist"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  )
                })}
                {daRotina.length === 0 && (
                  <li className="py-2 text-xs text-neutral-300">Nenhum item nesta rotina.</li>
                )}
              </ul>

              <AddItem
                onAdd={(titulo) =>
                  criarItem.mutate({ rotina, titulo, ordem: daRotina.length + 1 })
                }
              />
            </div>
          )
        })}
      </div>
      {confirmar.dialogo}
    </div>
  )
}

function AddItem({ onAdd }: { onAdd: (titulo: string) => void }) {
  const [texto, setTexto] = useState('')
  function add() {
    const t = texto.trim()
    if (!t) return
    onAdd(t)
    setTexto('')
  }
  return (
    <div className="mt-2 flex items-center gap-1.5 border-t border-neutral-100 pt-2">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        placeholder="Adicionar item…"
        className="flex-1 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none transition focus:border-brand-500"
      />
      <button
        onClick={add}
        disabled={!texto.trim()}
        className="rounded-md p-1 text-neutral-400 transition hover:bg-neutral-50 hover:text-brand-600 disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

// --- Tarefas avulsas ---

function ListaTarefas() {
  const { data: tarefas } = useTarefas()
  const { data: socias } = useSocias()
  const criar = useCriarTarefa()
  const alternar = useAlternarTarefa()
  const excluir = useExcluirTarefa()
  const confirmar = useConfirmar()

  const [titulo, setTitulo] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [prazo, setPrazo] = useState('')
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)

  const hoje = hojeISO()
  const lista = (tarefas ?? []).filter((t) => mostrarConcluidas || !t.concluida)
  const pendentes = (tarefas ?? []).filter((t) => !t.concluida).length

  function adicionar() {
    const t = titulo.trim()
    if (!t) return
    criar.mutate(
      { titulo: t, responsavel_id: responsavel || null, prazo: prazo || null },
      {
        onSuccess: () => {
          setTitulo('')
          setResponsavel('')
          setPrazo('')
        },
      },
    )
  }

  const inputCls =
    'rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500'

  return (
    <div>
      <div className="mb-5 rounded-xl border border-neutral-200/80 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionar()}
            placeholder="Nova tarefa…"
            className={`${inputCls} min-w-48 flex-1`}
          />
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className={inputCls}
          >
            <option value="">Responsável…</option>
            {(socias ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            className={inputCls}
            title="Prazo"
          />
          <button
            onClick={adicionar}
            disabled={!titulo.trim() || criar.isPending}
            className="flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            <Plus className="size-4" />
            Adicionar
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-neutral-400">
          {pendentes} pendente{pendentes === 1 ? '' : 's'}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={mostrarConcluidas}
            onChange={(e) => setMostrarConcluidas(e.target.checked)}
          />
          Mostrar concluídas
        </label>
      </div>

      <ul className="flex flex-col gap-1.5">
        {lista.map((t) => {
          const atrasada = !t.concluida && t.prazo != null && t.prazo < hoje
          return (
            <li
              key={t.id}
              className="group flex items-center gap-2.5 rounded-lg border border-neutral-100 bg-white px-3 py-2.5"
            >
              <button onClick={() => alternar.mutate({ id: t.id, concluida: !t.concluida })}>
                {t.concluida ? (
                  <CheckCircle2 className="size-5 text-success-500" />
                ) : (
                  <Circle className="size-5 text-neutral-300 transition hover:text-brand-500" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm ${
                    t.concluida ? 'text-neutral-400 line-through' : 'text-neutral-800'
                  }`}
                >
                  {t.titulo}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                  {t.responsavel?.nome && (
                    <span className="text-neutral-400">{t.responsavel.nome}</span>
                  )}
                  {t.prazo && (
                    <span
                      className={`flex items-center gap-0.5 ${
                        atrasada ? 'font-medium text-danger-600' : 'text-neutral-400'
                      }`}
                    >
                      <CalendarClock className="size-3" />
                      {fmtData(t.prazo)}
                      {atrasada ? ' · atrasada' : ''}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() =>
                  confirmar.pedir({
                    titulo: 'Excluir esta tarefa?',
                    descricao: <b>{t.titulo}</b>,
                    aoConfirmar: () => excluir.mutateAsync(t.id),
                  })
                }
                className="rounded p-1 text-neutral-200 transition hover:text-danger-500 md:opacity-0 md:group-hover:opacity-100"
                title="Excluir"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          )
        })}
        {lista.length === 0 && (
          <li className="py-8 text-center text-sm text-neutral-300">
            {mostrarConcluidas ? 'Nenhuma tarefa.' : 'Nenhuma tarefa pendente. 🎉'}
          </li>
        )}
      </ul>
      {confirmar.dialogo}
    </div>
  )
}
