import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtData } from '../../lib/datas'
import { fmtCentavos } from '../../lib/dinheiro'
import { usePortalClienteId } from './PortalClienteContext'
import {
  useConfigAgendamento,
  useContratarPlano,
  useMeuSaldo,
  usePlanos,
} from './hooks/usePortalAluna'

function descricaoPlano(p: {
  gera_credito: boolean
  creditos_por_ciclo: number
  periodicidade_dias: number
  validade_creditos_dias: number | null
  renova_automaticamente: boolean
}) {
  if (!p.gera_credito) return 'Horário combinado com o estúdio'
  const n = p.creditos_por_ciclo
  const aulas = `${n} aula${n === 1 ? '' : 's'}`
  if (p.renova_automaticamente) return `${aulas} por mês, em qualquer modalidade`
  const dias = p.validade_creditos_dias ?? p.periodicidade_dias
  return `${aulas} para usar em ${dias} dias`
}

export function PlanosPage() {
  const clienteId = usePortalClienteId()
  const navigate = useNavigate()
  const { data: planos, isLoading } = usePlanos()
  const { data: saldos } = useMeuSaldo()
  const { data: config } = useConfigAgendamento()
  const contratar = useContratarPlano()

  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [contratou, setContratou] = useState(false)

  const planoAtivo = (saldos ?? []).find((s) => (s.saldo ?? 0) > 0)

  function confirmar(planoId: string) {
    setErro(null)
    contratar.mutate(
      { clienteId, planoId },
      {
        onSuccess: () => {
          setConfirmando(null)
          setContratou(true)
        },
        onError: () => setErro('Não foi possível contratar. Tente novamente.'),
      },
    )
  }

  if (contratou) {
    return (
      <div className="pt-10 text-center">
        <div className="mb-3 text-4xl">🎉</div>
        <h1 className="mb-2 text-xl font-semibold text-neutral-900">Plano ativado!</h1>
        <p className="mb-1 text-sm text-neutral-600">Suas aulas já estão liberadas.</p>
        <p className="mb-8 text-xs text-neutral-400">
          O pagamento é combinado direto com o estúdio (PIX ou na recepção).
          Em breve você poderá pagar por aqui, no cartão recorrente.
        </p>
        <button
          onClick={() => navigate('../agenda')}
          className="w-full rounded-md bg-brand-600 py-3 text-sm font-medium text-white hover:bg-brand-700"
        >
          Agendar primeira aula
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Planos</h1>
      <p className="mb-4 text-xs text-neutral-400">
        Escolha e ative na hora — o pagamento é combinado com o estúdio.
      </p>

      {planoAtivo && (
        <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-700">
          {/* A data que importa para ela é a que o CRÉDITO vence, não a
              do ciclo — são diferentes quando o produto tem validade
              própria. Até agora esta caixa nem aparecia: o saldo vinha
              sempre 0 porque faltava policy de leitura no razão. */}
          Você tem {planoAtivo.saldo} aula{planoAtivo.saldo === 1 ? '' : 's'} para usar
          {planoAtivo.proxima_validade
            ? `, até ${fmtData(planoAtivo.proxima_validade)}`
            : `, até ${fmtData(planoAtivo.data_fim)}`}
          .
          {planoAtivo.cancelamento_efetivo_em ? (
            <span className="mt-1 block text-xs">
              Sua assinatura foi cancelada e não será cobrada de novo. Você continua com
              acesso até {fmtData(planoAtivo.cancelamento_efetivo_em)}.
            </span>
          ) : planoAtivo.renova_automaticamente ? (
            <span className="mt-1 block text-xs">
              Renova sozinho em {fmtData(planoAtivo.data_fim)}, com nova cobrança. Para
              parar, fale com o estúdio.
            </span>
          ) : null}
        </div>
      )}

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      <div className="flex flex-col gap-2.5">
        {(planos ?? []).map((p) => (
          <div key={p.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-neutral-900">{p.nome}</span>
              <span className="text-sm font-semibold text-brand-700">
                {p.renova_automaticamente
                  ? `${fmtCentavos(p.preco_centavos)}/mês`
                  : fmtCentavos(p.preco_centavos)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">{descricaoPlano(p)}</p>
            {p.descricao && <p className="mt-0.5 text-xs text-neutral-400">{p.descricao}</p>}

            {/* Recorrência dita antes do botão, não em nota de rodapé.
                O regulamento (1.3) insiste que "sem compromisso" quer
                dizer que dá para cancelar quando quiser — não que a
                cobrança para sozinha. É essa frase que evita a discussão
                de cobrança dois meses depois. */}
            {p.renova_automaticamente && (
              <p className="mt-2 rounded-md bg-brand-50 px-2.5 py-1.5 text-[11px] leading-snug text-brand-700">
                <strong>Cobrança automática a cada {p.periodicidade_dias} dias.</strong>{' '}
                {p.ciclos_compromisso > 1
                  ? `Permanência mínima de ${p.ciclos_compromisso} ciclos.`
                  : 'Renova sozinho até você cancelar.'}
              </p>
            )}

            {config && p.gera_credito && (
              <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-neutral-400">
                <li>
                  • Cancelamento até {p.horas_cancelamento ?? config.horas_cancelamento}h antes
                  devolve o crédito
                </li>
                <li>• Faltou sem cancelar: crédito é consumido</li>
              </ul>
            )}

            {confirmando === p.id ? (
              <div className="mt-3 rounded-md bg-neutral-50 p-2.5 text-xs">
                <p className="text-neutral-600">
                  Contratar <strong>{p.nome}</strong> por {fmtCentavos(p.preco_centavos)}? As
                  aulas são liberadas na hora.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => confirmar(p.id)}
                    disabled={contratar.isPending}
                    className="flex-1 rounded-md bg-brand-600 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {contratar.isPending ? 'Contratando…' : 'Sim, contratar'}
                  </button>
                  <button
                    onClick={() => setConfirmando(null)}
                    className="flex-1 rounded-md border border-neutral-200 py-1.5 text-xs text-neutral-600"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmando(p.id)}
                className="mt-3 w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                Contratar
              </button>
            )}
          </div>
        ))}
        {!isLoading && (planos ?? []).length === 0 && (
          <p className="py-4 text-center text-sm text-neutral-400">
            Nenhum plano disponível no momento.
          </p>
        )}
      </div>
    </div>
  )
}
