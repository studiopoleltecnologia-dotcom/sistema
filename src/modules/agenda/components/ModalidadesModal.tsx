import { useState, type FormEvent } from 'react'
import { ArchiveRestore, Archive, Palette } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { cn } from '../../../components/ui/cn'
import { corDaCategoria, corModalidade } from '../cores'
import {
  useAtualizarModalidade,
  useCategorias,
  useCriarModalidade,
  useTodasModalidades,
  useTurmasPorModalidade,
} from '../hooks/useAgenda'
import type { CategoriaModalidade, Modalidade } from '../types'

/**
 * Modalidades, organizadas **por categoria**.
 *
 * A primeira versão desta tela era uma lista corrida com um seletor solto em
 * cada linha. Respondia "qual é a categoria do Jazz?", mas não a pergunta que
 * a equipe realmente faz, que é a inversa: "o que está dentro de Pole?" — e
 * sem ver os grupos lado a lado não dá para perceber que Bases de Salto ficou
 * em Dança sozinha, ou que Projeto Casinha está vazia.
 *
 * O modal de Categorias mostra as modalidades de cada categoria, mas só como
 * texto corrido, sem como mover nenhuma. É a metade que faltava.
 *
 * **Aqui não se mexe em cor.** Cor é de categoria, se edita em Categorias, e
 * misturar as duas coisas na mesma tela foi o que fez a busca por "onde mudo
 * a cor" terminar no lugar errado. Esta tela responde só "o que está em quê".
 */
export function ModalidadesModal({ onFechar }: { onFechar: () => void }) {
  const { data: modalidades } = useTodasModalidades()
  const { data: categorias } = useCategorias()
  const { data: usoPorModalidade } = useTurmasPorModalidade()
  const criar = useCriarModalidade()

  const [nova, setNova] = useState('')
  const [categoriaNova, setCategoriaNova] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const lista = modalidades ?? []
  const cats = categorias ?? []
  const ativas = lista.filter((m) => m.ativa)
  const arquivadas = lista.filter((m) => !m.ativa)
  const semCategoria = ativas.filter((m) => !m.categoria_id)

  function criarModalidade(e: FormEvent) {
    e.preventDefault()
    const nome = nova.trim()
    if (!nome) return
    if (lista.some((m) => m.nome.trim().toLowerCase() === nome.toLowerCase())) {
      return setErro(`"${nome}" já existe.`)
    }
    setErro(null)
    criar.mutate(
      { nome, categoriaId: categoriaNova || null },
      {
        onSuccess: () => {
          setNova('')
          setCategoriaNova('')
        },
        onError: (err) => setErro((err as Error).message),
      },
    )
  }

  return (
    <Modal title="Modalidades por categoria" onFechar={onFechar} size="lg">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-xs text-neutral-500">
          Cada aula pertence a uma categoria, e é a categoria que dá a cor do cartão na grade.
          Use o seletor de cada linha para mover a aula de grupo. As cores em si se editam em{' '}
          <span className="inline-flex items-center gap-1 font-medium text-neutral-600">
            <Palette className="size-3" />
            Categorias
          </span>
          .
        </p>

        {/* Sem categoria vem primeiro quando existe: é a pilha que pede ação,
            e é o motivo de alguém abrir esta tela. Vazia, some — seção morta
            no topo só empurraria o conteúdo real para baixo. */}
        {semCategoria.length > 0 && (
          <Grupo
            titulo="Sem categoria"
            cor={null}
            total={semCategoria.length}
            tracejado
            aviso="Aparecem na grade com uma cor provisória, derivada do nome."
          >
            {semCategoria.map((m) => (
              <LinhaModalidade
                key={m.id}
                modalidade={m}
                categorias={cats}
                turmas={usoPorModalidade?.get(m.id) ?? 0}
              />
            ))}
          </Grupo>
        )}

        {cats.map((c) => {
          const doGrupo = ativas.filter((m) => m.categoria_id === c.id)
          return (
            <Grupo
              key={c.id}
              titulo={c.nome}
              cor={corDaCategoria(c).acento}
              total={doGrupo.length}
              aviso={doGrupo.length === 0 ? 'Nenhuma aula neste grupo ainda.' : undefined}
            >
              {doGrupo.map((m) => (
                <LinhaModalidade
                  key={m.id}
                  modalidade={m}
                  categorias={cats}
                  turmas={usoPorModalidade?.get(m.id) ?? 0}
                />
              ))}
            </Grupo>
          )
        })}

        {arquivadas.length > 0 && (
          <Grupo titulo="Arquivadas" cor={null} total={arquivadas.length} tracejado>
            {arquivadas.map((m) => (
              <LinhaModalidade
                key={m.id}
                modalidade={m}
                categorias={cats}
                turmas={usoPorModalidade?.get(m.id) ?? 0}
              />
            ))}
          </Grupo>
        )}

        <form
          onSubmit={criarModalidade}
          className="flex min-w-0 flex-wrap items-center gap-2 border-t border-neutral-100 pt-4"
        >
          <input
            value={nova}
            onChange={(e) => {
              setNova(e.target.value)
              setErro(null)
            }}
            placeholder="Nome da nova modalidade"
            className="min-w-32 flex-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
          />
          <select
            value={categoriaNova}
            onChange={(e) => setCategoriaNova(e.target.value)}
            aria-label="Categoria da nova modalidade"
            className="min-w-0 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500"
          >
            <option value="">Sem categoria</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="secondary" loading={criar.isPending}>
            Adicionar
          </Button>
          {erro && <p className="w-full text-xs text-danger-600">{erro}</p>}
        </form>
      </div>
    </Modal>
  )
}

