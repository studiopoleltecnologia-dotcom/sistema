import { MessageCircle } from 'lucide-react'
import { cn } from '../../../components/ui/cn'
import { linkWhatsApp } from '../contato'

/**
 * "Ficou com dúvida antes de contratar? Fale com a equipe."
 *
 * Aparece onde a decisão acontece — lista de planos, detalhe do plano e
 * pedido de turma fixa. A regra de produto que vale lembrar: o WhatsApp
 * é **apoio, não caminho**. O fluxo digital tem que se resolver sozinho,
 * então este bloco nunca é o CTA principal de uma tela nem substitui um
 * botão que o aluno poderia apertar. Por isso é discreto de propósito.
 *
 * Com o número não configurado (`WHATSAPP_RECEPCAO` vazio) o bloco
 * simplesmente não aparece — melhor nada do que um link para um número
 * errado.
 */
export function AjudaWhatsApp({
  mensagem,
  variante = 'bloco',
  className,
}: {
  /** Mensagem já escrita, para a equipe saber de que tela a pessoa veio. */
  mensagem: string
  /** `bloco` = faixa de rodapé de tela; `linha` = link dentro de uma folha. */
  variante?: 'bloco' | 'linha'
  className?: string
}) {
  const link = linkWhatsApp(mensagem)
  if (!link) return null

  if (variante === 'linha') {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 underline decoration-brand-200 underline-offset-2 transition hover:decoration-brand-500',
          className,
        )}
      >
        <MessageCircle className="size-3.5" />
        Tirar uma dúvida no WhatsApp
      </a>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4',
        className,
      )}
    >
      <div>
        <p className="text-sm font-semibold text-neutral-900">Ficou com alguma dúvida?</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Fale com a nossa equipe antes de contratar — a gente ajuda a escolher.
        </p>
      </div>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
      >
        <MessageCircle className="size-4" />
        WhatsApp
      </a>
    </div>
  )
}
