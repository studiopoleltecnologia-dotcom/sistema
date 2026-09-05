import { useState, type FormEvent } from 'react'
import { ArchiveRestore, Archive, Tag } from 'lucide-react'
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
 * Cadastro de modalidades: nome, categoria e arquivamento.
 *
 * Até aqui a única forma de criar uma modalidade era o "+ criar nova" dentro
 * do formulário de turma, e não havia forma nenhuma de **renomear** ou
 * **arquivar** uma. Na prática isso produzia duplicatas — o DEV tem "Pole
 * Dance", "Pole Dance 1", "Pole Dance 2" e "Pole Dance 1 e 2" convivendo —,
 * e duplicata de modalidade não é só bagunça de cadastro: ela racha a
 * ocupação da mesma aula em linhas diferentes nas Análises.
 *
 * A categoria fica aqui e não só no modal de Categorias porque a pergunta
 * "de que cor é o Jazz?" nasce olhando a modalidade, não a categoria.
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
  const ativas = lista.filter((m) => m.ativa)
  const arquivadas = lista.filter((m) => !m.ativa)

  function criarModalidade(e: FormEvent) {
    e.preventDefault()
    const nome = nova.trim()
    if (!nome) return
    // Duplicata é o problema que esta tela existe para resolver — barrar na
    // entrada vale mais que oferecer o "mesclar" depois.
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
    <Modal title="Modalidades" onFechar={onFechar} size="lg">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          {ativas.map((m) => (
            <LinhaModalidade
              key={m.id}
              modalidade={m}
              categorias={categorias ?? []}
              turmas={usoPorModalidade?.get(m.id) ?? 0}
            />
          ))}
          {ativas.length === 0 && (
            <p className="text-sm text-neutral-400">Nenhuma modalidade cadastrada.</p>
          )}
        </div>

        {arquivadas.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
              Arquivadas ({arquivadas.length})
            </h3>
            <div className="flex flex-col gap-1.5">
              {arquivadas.map((m) => (
                <LinhaModalidade
                  key={m.id}
                  modalidade={m}
                  categorias={categorias ?? []}
                  turmas={usoPorModalidade?.get(m.id) ?? 0}
                />
              ))}
            </div>
          </div>
        )}

        <form
          onSubmit={criarModalidade}
          className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4"
        >
          <input
            value={nova}
            onChange={(e) => {
              setNova(e.target.value)
              setErro(null)
            }}
            placeholder="Nome da nova modalidade"
            className="min-w-0 flex-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
          />
          <select
            value={categoriaNova}
            onChange={(e) => setCategoriaNova(e.target.value)}
            aria-label="Categoria da nova modalidade"
            className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500"
          >
            <option value="">Sem categoria</option>
            {(categorias ?? []).map((c) => (
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
  // ainda não tem categoria. Escolher aqui e descobrir a cor só depois, na
  // grade, é o que fazia a categorização virar tentativa e erro.
  const cor = categoria ? corDaCategoria(categoria) : corModalidade(modalidade.nome)

  const salvarNome = () => {
    const limpo = nome.trim()
    if (!limpo || limpo === modalidade.nome) return setNome(modalidade.nome)
    atualizar.mutate({ id: modalidade.id, patch: { nome: limpo } })
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border py-1.5 pl-2 pr-2.5',
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
        {turmas} turma{turmas === 1 ? '' : 's'}
      </span>

      <select
        value={modalidade.categoria_id ?? ''}
        onChange={(e) =>
          atualizar.mutate({
            id: modalidade.id,
            patch: { categoria_id: e.target.value || null },
          })
        }
        aria-label={`Categoria de ${modalidade.nome}`}
        className="shrink-0 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs outline-none transition focus:border-brand-500"
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
            {/* O aviso é o ponto: arquivar não mexe nas turmas que já usam a
                modalidade — elas continuam na grade. Só some do seletor. */}
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

/** Ícone do botão que abre este modal, para a barra da grade. */
export const IconeModalidades = Tag
