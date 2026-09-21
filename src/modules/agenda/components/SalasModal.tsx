import { useState, type FormEvent } from 'react'
import { AlertCircle, DoorOpen, Plus, PowerOff, RotateCcw } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { cn } from '../../../components/ui/cn'
import { useAtualizarSala, useCriarSala, useTodasSalas, useTurmasPorSala } from '../hooks/useAgenda'
import type { Sala } from '../types'

/**
 * Cadastro das salas do estúdio.
 *
 * Existia a tabela `salas` com RLS e o seletor no formulário de turma, mas
 * nenhuma tela: quem quisesse uma segunda sala dependia de alguém abrir o
 * Supabase. Foi o que aconteceu com a **Sala 2**, que nasceu no seed e está
 * `ativa = false` em produção — como `listarSalas()` filtra por `ativa`, ela
 * simplesmente não aparecia no seletor, sem nada na tela dizendo por quê.
 *
 * Duas decisões que não são detalhe:
 *
 * 1. **As desativadas aparecem aqui.** É o que impede a equipe de "criar a
 *    Sala 2" por cima de uma Sala 2 que já existe — `salas.nome` não tem
 *    unique, então a duplicata entraria calada e a grade passaria a desenhar
 *    três colunas, duas delas com o mesmo nome.
 * 2. **Não dá para desativar sala com turma ativa.** A grade se divide em
 *    colunas a partir das salas ATIVAS; uma turma cuja sala foi desativada
 *    não casaria com nenhuma coluna e sumiria da semana sem aviso. Mover as
 *    turmas primeiro é o único caminho que não perde aula de vista.
 */
export function SalasModal({ onFechar }: { onFechar: () => void }) {
  const { data: salas } = useTodasSalas()
  const { data: turmasPorSala } = useTurmasPorSala()
  const criar = useCriarSala()

  const [nova, setNova] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const lista = salas ?? []
  const ativas = lista.filter((s) => s.ativa)
  const desativadas = lista.filter((s) => !s.ativa)

  function adicionar(e: FormEvent) {
    e.preventDefault()
    const nome = nova.trim()
    if (!nome) return
    const igual = lista.find((s) => s.nome.trim().toLowerCase() === nome.toLowerCase())
    if (igual) {
      return setErro(
        igual.ativa
          ? `"${igual.nome}" já existe.`
          : `"${igual.nome}" já existe, desativada — reative na lista abaixo em vez de criar outra.`,
      )
    }
    setErro(null)
    const ordem = Math.max(0, ...lista.map((s) => s.ordem)) + 1
    criar.mutate({ nome, ordem }, { onError: (err) => setErro((err as Error).message) })
    setNova('')
  }

  return (
    <Modal title="Salas do estúdio" onFechar={onFechar} size="lg">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-xs text-neutral-500">
          Cada turma acontece em uma sala. Com duas ou mais salas em uso, a grade da semana
          passa a mostrar uma coluna por sala dentro de cada dia.
        </p>

        {erro && (
          <p className="flex items-start gap-1.5 rounded-md bg-danger-50 px-2.5 py-2 text-xs text-danger-700">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0">{erro}</span>
          </p>
        )}

        <div className="flex min-w-0 flex-col gap-1.5">
          {ativas.map((s) => (
            <LinhaSala
              key={s.id}
              sala={s}
              turmas={turmasPorSala?.get(s.id) ?? 0}
              onErro={setErro}
            />
          ))}
          {ativas.length === 0 && (
            <p className="rounded-lg border border-dashed border-neutral-300 py-6 text-center text-xs text-neutral-400">
              Nenhuma sala ativa. Crie a primeira abaixo.
            </p>
          )}
        </div>

        <form onSubmit={adicionar} className="flex gap-1.5">
          <Input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder="Nome da sala (ex: Sala 2)"
            className="w-full"
          />
          <Button type="submit" size="sm" loading={criar.isPending}>
            <Plus className="size-4" />
            Criar
          </Button>
        </form>

        {desativadas.length > 0 && (
          <section className="min-w-0 border-t border-neutral-100 pt-3">
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
              Desativadas
            </h3>
            <div className="flex min-w-0 flex-col gap-1.5">
              {desativadas.map((s) => (
                <LinhaSala
                  key={s.id}
                  sala={s}
                  turmas={turmasPorSala?.get(s.id) ?? 0}
                  onErro={setErro}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}

function LinhaSala({
  sala,
  turmas,
  onErro,
}: {
  sala: Sala
  turmas: number
  onErro: (msg: string | null) => void
}) {
  const atualizar = useAtualizarSala()
  const [nome, setNome] = useState(sala.nome)

  const comErro = { onError: (err: unknown) => onErro((err as Error).message) }

  const salvarNome = () => {
    const limpo = nome.trim()
    if (!limpo || limpo === sala.nome) return setNome(sala.nome)
    onErro(null)
    atualizar.mutate({ id: sala.id, patch: { nome: limpo } }, comErro)
  }

  function desativar() {
    // O bloqueio é aqui e não no banco de propósito: mover turma de sala é
    // decisão de operação, não de schema. O que não pode é a turma sumir da
    // grade porque a sala dela saiu das colunas.
    if (turmas > 0) {
      return onErro(
        `"${sala.nome}" ainda tem ${turmas} turma${turmas === 1 ? '' : 's'} na grade. ` +
          'Mova essas turmas para outra sala (ou arquive-as) antes de desativar.',
      )
    }
    onErro(null)
    atualizar.mutate({ id: sala.id, patch: { ativa: false } }, comErro)
  }

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-neutral-200 bg-white py-1.5 pl-2 pr-2',
        !sala.ativa && 'bg-neutral-50 opacity-70',
      )}
    >
      <DoorOpen aria-hidden className="size-4 shrink-0 text-neutral-400" />

      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={salvarNome}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label={`Nome da sala ${sala.nome}`}
        className="min-w-24 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-ink outline-none transition hover:border-neutral-300 focus:border-brand-500 focus:bg-white"
      />

      <span
        className="shrink-0 text-[11px] tabular-nums text-neutral-500"
        title="Turmas ativas nesta sala"
      >
        {turmas} {turmas === 1 ? 'turma' : 'turmas'}
      </span>

      {sala.ativa ? (
        <button
          onClick={desativar}
          title="Desativar sala (some do seletor de turma nova)"
          aria-label={`Desativar ${sala.nome}`}
          className="shrink-0 rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-800"
        >
          <PowerOff className="size-3.5" />
        </button>
      ) : (
        <button
          onClick={() => {
            onErro(null)
            atualizar.mutate({ id: sala.id, patch: { ativa: true } }, comErro)
          }}
          title="Reativar sala"
          aria-label={`Reativar ${sala.nome}`}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-neutral-500 transition hover:bg-white hover:text-brand-700"
        >
          <RotateCcw className="size-3.5" />
          Reativar
        </button>
      )}
    </div>
  )
}
