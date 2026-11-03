import { useState } from 'react'
import { FileText, Loader2, ShieldCheck } from 'lucide-react'
import {
  useAceitarContrato,
  useContrato,
  usePedirLinkDePagamento,
} from '../../hooks/useDocumentos'
import { AjudaWhatsApp } from '../AjudaWhatsApp'
import { DocumentoHtml, EstiloDocumento } from './DocumentoHtml'

/**
 * O passo do contrato, entre escolher o plano e pagar.
 *
 * A ordem não é estética: o aceite acontece **antes** do pagamento
 * porque aceitar depois de pagar é aceite sob pressão, e é exatamente o
 * que não sustenta uma contestação. O banco reforça — `registrar_cobranca`
 * recusa emitir cobrança de contratação sem contrato aceito.
 *
 * O texto não é montado aqui. Vem de `montar_contrato()`, com apenas as
 * cláusulas do produto escolhido: quem compra plano por crédito não
 * recebe cláusula de turma fixa, e quem compra avulso não recebe as de
 * recorrência. Montar no front seria uma segunda implementação da mesma
 * regra condicional, e as duas divergiriam no primeiro ajuste de texto.
 *
 * O checkbox fica **abaixo** do contrato, e não acima: para marcar é
 * preciso rolar até o fim.
 */
export function ContratoPasso({
  solicitacaoId,
  nomeProduto,
  onAceito,
  onVoltar,
}: {
  solicitacaoId: string
  nomeProduto: string
  /**
   * Chamado depois do aceite, com o link de pagamento quando o gateway já
   * devolveu. `null` significa "aceite registrado, link vem por e-mail" —
   * e não falha: o aceite é o que não pode se perder.
   */
  onAceito: (urlPagamento: string | null) => void
  onVoltar: () => void
}) {
  const { data: contrato, isLoading, error } = useContrato(solicitacaoId)
  const aceitar = useAceitarContrato()
  const pedirLink = usePedirLinkDePagamento()
  const [marcado, setMarcado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function confirmar() {
    if (!contrato || !marcado) return
    setErro(null)
    aceitar.mutate(
      { solicitacaoId, versaoId: contrato.versao_id },
      {
        onSuccess: () => {
          // O aceite já está gravado. Pedir o link é o passo SEGUINTE, e a
          // falha dele não pode desfazer nem repetir o aceite — por isso
          // o erro aqui não volta para a tela do contrato: segue adiante
          // sem link, e o e-mail de cobrança cobre o caso.
          pedirLink.mutate(solicitacaoId, {
            onSuccess: (r) => onAceito(r?.url ?? null),
            onError: () => onAceito(null),
          })
        },
        onError: (e) =>
          setErro(
            (e as { message?: string }).message ??
              'Não foi possível registrar o aceite. Tente novamente.',
          ),
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-400">
        <Loader2 className="size-4 animate-spin" />
        Preparando seu contrato…
      </div>
    )
  }

  if (error || !contrato) {
    return (
      <div className="py-6">
        <p className="mb-4 text-sm text-danger-600">
          {(error as { message?: string } | null)?.message ??
            'Não foi possível carregar o contrato.'}
        </p>
        <button
          onClick={onVoltar}
          className="w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-medium text-neutral-700"
        >
          Voltar
        </button>
      </div>
    )
  }

  return (
    <div>
      <EstiloDocumento />

      <div className="mb-4 flex gap-2.5 rounded-lg border border-brand-100 bg-brand-50 p-3 text-xs leading-relaxed text-brand-800">
        <ShieldCheck className="mt-px size-4 shrink-0" />
        <span>
          Este contrato foi gerado para <strong>{nomeProduto}</strong> e contém{' '}
          <strong>apenas as condições deste plano</strong>. Guardamos a versão que você aceitar,
          com data e hora — ela fica em <strong>Meu plano → Documentos</strong>.
        </span>
      </div>

      {/* O documento rola dentro da própria caixa: o botão de aceite fica
          sempre alcançável, sem o aluno ter que rolar a página inteira
          duas vezes. */}
      <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-4">
        <DocumentoHtml html={contrato.corpo_html} />
      </div>

      <p className="mt-2 text-right text-[11px] text-neutral-400">
        Contrato de Adesão · versão {contrato.versao}
      </p>

      <label className="mt-4 flex cursor-pointer gap-3 rounded-xl border border-neutral-200 bg-white p-3.5">
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => {
            setMarcado(e.target.checked)
            setErro(null)
          }}
          className="mt-0.5 size-4 shrink-0 accent-brand-600"
        />
        <span className="text-sm leading-snug text-neutral-700">
          Li e aceito o <strong className="text-neutral-900">Contrato de Adesão</strong> e as
          condições do plano contratado.
        </span>
      </label>

      {erro && <p className="mt-3 text-sm text-danger-600">{erro}</p>}

      <button
        onClick={confirmar}
        disabled={!marcado || aceitar.isPending || pedirLink.isPending}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {aceitar.isPending || pedirLink.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {aceitar.isPending ? 'Registrando…' : 'Gerando o pagamento…'}
          </>
        ) : (
          <>
            <FileText className="size-4" />
            Aceitar e ir para o pagamento
          </>
        )}
      </button>

      <button
        onClick={onVoltar}
        className="mt-1.5 w-full rounded-lg py-2.5 text-sm font-medium text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800"
      >
        Voltar
      </button>

      <div className="mt-3 text-center">
        <AjudaWhatsApp
          variante="linha"
          mensagem={`Olá! Estou no contrato do ${nomeProduto} e tenho uma dúvida:`}
        />
      </div>
    </div>
  )
}
