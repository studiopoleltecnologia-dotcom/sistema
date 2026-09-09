import { EyeOff } from 'lucide-react'
import {
  economiaMensal,
  linhaDeApoio,
  precoResumido,
  recorrenciaDoProduto,
  tituloDoProduto,
  type Produto,
} from '../types'

/**
 * Um produto no catálogo — três linhas e nada mais.
 *
 * O que ficou de fora é a decisão de design inteira: custo por aula,
 * frase de cobrança, regras, lista de benefícios e requisitos moram no
 * painel de detalhes. Um cartão que explica o produto todo obriga a LER
 * a tela; um que mostra só o eixo de comparação (quanto entrega, quanto
 * custa) deixa bater o olho e escolher.
 *
 * O título também não repete a navegação: dentro da aba
 * "Por créditos → Semestral", o cartão diz "8 créditos", não
 * "Semestral · 8 créditos".
 *
 * O SEMESTRAL É AMEIXA. A cor não é enfeite — é o que diferencia as duas
 * abas sem escrever "semestral" em cada cartão, e é a mesma ameixa da
 * pastilha e da faixa acima, para o olho ligar as três coisas.
 */
export function ProdutoCard({
  produto: p,
  porId,
  selecionado,
  /**
   * Quando dois produtos da mesma aba têm o mesmo título derivado (dois
   * planos de 4 créditos, por exemplo), o nome aparece para desempatar.
   * Só nesses casos: o nome cadastrado costuma repetir o que a aba e o
   * título já disseram.
   */
  mostrarNome = false,
  onAbrir,
}: {
  produto: Produto
  /** Catálogo por id — o semestral precisa do mensal para calcular a economia. */
  porId: Map<string, Produto>
  selecionado: boolean
  mostrarNome?: boolean
  onAbrir: () => void
}) {
  const apoio = linhaDeApoio(p, porId)
  const arquivado = !p.ativo
  const semestral = recorrenciaDoProduto(p) === 'semestral' && p.renova_automaticamente
  const economia = semestral ? economiaMensal(p, porId) : null

  const borda = arquivado
    ? 'border-dashed border-neutral-200 bg-neutral-50/60 hover:border-neutral-300'
    : semestral
      ? 'border-brand-200 border-l-4 border-l-brand-500 bg-brand-50/50 shadow-sm hover:border-brand-300 hover:shadow-md'
      : 'border-neutral-200/80 bg-white shadow-sm hover:border-neutral-300 hover:shadow-md'

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-pressed={selecionado}
      className={`flex flex-col items-start gap-0.5 rounded-lg border p-4 text-left transition ${
        selecionado ? 'border-brand-500 bg-white shadow-md ring-2 ring-brand-300' : borda
      }`}
    >
      <span
        className={`font-display text-base font-bold leading-tight ${
          arquivado ? 'text-neutral-400' : semestral ? 'text-brand-900' : 'text-neutral-900'
        }`}
      >
        {tituloDoProduto(p)}
      </span>

      <span
        className={`font-display text-xl font-bold leading-tight ${
          arquivado ? 'text-neutral-400' : semestral ? 'text-brand-700' : 'text-neutral-900'
        }`}
      >
        {precoResumido(p)}
      </span>

      {economia !== null ? (
        // A economia é o argumento que decide a venda do semestral
        // (regulamento 2.2), então ganha o único selo sólido do cartão.
        // Verde e não ameixa: dentro de um cartão já ameixa, dinheiro
        // economizado precisa de contraste para não sumir no fundo.
        <span className="mt-1 rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-semibold text-success-700">
          {apoio}
        </span>
      ) : (
        apoio && (
          <span className="line-clamp-1 text-xs leading-snug text-neutral-500" title={apoio}>
            {apoio}
          </span>
        )
      )}

      {mostrarNome && (
        <span className="line-clamp-1 text-[11px] text-neutral-400" title={p.nome}>
          {p.nome}
        </span>
      )}

      {(arquivado || !p.visivel_no_catalogo) && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {arquivado && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
              arquivado
            </span>
          )}
          {!p.visivel_no_catalogo && (
            <span
              title="Só a equipe vende — o aluno não vê no portal"
              className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500"
            >
              <EyeOff className="size-2.5" />
              só a equipe
            </span>
          )}
        </span>
      )}
    </button>
  )
}