function Grupo({
  titulo,
  cor,
  total,
  tracejado,
  aviso,
  children,
}: {
  titulo: string
  /** Acento da categoria; null nos grupos que não são categoria. */
  cor: string | null
  total: number
  tracejado?: boolean
  aviso?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-lg border p-2.5',
        tracejado ? 'border-dashed border-neutral-300 bg-neutral-50/50' : 'border-neutral-200',
      )}
    >
      <header className="mb-2 flex items-center gap-2 px-0.5">
        <span
          className={cn('size-2.5 shrink-0 rounded-full', !cor && 'bg-neutral-300')}
          style={cor ? { background: cor } : undefined}
        />
        <h3 className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider text-neutral-600">
          {titulo}
        </h3>
        <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
          {total} {total === 1 ? 'aula' : 'aulas'}
        </span>
      </header>

      {aviso && <p className="mb-1.5 px-0.5 text-[11px] text-neutral-400">{aviso}</p>}

      <div className="flex min-w-0 flex-col gap-1.5">{children}</div>
    </section>
  )
}

function LinhaModalidade({
  modalidade,
  categorias,
  turmas,
}: {
  modalidade: Modalidade
  categorias: CategoriaModalidade[]
  /** Turmas ativas que usam esta modalidade. */
  turmas: number
}) {
  const atualizar = useAtualizarModalidade()
  const [nome, setNome] = useState(modalidade.nome)
  const [confirmando, setConfirmando] = useState(false)

  const categoria = categorias.find((c) => c.id === modalidade.categoria_id) ?? null
  // Mesma cor que o cartão terá na grade — inclusive a provisória de quem
  // ainda não tem categoria. Mover a aula e ver a linha trocar de cor na hora
  // é a confirmação de que pegou.
  const cor = categoria ? corDaCategoria(categoria) : corModalidade(modalidade.nome)

  const salvarNome = () => {
    const limpo = nome.trim()
    if (!limpo || limpo === modalidade.nome) return setNome(modalidade.nome)
    atualizar.mutate({ id: modalidade.id, patch: { nome: limpo } })
  }

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border py-1.5 pl-2 pr-2.5',
        !modalidade.ativa && 'opacity-60',
      )}
      style={{ background: cor.bg, borderColor: cor.borda }}
    >
      <span
        aria-hidden
        className="h-6 w-1 shrink-0 rounded-full"
        style={{ background: cor.acento }}
      />

      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={salvarNome}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label={`Nome da modalidade ${modalidade.nome}`}
        className="min-w-24 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-ink outline-none transition hover:border-neutral-300 focus:border-brand-500 focus:bg-white"
      />

      <span
        className="shrink-0 text-[11px] tabular-nums text-neutral-500"
        title="Turmas ativas que usam esta modalidade"
      >
        {turmas} {turmas === 1 ? 'turma' : 'turmas'}
      </span>

      <select
        value={modalidade.categoria_id ?? ''}
        onChange={(e) =>
          atualizar.mutate({
            id: modalidade.id,
            patch: { categoria_id: e.target.value || null },
          })
        }
        aria-label={`Mover ${modalidade.nome} para outra categoria`}
        title="Mover para outra categoria"
        className="min-w-0 max-w-40 shrink rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs outline-none transition focus:border-brand-500"
      >
        <option value="">Sem categoria</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>

      {modalidade.ativa ? (
        confirmando ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {/* Arquivar não mexe nas turmas que já usam a modalidade — elas
                continuam na grade. Só some do seletor de turma nova. */}
            <span className="text-[11px] text-neutral-600">
              {turmas > 0 ? `${turmas} turma(s) continuam na grade.` : 'Arquivar?'}
            </span>
            <button
              onClick={() => {
                atualizar.mutate({ id: modalidade.id, patch: { ativa: false } })
                setConfirmando(false)
              }}
              className="rounded bg-neutral-700 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-neutral-800"
            >
              Arquivar
            </button>
            <button
              onClick={() => setConfirmando(false)}
              className="text-[11px] text-neutral-500 transition hover:text-neutral-800"
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmando(true)}
            title="Arquivar modalidade"
            aria-label={`Arquivar ${modalidade.nome}`}
            className="shrink-0 rounded p-1 text-neutral-400 transition hover:bg-white/70 hover:text-neutral-800"
          >
            <Archive className="size-3.5" />
          </button>
        )
      ) : (
        <button
          onClick={() => atualizar.mutate({ id: modalidade.id, patch: { ativa: true } })}
          title="Reativar modalidade"
          aria-label={`Reativar ${modalidade.nome}`}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-neutral-500 transition hover:bg-white/70 hover:text-brand-700"
        >
          <ArchiveRestore className="size-3.5" />
          Reativar
        </button>
      )}
    </div>
  )
}
