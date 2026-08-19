import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { corDaCategoria } from '../cores'
import {
  useArquivarCategoria,
  useAtualizarCategoria,
  useCategorias,
  useCriarCategoria,
  useDefinirCategoriaDaModalidade,
  useModalidades,
} from '../hooks/useAgenda'
import type { CategoriaModalidade } from '../types'

/**
 * Cadastro de categorias — nome, as três cores e quais modalidades caem
 * em cada uma.
 *
 * Fica atrás da legenda, e não numa aba própria da Agenda, porque é o
 * cadastro que se abre justamente ao olhar a legenda e pensar "essa cor
 * não é essa". Aba nova seria mais um item competindo por atenção no topo
 * para algo que se mexe uma vez por semestre.
 *
 * Três cores e não uma: o fundo do cartão medido na grade impressa não é
 * uma tinta calculável do acento, e o texto precisa de contraste próprio
 * (o oliva do Condicionamento sobre o fundo dele dá 2,6:1 e some).
 */
export function CategoriasModal({ onFechar }: { onFechar: () => void }) {
  const { data: categorias } = useCategorias()
  const { data: modalidades } = useModalidades()
  const criar = useCriarCategoria()
  const arquivar = useArquivarCategoria()
  const definirCategoria = useDefinirCategoriaDaModalidade()

  const [nova, setNova] = useState('')
  const [confirmando, setConfirmando] = useState<string | null>(null)

  function criarCategoria(e: FormEvent) {
    e.preventDefault()
    const nome = nova.trim()
    if (!nome) return
    criar.mutate(
      // Cinza neutro de partida: cor inventada por nós entraria em conflito
      // com a paleta da grade. A equipe escolhe a dela em seguida.
      { nome, cor: '#6B6193', cor_fundo: '#F6F5FA', cor_texto: '#443A66', ordem: 99 },
      { onSuccess: () => setNova('') },
    )
  }

  const semCategoria = (modalidades ?? []).filter((m) => !m.categoria_id)

  return (
    <Modal title="Categorias de modalidade" onFechar={onFechar} size="lg">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2.5">
          {(categorias ?? []).map((c) => (
            <LinhaCategoria
              key={c.id}
              categoria={c}
              modalidades={(modalidades ?? []).filter((m) => m.categoria_id === c.id)}
              confirmandoArquivo={confirmando === c.id}
              onPedirArquivo={() => setConfirmando(c.id)}
              onCancelarArquivo={() => setConfirmando(null)}
              onArquivar={() => {
                arquivar.mutate(c.id)
                setConfirmando(null)
              }}
            />
          ))}
          {(categorias ?? []).length === 0 && (
            <p className="text-sm text-neutral-400">Nenhuma categoria cadastrada.</p>
          )}
        </div>

        {/* Modalidades órfãs: sem esta lista, a única forma de agrupar uma
            modalidade nova seria adivinhar que ela existe. */}
        {semCategoria.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
              Sem categoria ({semCategoria.length})
            </h3>
            <div className="flex flex-col gap-1.5">
              {semCategoria.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-neutral-700">{m.nome}</span>
                  <select
                    value=""
                    onChange={(e) =>
                      definirCategoria.mutate({
                        modalidadeId: m.id,
                        categoriaId: e.target.value || null,
                      })
                    }
                    className="rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none transition focus:border-brand-500"
                  >
                    <option value="">Escolher categoria…</option>
                    {(categorias ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={criarCategoria} className="flex items-center gap-2 border-t border-neutral-100 pt-4">
          <input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder="Nome da nova categoria"
            className="flex-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-500"
          />
          <Button type="submit" size="sm" variant="secondary" loading={criar.isPending}>
            Adicionar
          </Button>
        </form>
      </div>
    </Modal>
  )
}

function LinhaCategoria({
  categoria,
  modalidades,
  confirmandoArquivo,
  onPedirArquivo,
  onCancelarArquivo,
  onArquivar,
}: {
  categoria: CategoriaModalidade
  modalidades: { id: string; nome: string }[]
  confirmandoArquivo: boolean
  onPedirArquivo: () => void
  onCancelarArquivo: () => void
  onArquivar: () => void
}) {
  const atualizar = useAtualizarCategoria()
  const [nome, setNome] = useState(categoria.nome)
  const cor = corDaCategoria(categoria)

  const salvarNome = () => {
    const limpo = nome.trim()
    if (!limpo || limpo === categoria.nome) return setNome(categoria.nome)
    atualizar.mutate({ id: categoria.id, patch: { nome: limpo } })
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={salvarNome}
          className="min-w-0 flex-1 rounded-md border border-transparent px-1.5 py-1 text-sm font-medium text-neutral-900 outline-none transition hover:border-neutral-200 focus:border-brand-500"
        />
        <SeletorCor
          titulo="Acento (legenda)"
          valor={categoria.cor}
          onChange={(v) => atualizar.mutate({ id: categoria.id, patch: { cor: v } })}
        />
        <SeletorCor
          titulo="Fundo do cartão"
          valor={categoria.cor_fundo}
          onChange={(v) => atualizar.mutate({ id: categoria.id, patch: { cor_fundo: v } })}
        />
        <SeletorCor
          titulo="Texto sobre o cartão"
          valor={categoria.cor_texto}
          onChange={(v) => atualizar.mutate({ id: categoria.id, patch: { cor_texto: v } })}
        />
      </div>

      {/* Amostra do cartão real — trocar a cor sem ver o resultado no
          formato em que ela vai aparecer é chutar. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className="rounded-md border px-2 py-1 text-[11px] leading-tight"
          style={{ background: cor.bg, borderColor: cor.borda }}
        >
          <span className="block font-medium text-neutral-800">
            {modalidades[0]?.nome ?? 'Exemplo de aula'}
          </span>
          <span style={{ color: cor.texto }}>Professora · Sala 1</span>
        </span>
        <span className="flex-1 truncate text-[11px] text-neutral-400">
          {modalidades.length > 0
            ? modalidades.map((m) => m.nome).join(' · ')
            : 'nenhuma modalidade nesta categoria'}
        </span>

        {confirmandoArquivo ? (
          <span className="flex items-center gap-1.5 text-[11px]">
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
            className="text-[11px] text-neutral-400 transition hover:text-danger-600"
          >
            Arquivar
          </button>
        )}
      </div>
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
      className="flex cursor-pointer items-center gap-1 rounded-md border border-neutral-200 px-1.5 py-1"
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
