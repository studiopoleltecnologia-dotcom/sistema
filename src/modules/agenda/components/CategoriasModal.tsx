import { useState, type FormEvent } from 'react'
import { AlertCircle, Archive, ArchiveRestore, Plus, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { cn } from '../../../components/ui/cn'
import { corDaCategoria, corModalidade } from '../cores'
import {
  useArquivarCategoria,
  useAtualizarCategoria,
  useAtualizarModalidade,
  useCategorias,
  useCriarCategoria,
  useCriarModalidade,
  useTodasModalidades,
  useTurmasPorModalidade,
} from '../hooks/useAgenda'
import type { CategoriaModalidade, Modalidade } from '../types'

/**
 * Grupos da grade: nome, cores e **o que está dentro de cada um**.
 *
 * As três coisas moram aqui porque é aqui que se chega. Havia uma segunda
 * tela ("Modalidades") atrás de um ícone de etiqueta na barra, com a edição
 * de conteúdo do grupo; ninguém a encontrava, porque o caminho óbvio é o
 * link "Categorias" logo acima da grade — e quem chegava por ele via as
 * modalidades como **texto morto** ("Pole Dance · Pole Spin · …"), sem como
 * mexer. Duas telas parecidas, uma delas um beco sem saída.
 *
 * Agora é uma só, e os dois botões abrem esta. Cada categoria é um
 * container editável:
 *  * **×** tira a aula do grupo — ela continua ativa e na grade, só perde a
 *    cor. Por isso é botão separado de arquivar, que é outra coisa.
 *  * **Incluir aula** puxa qualquer aula que não esteja aqui, inclusive de
 *    outro grupo; nesse caso o rótulo diz de onde ela sai, porque incluir
 *    em Pole algo que está em Dança é **mover**, e a tela tem que avisar
 *    antes do clique.
 *
 * Três cores por categoria e não uma: o fundo do cartão medido na grade
 * impressa não é uma tinta calculável do acento, e o texto precisa de
 * contraste próprio (o oliva do Condicionamento sobre o fundo dele dá
 * 2,6:1 e some).
 */
export function CategoriasModal({ onFechar }: { onFechar: () => void }) {
  const { data: categorias } = useCategorias()
  const { data: modalidades } = useTodasModalidades()
  const { data: usoPorModalidade } = useTurmasPorModalidade()
  const criarCat = useCriarCategoria()
  const criarMod = useCriarModalidade()
  const arquivar = useArquivarCategoria()

  const [novaCategoria, setNovaCategoria] = useState('')
  const [novaModalidade, setNovaModalidade] = useState('')
  const [grupoDaNova, setGrupoDaNova] = useState('')
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const cats = categorias ?? []
  const lista = modalidades ?? []
  const ativas = lista.filter((m) => m.ativa)
  const arquivadas = lista.filter((m) => !m.ativa)
  const semCategoria = ativas.filter((m) => !m.categoria_id)

  const nomeDaCategoria = (id: string | null) => cats.find((c) => c.id === id)?.nome ?? null

  function adicionarCategoria(e: FormEvent) {
    e.preventDefault()
    const nome = novaCategoria.trim()
    if (!nome) return
    setErro(null)
    criarCat.mutate(
      // Ameixa de partida: cor inventada por nós destoaria da paleta da
      // grade. A equipe escolhe a dela em seguida.
      { nome, cor: '#6B6193', cor_fundo: '#F6F5FA', cor_texto: '#443A66', ordem: 99 },
      { onSuccess: () => setNovaCategoria(''), onError: (err) => setErro((err as Error).message) },
    )
  }

  function adicionarModalidade(e: FormEvent) {
    e.preventDefault()
    const nome = novaModalidade.trim()
    if (!nome) return
    // Duplicata racha a ocupação da mesma aula em linhas diferentes nas
    // Análises — barrar na entrada vale mais que oferecer "mesclar" depois.
    if (lista.some((m) => m.nome.trim().toLowerCase() === nome.toLowerCase())) {
      return setErro(`"${nome}" já existe.`)
    }
    setErro(null)
    criarMod.mutate(
      { nome, categoriaId: grupoDaNova || null },
      {
        onSuccess: () => {
          setNovaModalidade('')
          setGrupoDaNova('')
        },
        onError: (err) => setErro((err as Error).message),
      },
    )
  }

  return (
    <Modal title="Grupos e categorias" onFechar={onFechar} size="lg">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-xs text-neutral-500">
          Cada grupo dá a cor dos cartões da grade. Tire uma aula do grupo no <b>×</b> ou traga
          outra em <b>Incluir aula</b>.
        </p>

        {/* Toda gravação daqui reporta nesta faixa. Antes as mutações de
            modalidade falhavam caladas: o seletor voltava sozinho e a tela
            ficava indistinguível de "não dá para editar". */}
        {erro && (
          <p className="flex items-start gap-1.5 rounded-md bg-danger-50 px-2.5 py-2 text-xs text-danger-700">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0">{erro}</span>
          </p>
        )}

        {/* A pilha sem grupo vem primeiro quando existe: é o que pede ação. */}
        {semCategoria.length > 0 && (
          <section className="min-w-0 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/50 p-2.5">
            <header className="mb-1 flex items-center gap-2 px-0.5">
              <span className="size-2.5 shrink-0 rounded-full bg-neutral-300" />
              <h3 className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wider text-neutral-600">
                Fora de qualquer grupo
              </h3>
              <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
                {semCategoria.length} {semCategoria.length === 1 ? 'aula' : 'aulas'}
              </span>
            </header>
            <p className="mb-1.5 px-0.5 text-[11px] text-neutral-400">
              Aparecem na grade com uma cor provisória, derivada do nome.
            </p>
            <div className="flex min-w-0 flex-col gap-1.5">
              {semCategoria.map((m) => (
                <LinhaModalidade
                  key={m.id}
                  modalidade={m}
                  turmas={usoPorModalidade?.get(m.id) ?? 0}
                  categorias={cats}
                  onErro={setErro}
                />
              ))}
            </div>
          </section>
        )}

        {cats.map((c) => (
          <BlocoCategoria
            key={c.id}
            categoria={c}
            doGrupo={ativas.filter((m) => m.categoria_id === c.id)}
            deFora={ativas.filter((m) => m.categoria_id !== c.id)}
            usoPorModalidade={usoPorModalidade}
            nomeDaCategoria={nomeDaCategoria}
            onErro={setErro}
            confirmandoArquivo={confirmando === c.id}
            onPedirArquivo={() => setConfirmando(c.id)}
            onCancelarArquivo={() => setConfirmando(null)}
            onArquivar={() => {
              arquivar.mutate(c.id, { onError: (err) => setErro((err as Error).message) })
              setConfirmando(null)
            }}
          />
        ))}

        {cats.length === 0 && <p className="text-sm text-neutral-400">Nenhum grupo cadastrado.</p>}

        {arquivadas.length > 0 && (
          <section className="min-w-0 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/50 p-2.5">
            <h3 className="mb-2 px-0.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
              Aulas arquivadas ({arquivadas.length})
            </h3>
            <div className="flex min-w-0 flex-col gap-1.5">
              {arquivadas.map((m) => (
                <LinhaModalidade
                  key={m.id}
                  modalidade={m}
                  turmas={usoPorModalidade?.get(m.id) ?? 0}
                  onErro={setErro}
                />
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4">
          <form onSubmit={adicionarModalidade} className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              value={novaModalidade}
              onChange={(e) => {
                setNovaModalidade(e.target.value)
                setErro(null)
              }}
              placeholder="Nome da nova aula"
              className="min-w-32 flex-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
            />
            <select
              value={grupoDaNova}
              onChange={(e) => setGrupoDaNova(e.target.value)}
              aria-label="Grupo da nova aula"
              className="min-w-0 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500"
            >
              <option value="">Fora de qualquer grupo</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="secondary" loading={criarMod.isPending}>
              Nova aula
            </Button>
          </form>

          <form onSubmit={adicionarCategoria} className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              placeholder="Nome do novo grupo"
              className="min-w-32 flex-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
            />
            <Button type="submit" size="sm" variant="outline" loading={criarCat.isPending}>
              Novo grupo
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  )
}

function BlocoCategoria({
  categoria,
  doGrupo,
  deFora,
  usoPorModalidade,
  nomeDaCategoria,
  onErro,
  confirmandoArquivo,
  onPedirArquivo,
  onCancelarArquivo,
  onArquivar,
}: {
  categoria: CategoriaModalidade
  doGrupo: Modalidade[]
  deFora: Modalidade[]
  usoPorModalidade?: Map<string, number>
  nomeDaCategoria: (id: string | null) => string | null
  onErro: (msg: string) => void
  confirmandoArquivo: boolean
  onPedirArquivo: () => void
  onCancelarArquivo: () => void
  onArquivar: () => void
}) {
  const atualizar = useAtualizarCategoria()
  const atualizarModalidade = useAtualizarModalidade()
  const [nome, setNome] = useState(categoria.nome)
  const cor = corDaCategoria(categoria)

  const salvarNome = () => {
    const limpo = nome.trim()
    if (!limpo || limpo === categoria.nome) return setNome(categoria.nome)
    atualizar.mutate(
      { id: categoria.id, patch: { nome: limpo } },
      { onError: (err) => onErro((err as Error).message) },
    )
  }

  const mudarCor = (patch: Partial<CategoriaModalidade>) =>
    atualizar.mutate(
      { id: categoria.id, patch },
      { onError: (err) => onErro((err as Error).message) },
    )

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 p-2.5">
      <header className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: cor.acento }} />
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={salvarNome}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={`Nome do grupo ${categoria.nome}`}
          // `min-w-44`: com 6rem o nome era espremido pelos três seletores de
          // cor e truncava justamente onde ele identifica o grupo
          // ("Projeto Casinl", "Condicioname"). O cabeçalho tem `flex-wrap`,
          // então o que cede é a fileira de cores, que desce de linha.
          className="min-w-44 flex-1 rounded-md border border-transparent px-1.5 py-1 text-sm font-semibold text-ink outline-none transition hover:border-neutral-200 focus:border-brand-500"
        />
        <SeletorCor titulo="Acento (barra e legenda)" valor={categoria.cor} onChange={(v) => mudarCor({ cor: v })} />
        <SeletorCor titulo="Fundo do cartão" valor={categoria.cor_fundo} onChange={(v) => mudarCor({ cor_fundo: v })} />
        <SeletorCor titulo="Texto sobre o cartão" valor={categoria.cor_texto} onChange={(v) => mudarCor({ cor_texto: v })} />
        {confirmandoArquivo ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
            <span className="text-neutral-500">Arquivar? As aulas ficam sem cor.</span>
            <button onClick={onArquivar} className="font-medium text-danger-600 hover:underline">
              Sim
            </button>
            <button onClick={onCancelarArquivo} className="text-neutral-400 hover:underline">
              Não
            </button>
          </span>
        ) : (
          <button
            onClick={onPedirArquivo}
            className="shrink-0 text-[11px] text-neutral-400 transition hover:text-danger-600"
          >
            Arquivar grupo
          </button>
        )}
      </header>

      <div className="mt-2 flex min-w-0 flex-col gap-1.5">
        {doGrupo.length === 0 && (
          <p className="px-0.5 text-[11px] text-neutral-400">Nenhuma aula neste grupo ainda.</p>
        )}
        {doGrupo.map((m) => (
          <LinhaModalidade
            key={m.id}
            modalidade={m}
            turmas={usoPorModalidade?.get(m.id) ?? 0}
            grupoAtual={categoria}
            onErro={onErro}
          />
        ))}

        {deFora.length > 0 && (
          <label className="mt-0.5 flex min-w-0 items-center gap-1.5 rounded-md border border-dashed border-neutral-300 bg-white/60 px-2 py-1.5 text-neutral-500 transition focus-within:border-brand-400 hover:border-neutral-400">
            <Plus className="size-3.5 shrink-0" />
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value
                if (!id) return
                atualizarModalidade.mutate(
                  { id, patch: { categoria_id: categoria.id } },
                  { onError: (err) => onErro((err as Error).message) },
                )
              }}
              aria-label={`Incluir uma aula no grupo ${categoria.nome}`}
              className="min-w-0 flex-1 cursor-pointer bg-transparent text-xs outline-none"
            >
              <option value="">Incluir aula neste grupo…</option>
              {deFora.map((m) => {
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
        )}
      </div>
    </section>
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
      <span aria-hidden className="h-6 w-1 shrink-0 rounded-full" style={{ background: cor.acento }} />

      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={salvarNome}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label={`Nome da aula ${modalidade.nome}`}
        className="min-w-24 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-ink outline-none transition hover:border-neutral-300 focus:border-brand-500 focus:bg-white"
      />

      <span
        className="shrink-0 text-[11px] tabular-nums text-neutral-500"
        title="Turmas ativas que usam esta aula"
      >
        {turmas} {turmas === 1 ? 'turma' : 'turmas'}
      </span>

      {/* Regulamento 2.3.6: Pole e derivadas, Flexibilidade e Treino Livre
          não podem ser contratados como Mensalidade por Turma Fixa. Mora
          aqui, junto da aula, e não no cadastro do produto, porque a regra
          é da MODALIDADE — vale para todos os planos de turma fixa de uma
          vez. A trava real está no banco (matricular_turma_fixa recusa);
          este botão só decide o valor da coluna. */}
      {modalidade.ativa && (
        <button
          onClick={() =>
            atualizar.mutate(
              { id: modalidade.id, patch: { elegivel_turma_fixa: !modalidade.elegivel_turma_fixa } },
              comErro,
            )
          }
          aria-pressed={modalidade.elegivel_turma_fixa}
          title={
            modalidade.elegivel_turma_fixa
              ? 'Aceita Mensalidade por Turma Fixa — clique para bloquear'
              : 'Não aceita Mensalidade por Turma Fixa (regulamento 2.3.6) — clique para liberar'
          }
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 transition',
            modalidade.elegivel_turma_fixa
              ? 'bg-white/80 text-neutral-600 ring-neutral-300 hover:ring-neutral-400'
              : 'bg-white/60 text-neutral-400 ring-dashed ring-neutral-300 line-through hover:text-neutral-600',
          )}
        >
          turma fixa
        </button>
      )}

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
              title="Arquivar aula (some do seletor de turma nova)"
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
                title={`Tirar do grupo ${grupoAtual.nome} (continua na grade, sem cor de grupo)`}
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
          title="Reativar aula"
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

function SeletorCor({
  titulo,
  valor,
  onChange,
}: {
  titulo: string
  valor: string
  onChange: (v: string) => void
}) {
  // Rascunho local: o seletor nativo dispara `change` a cada movimento do
  // cursor. Gravar nele mandaria dezenas de cores intermediárias ao banco
  // e faria a grade piscar. O commit sai só quando o campo perde o foco.
  const [rascunho, setRascunho] = useState(valor)
  const commit = () => {
    const novo = rascunho.toUpperCase()
    if (novo !== valor.toUpperCase()) onChange(novo)
  }

  return (
    <label
      title={titulo}
      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-neutral-200 px-1.5 py-1"
    >
      <input
        type="color"
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={commit}
        className="size-4 cursor-pointer border-0 bg-transparent p-0"
        aria-label={titulo}
      />
      <span className="font-mono text-[10px] uppercase text-neutral-400">{rascunho}</span>
    </label>
  )
}
