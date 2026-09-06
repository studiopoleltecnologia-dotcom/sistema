import { useState, type FormEvent } from 'react'
import { AlertCircle, ArchiveRestore, Archive, Palette, Plus, X } from 'lucide-react'
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
 * Grupos de modalidade: o que está dentro de cada categoria, editável **de
 * dentro do grupo**.
 *
 * As duas versões anteriores erraram o modelo mental. A primeira era uma
 * lista corrida; a segunda agrupou visualmente mas manteve a edição num
 * seletor por linha, que responde "qual a categoria desta aula?". Só que
 * quem abre esta tela está pensando pelo grupo: *"o grupo de Pole — o que
 * tem dentro, o que eu tiro, o que eu incluo"*. Seletor por linha obriga a
 * pensar de fora para dentro, ao contrário.
 *
 * Agora cada grupo é um container com duas ações próprias:
 *  * **×** em cada aula tira ela do grupo (vai para "Sem categoria").
 *  * **+ Incluir aula** puxa qualquer aula que não esteja aqui — inclusive
 *    de outro grupo, e nesse caso o rótulo diz de onde ela vem, porque
 *    incluir em Pole uma aula que está em Dança é **mover**, não copiar, e
 *    a tela tem que dizer isso antes do clique.
 *
 * **Cor não se mexe aqui**, de propósito: cor é da categoria e se edita em
 * Categorias. Misturar as duas coisas foi o que fez a busca por "onde mudo
 * a cor" terminar no lugar errado.
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

  const nomeDaCategoria = (id: string | null) =>
    cats.find((c) => c.id === id)?.nome ?? null

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
    <Modal title="Grupos de modalidade" onFechar={onFechar} size="lg">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-xs text-neutral-500">
          Cada grupo é uma categoria, e é ela que dá a cor do cartão na grade. Tire uma aula do
          grupo no <b>×</b>, ou traga outra em <b>Incluir aula</b>. As cores em si se editam em{' '}
          <span className="inline-flex items-center gap-1 font-medium text-neutral-600">
            <Palette className="size-3" />
            Categorias
          </span>
          .
        </p>

        {/* Erro de gravação em faixa fixa no topo. Antes toda mutação falhava
            calada — o seletor voltava sozinho e a tela ficava indistinguível
            de "não dá para editar". */}
        {erro && (
          <p className="flex items-start gap-1.5 rounded-md bg-danger-50 px-2.5 py-2 text-xs text-danger-700">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0">{erro}</span>
          </p>
        )}

        {/* A pilha sem grupo vem primeiro quando existe: é o que pede ação e
            o motivo de abrir a tela. Vazia, some. */}
        {semCategoria.length > 0 && (
          <Grupo titulo="Fora de qualquer grupo" cor={null} total={semCategoria.length} tracejado>
            <p className="mb-1.5 px-0.5 text-[11px] text-neutral-400">
              Aparecem na grade com uma cor provisória, derivada do nome.
            </p>
            {semCategoria.map((m) => (
              <LinhaModalidade
                key={m.id}
                modalidade={m}
                turmas={usoPorModalidade?.get(m.id) ?? 0}
                categorias={cats}
                onErro={setErro}
              />
            ))}
          </Grupo>
        )}

        {cats.map((c) => {
          const doGrupo = ativas.filter((m) => m.categoria_id === c.id)
          const deFora = ativas.filter((m) => m.categoria_id !== c.id)
          return (
            <Grupo key={c.id} titulo={c.nome} cor={corDaCategoria(c).acento} total={doGrupo.length}>
              {doGrupo.length === 0 && (
                <p className="px-0.5 pb-1 text-[11px] text-neutral-400">
                  Nenhuma aula neste grupo ainda.
                </p>
              )}
              {doGrupo.map((m) => (
                <LinhaModalidade
                  key={m.id}
                  modalidade={m}
                  turmas={usoPorModalidade?.get(m.id) ?? 0}
                  grupoAtual={c}
                  onErro={setErro}
                />
              ))}
              <IncluirNoGrupo
                categoria={c}
                candidatas={deFora}
                nomeDaCategoria={nomeDaCategoria}
                onErro={setErro}
              />
            </Grupo>
          )
        })}

        {arquivadas.length > 0 && (
          <Grupo titulo="Arquivadas" cor={null} total={arquivadas.length} tracejado>
            {arquivadas.map((m) => (
              <LinhaModalidade
                key={m.id}
                modalidade={m}
                turmas={usoPorModalidade?.get(m.id) ?? 0}
                onErro={setErro}
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
            aria-label="Grupo da nova modalidade"
            className="min-w-0 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500"
          >
            <option value="">Fora de qualquer grupo</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="secondary" loading={criar.isPending}>
            Adicionar
          </Button>
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
  children,
}: {
  titulo: string
  /** Acento da categoria; null nos blocos que não são categoria. */
  cor: string | null
  total: number
  tracejado?: boolean
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
      <div className="flex min-w-0 flex-col gap-1.5">{children}</div>
    </section>
  )
}

/**
 * "Incluir aula" de dentro do grupo. Lista quem não está aqui, dizendo de
 * onde vem: puxar para Pole uma aula que está em Dança é **mover**, e a
 * pessoa precisa saber disso antes de clicar, não depois de ver sumir lá.
 */
function IncluirNoGrupo({
  categoria,
  candidatas,
  nomeDaCategoria,
  onErro,
}: {
  categoria: CategoriaModalidade
  candidatas: Modalidade[]
  nomeDaCategoria: (id: string | null) => string | null
  onErro: (msg: string) => void
}) {
  const atualizar = useAtualizarModalidade()

  if (candidatas.length === 0) {
    return (
      <p className="px-0.5 pt-0.5 text-[11px] text-neutral-400">
        Todas as aulas já estão neste grupo.
      </p>
    )
  }

  return (
    <label className="mt-0.5 flex min-w-0 items-center gap-1.5 rounded-md border border-dashed border-neutral-300 bg-white/60 px-2 py-1.5 text-neutral-500 transition focus-within:border-brand-400 hover:border-neutral-400">
      <Plus className="size-3.5 shrink-0" />
      <select
        value=""
        onChange={(e) => {
          const id = e.target.value
          if (!id) return
          atualizar.mutate(
            { id, patch: { categoria_id: categoria.id } },
            { onError: (err) => onErro((err as Error).message) },
          )
        }}
        aria-label={`Incluir uma aula no grupo ${categoria.nome}`}
        className="min-w-0 flex-1 cursor-pointer bg-transparent text-xs outline-none"
      >
        <option value="">Incluir aula neste grupo…</option>
        {candidatas.map((m) => {
          const de = nomeDaCategoria(m.categoria_id)
          return (
            <option key={m.id} value={m.id}>
              {m.nome}
              {de ? ` — sai de ${de}` : ''}
            </option>
          )
        })}
      </select>
    </label>
  )
}

function LinhaModalidade({
  modalidade,
  turmas,
  grupoAtual,
  categorias,
  onErro,
}: {
  modalidade: Modalidade
  /** Turmas ativas que usam esta modalidade. */
  turmas: number
  /** Presente quando a linha está dentro de um grupo — habilita o "×". */
  grupoAtual?: CategoriaModalidade
  /** Presente na pilha sem grupo — habilita o "Incluir em…". */
  categorias?: CategoriaModalidade[]
  onErro: (msg: string) => void
}) {
  const atualizar = useAtualizarModalidade()
  const [nome, setNome] = useState(modalidade.nome)
  const [confirmando, setConfirmando] = useState(false)

  // Mesma cor que o cartão terá na grade — inclusive a provisória de quem
  // ainda não tem grupo. Mover e ver a linha trocar de cor é a confirmação.
  const cor = grupoAtual ? corDaCategoria(grupoAtual) : corModalidade(modalidade.nome)

  const comErro = { onError: (err: unknown) => onErro((err as Error).message) }

  const salvarNome = () => {
    const limpo = nome.trim()
    if (!limpo || limpo === modalidade.nome) return setNome(modalidade.nome)
    atualizar.mutate({ id: modalidade.id, patch: { nome: limpo } }, comErro)
  }

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border py-1.5 pl-2 pr-2',
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

      {/* Fora de qualquer grupo: o caminho é para dentro. */}
      {categorias && modalidade.ativa && (
        <select
          value=""
          onChange={(e) =>
            e.target.value &&
            atualizar.mutate({ id: modalidade.id, patch: { categoria_id: e.target.value } }, comErro)
          }
          aria-label={`Incluir ${modalidade.nome} em um grupo`}
          className="min-w-0 max-w-40 shrink rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs outline-none transition focus:border-brand-500"
        >
          <option value="">Incluir em…</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      )}

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
                atualizar.mutate({ id: modalidade.id, patch: { ativa: false } }, comErro)
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
          <>
            <button
              onClick={() => setConfirmando(true)}
              title="Arquivar modalidade"
              aria-label={`Arquivar ${modalidade.nome}`}
              className="shrink-0 rounded p-1 text-neutral-400 transition hover:bg-white/70 hover:text-neutral-800"
            >
              <Archive className="size-3.5" />
            </button>
            {/* Tirar do grupo ≠ arquivar: a aula continua ativa e na grade,
                só perde a cor do grupo. Por isso são dois botões. */}
            {grupoAtual && (
              <button
                onClick={() =>
                  atualizar.mutate({ id: modalidade.id, patch: { categoria_id: null } }, comErro)
                }
                title={`Tirar do grupo ${grupoAtual.nome} (a aula continua na grade, sem cor de grupo)`}
                aria-label={`Tirar ${modalidade.nome} do grupo ${grupoAtual.nome}`}
                className="shrink-0 rounded p-1 text-neutral-400 transition hover:bg-white/70 hover:text-danger-600"
              >
                <X className="size-3.5" />
              </button>
            )}
          </>
        )
      ) : (
        <button
          onClick={() => atualizar.mutate({ id: modalidade.id, patch: { ativa: true } }, comErro)}
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
