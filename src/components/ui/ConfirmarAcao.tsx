import { useCallback, useState, type ReactNode } from 'react'
import { AlertTriangle, Archive, CheckCircle2 } from 'lucide-react'
import { Button } from './Button'
import { Modal } from './Modal'

/**
 * Confirmação de ação destrutiva — regra global do sistema: nenhum clique
 * único apaga ou desativa dado.
 *
 * Substitui o `window.confirm` nativo, que era usado em 4 lugares e
 * ignorado em outros 6. Além de destoar visualmente, o nativo não deixa
 * separar "isto arquiva, dá para voltar" de "isto apaga para sempre" — e
 * essa diferença é a informação mais importante do diálogo.
 *
 * Três tons, porque as ações não têm o mesmo peso:
 *   arquivar — some da tela, o histórico continua de pé, dá para reverter
 *   excluir  — a linha deixa de existir. Só para o que não é referenciado
 *              por histórico (ver comentário em cada chamada).
 *   confirmar — não destrói nada, mas move dinheiro ou libera acesso
 *              (renovar ciclo, dar baixa em pagamento). Ganhou o mesmo
 *              duplo-check porque é tão difícil de desfazer na prática
 *              quanto excluir: o crédito já foi para a mão do aluno.
 */
export type TomConfirmacao = 'excluir' | 'arquivar' | 'confirmar'

export type PedidoConfirmacao = {
  titulo: string
  /** O que acontece de fato. Escreva a consequência, não "tem certeza?". */
  descricao?: ReactNode
  tom?: TomConfirmacao
  /** Rótulo do botão destrutivo. O padrão vem do tom. */
  textoConfirmar?: string
  /**
   * Se a tela deve avisar "não pode ser desfeita". Por padrão segue o
   * tom (`excluir` avisa), mas os dois são separáveis: cancelar uma
   * assinatura merece o vermelho de uma ação pesada **e** é reversível.
   * Afirmar o contrário seria mentir para ganhar cautela.
   */
  irreversivel?: boolean
  aoConfirmar: () => void | Promise<void>
}

/**
 * Uso:
 *   const confirmar = useConfirmar()
 *   ...
 *   <button onClick={() => confirmar.pedir({ titulo, descricao, aoConfirmar })} />
 *   ...
 *   {confirmar.dialogo}
 */
export function useConfirmar() {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const [executando, setExecutando] = useState(false)

  const fechar = useCallback(() => {
    // Não deixa fechar no meio da execução: sumir com o diálogo enquanto a
    // exclusão ainda está indo faria a pessoa achar que deu certo.
    if (!executando) setPedido(null)
  }, [executando])

  const confirmar = useCallback(async () => {
    if (!pedido) return
    setExecutando(true)
    try {
      await pedido.aoConfirmar()
      setPedido(null)
    } finally {
      setExecutando(false)
    }
  }, [pedido])

  return {
    pedir: useCallback((p: PedidoConfirmacao) => setPedido(p), []),
    dialogo: pedido ? (
      <ConfirmarAcao
        pedido={pedido}
        executando={executando}
        onConfirmar={confirmar}
        onCancelar={fechar}
      />
    ) : null,
  }
}

const PADRAO: Record<TomConfirmacao, { rotulo: string; icone: typeof AlertTriangle }> = {
  excluir: { rotulo: 'Excluir', icone: AlertTriangle },
  arquivar: { rotulo: 'Arquivar', icone: Archive },
  // Não destrói nada, mas move dinheiro ou libera acesso — e é tão
  // difícil de desfazer na prática quanto excluir, porque o crédito já
  // foi para a mão do aluno. Mesmo duplo-check, sinal visual diferente.
  confirmar: { rotulo: 'Confirmar', icone: CheckCircle2 },
}

export function ConfirmarAcao({
  pedido,
  executando,
  onConfirmar,
  onCancelar,
}: {
  pedido: PedidoConfirmacao
  executando: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  const tom = pedido.tom ?? 'excluir'
  const { rotulo, icone: Icone } = PADRAO[tom]

  return (
    <Modal title={pedido.titulo} onFechar={onCancelar}>
      <div className="flex gap-3">
        <Icone
          className={`mt-0.5 size-5 shrink-0 ${
            tom === 'excluir'
              ? 'text-danger-600'
              : tom === 'confirmar'
                ? 'text-success-600'
                : 'text-warning-600'
          }`}
        />
        <div className="min-w-0 flex-1 text-sm text-neutral-600">
          {pedido.descricao}
          {(pedido.irreversivel ?? tom === 'excluir') && (
            <p className="mt-2 font-medium text-danger-700">Esta ação não pode ser desfeita.</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        {/* Cancelar recebe o foco inicial de propósito: quem chega aqui por
            engano sai apertando Enter, não confirmando. */}
        <Button autoFocus variant="secondary" onClick={onCancelar} disabled={executando}>
          Cancelar
        </Button>
        <Button
          variant={tom === 'excluir' ? 'danger' : 'primary'}
          onClick={onConfirmar}
          loading={executando}
        >
          {pedido.textoConfirmar ?? rotulo}
        </Button>
      </div>
    </Modal>
  )
}
