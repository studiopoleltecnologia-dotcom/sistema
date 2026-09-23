import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Painel lateral de detalhe — o equivalente do `Modal` para quando a
 * lista precisa continuar visível ao lado.
 *
 * Existe porque não existia: `ClienteDetalhe` e `FechamentoDetalhe`
 * foram escritos à mão, cada um com o seu `fixed inset-y-0 … z-10`, e
 * os dois herdaram o mesmo defeito — **a barra do topo do app é
 * `sticky top-0 z-30`**, então ela era pintada por cima dos primeiros
 * 56px do painel. É justamente onde ficava o cabeçalho com “Editar” e
 * “Fechar”.
 *
 * O efeito para quem usa: o painel abre, mostra os dados, e não tem
 * como editar nem fechar. Os botões estavam lá o tempo todo, embaixo da
 * barra branca.
 *
 * Daí `z-50`: acima da barra (z-30) e do `Modal` (z-40), porque um
 * modal aberto a partir do painel precisa cobri-lo.
 *
 * O que mais mudou em relação às duas versões à mão:
 *
 * · **Esc e clique fora fecham.** Um painel que só fecha por um botão
 *   depende de o botão estar visível — que foi exatamente o que falhou.
 * · **O cabeçalho não rola.** Ele fica fora da área de rolagem, então
 *   as ações continuam alcançáveis com o painel no fim do histórico.
 * · **Largura de tela inteira no celular.** `w-96` fixo passava de 90%
 *   de um telefone e deixava a lista atrás inalcançável.
 */
export function PainelLateral({
  titulo,
  subtitulo,
  acoes,
  onFechar,
  children,
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  /** Botões do cabeçalho, à esquerda do X. */
  acoes?: ReactNode
  onFechar: () => void
  children: ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFechar])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Fundo clicável. Em telas grandes fica quase invisível para a
          lista continuar legível ao lado; o que ele faz é dar uma saída
          além do botão. */}
      <div
        className="absolute inset-0 bg-ink/20 lg:bg-ink/10"
        onClick={onFechar}
        aria-hidden
      />

      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-neutral-100 bg-white shadow-xl sm:w-96">
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-neutral-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-neutral-900">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-xs text-neutral-400">{subtitulo}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {acoes}
            <button
              onClick={onFechar}
              aria-label="Fechar"
              className="rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  )
}
