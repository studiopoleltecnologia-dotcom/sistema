import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Clock, Eye, FileText, HeartPulse, Lock } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Modal } from '../../../components/ui/Modal'
import { fmtData } from '../../../lib/datas'
import { fmtCentavos } from '../../../lib/dinheiro'
import { EstiloDocumento } from '../../portal-aluna/components/contrato/DocumentoHtml'
import {
  avaliarAtestado,
  lerParq,
  listarAtestadosDoCliente,
  listarContratosDoCliente,
  obterCorpoContrato,
  obterSituacaoParqDoCliente,
  urlDoAtestado,
} from '../api/documentosCliente'

const SITUACAO_PARQ: Record<string, { rotulo: string; variante: 'success' | 'warning' | 'danger' | 'brand' }> = {
  nao_preenchido: { rotulo: 'Não preenchido', variante: 'warning' },
  apto: { rotulo: 'Apto pelo PAR-Q', variante: 'success' },
  aguardando_documento: { rotulo: 'Aguardando atestado', variante: 'warning' },
  documento_enviado: { rotulo: 'Atestado em análise', variante: 'brand' },
  documento_aprovado: { rotulo: 'Atestado aprovado', variante: 'success' },
  documento_recusado: { rotulo: 'Atestado recusado', variante: 'danger' },
  expirado: { rotulo: 'PAR-Q vencido', variante: 'warning' },
}

/**
 * Documentos do aluno na ficha da gestão.
 *
 * Três coisas que a gestão precisa responder no atendimento, e que antes
 * não tinham onde ser respondidas: **o que ele aceitou**, **quando**, e
 * **se ele pode treinar**.
 *
 * Só a gestão vê — a secretária faz a operação dela sem abrir contrato
 * nem resposta de saúde. O recorte é o mesmo do banco, não só da tela.
 */
export function DocumentosDoCliente({ clienteId }: { clienteId: string }) {
  const contratos = useQuery({
    queryKey: ['cliente-contratos', clienteId],
    queryFn: () => listarContratosDoCliente(clienteId),
  })
  const parq = useQuery({
    queryKey: ['cliente-parq', clienteId],
    queryFn: () => obterSituacaoParqDoCliente(clienteId),
  })
  const atestados = useQuery({
    queryKey: ['cliente-atestados', clienteId],
    queryFn: () => listarAtestadosDoCliente(clienteId),
  })

  const [vendoContrato, setVendoContrato] = useState<string | null>(null)
  const [vendoParq, setVendoParq] = useState<string | null>(null)

  const sit = parq.data?.situacao ?? 'nao_preenchido'
  const { rotulo, variante } = SITUACAO_PARQ[sit] ?? SITUACAO_PARQ.nao_preenchido

  return (
    <>
      <h3 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-neutral-500">
        DOCUMENTOS
      </h3>

      {/* ---- contratos ---- */}
      {(contratos.data ?? []).length === 0 ? (
        <p className="text-xs text-neutral-400">
          Nenhum Contrato de Adesão aceito. Ele é gerado quando o aluno contrata um plano pelo
          portal.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(contratos.data ?? []).map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-md border border-neutral-100 px-2.5 py-2 text-xs"
            >
              <FileText className="size-3.5 shrink-0 text-neutral-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-neutral-800">
                  {(c.resumo as { PLANO_NOME?: string } | null)?.PLANO_NOME ?? 'Plano'}
                </span>
                <span className="block text-neutral-400">
                  {fmtData(c.aceito_em.slice(0, 10))} · versão {c.versao} ·{' '}
                  {fmtCentavos(c.valor_centavos)}
                  {c.matricula_id ? '' : ' · sem matrícula'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setVendoContrato(c.id)}
                className="shrink-0 font-semibold text-brand-700 hover:underline"
              >
                Ver
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ---- PAR-Q ---- */}
      <div className="mt-3 rounded-md border border-neutral-100 px-2.5 py-2">
        <div className="flex items-center gap-2 text-xs">
          <HeartPulse className="size-3.5 shrink-0 text-neutral-400" />
          <span className="flex-1 font-medium text-neutral-800">PAR-Q</span>
          <Badge variant={variante}>{rotulo}</Badge>
        </div>
        {parq.data?.respondido_em && (
          <p className="mt-1 pl-5 text-xs text-neutral-400">
            Respondido em {fmtData(parq.data.respondido_em.slice(0, 10))}
            {parq.data.versao ? ` · versão ${parq.data.versao}` : ''}
            {parq.data.validade ? ` · vale até ${fmtData(parq.data.validade)}` : ''}
          </p>
        )}
        {parq.data?.resposta_id && (
          <button
            type="button"
            onClick={() => setVendoParq(parq.data!.resposta_id!)}
            className="mt-1.5 inline-flex items-center gap-1 pl-5 text-xs font-semibold text-brand-700 hover:underline"
          >
            <Eye className="size-3" />
            Ver respostas
          </button>
        )}
      </div>

      {/* ---- atestados ---- */}
      {(atestados.data ?? []).length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {(atestados.data ?? []).map((a) => (
            <Atestado key={a.id} atestado={a} clienteId={clienteId} />
          ))}
        </ul>
      )}

      {vendoContrato && (
        <VerContrato id={vendoContrato} onFechar={() => setVendoContrato(null)} />
      )}
      {vendoParq && <VerParq id={vendoParq} onFechar={() => setVendoParq(null)} />}
    </>
  )
}

// ------------------------------------------------------------
// Contrato
// ------------------------------------------------------------

function VerContrato({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cliente-contrato-corpo', id],
    queryFn: () => obterCorpoContrato(id),
  })

  return (
    <Modal title="Contrato de Adesão aceito" onFechar={onFechar} size="lg">
      <EstiloDocumento />
      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}
      {data && (
        <>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-neutral-50 p-2.5 text-xs text-neutral-600">
            <span>
              Versão <strong className="text-neutral-900">{data.versao}</strong>
            </span>
            <span>
              Aceito em{' '}
              <strong className="text-neutral-900">
                {new Date(data.aceito_em).toLocaleString('pt-BR')}
              </strong>
            </span>
            {data.ip && (
              <span>
                IP <strong className="text-neutral-900">{data.ip}</strong>
              </span>
            )}
            {/* O hash é o que prova que a linha não foi editada depois.
                Aparece inteiro de propósito: é dele que se precisa numa
                contestação, e truncado não serve. */}
            <span className="w-full break-all">
              Hash do texto: <code className="text-neutral-900">{data.hash_corpo}</code>
            </span>
          </div>
          <div
            className="documento-legal max-h-[60vh] overflow-y-auto text-sm leading-relaxed text-neutral-700"
            dangerouslySetInnerHTML={{ __html: data.corpo_html }}
          />
        </>
      )}
    </Modal>
  )
}

// ------------------------------------------------------------
// PAR-Q
// ------------------------------------------------------------

function VerParq({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cliente-parq-respostas', id],
    queryFn: () => lerParq(id),
    // Cada abertura é um acesso a dado de saúde, e `ler_parq` registra.
    // Cache aqui esconderia acessos do log.
    gcTime: 0,
    staleTime: 0,
  })

  const respostas = (data?.respostas ?? []) as {
    ordem?: number
    texto?: string
    resposta: boolean
  }[]

  return (
    <Modal title="PAR-Q — respostas" onFechar={onFechar} size="lg">
      <div className="mb-3 flex gap-2 rounded-md border border-warning-200 bg-warning-50 p-2.5 text-xs text-warning-800">
        <Lock className="mt-px size-3.5 shrink-0" />
        <span>
          Dado de saúde. O acesso fica registrado com o seu nome. Não compartilhe por WhatsApp nem
          por e-mail.
        </span>
      </div>

      {isLoading && <p className="text-sm text-neutral-400">Carregando…</p>}

      {data && (
        <>
          <ul className="flex flex-col gap-1.5">
            {respostas.map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-md border border-neutral-100 px-2.5 py-2 text-xs"
              >
                <span className="shrink-0 text-neutral-400">{r.ordem ?? i + 1}.</span>
                <span className="flex-1 text-neutral-700">{r.texto ?? '(pergunta removida)'}</span>
                <Badge variant={r.resposta ? 'warning' : 'neutral'}>
                  {r.resposta ? 'Sim' : 'Não'}
                </Badge>
              </li>
            ))}
          </ul>

          {data.observacoes && (
            <p className="mt-3 rounded-md bg-neutral-50 p-2.5 text-xs text-neutral-600">
              <strong>Observações do aluno:</strong> {data.observacoes}
            </p>
          )}

          {data.responsavel_nome && (
            <p className="mt-3 rounded-md border border-neutral-100 p-2.5 text-xs text-neutral-600">
              <strong>Responsável legal:</strong> {data.responsavel_nome} · CPF{' '}
              {data.responsavel_cpf} · {data.responsavel_vinculo}
            </p>
          )}

          <p className="mt-3 text-xs text-neutral-400">
            Termo de Responsabilidade aceito em{' '}
            {data.termo_aceito_em ? new Date(data.termo_aceito_em).toLocaleString('pt-BR') : '—'}
            {data.ip ? ` · IP ${data.ip}` : ''} · versão {data.versao}
          </p>
        </>
      )}
    </Modal>
  )
}

// ------------------------------------------------------------
// Atestado
// ------------------------------------------------------------

function Atestado({
  atestado: a,
  clienteId,
}: {
  atestado: {
    id: string
    arquivo_nome: string
    arquivo_path: string
    enviado_em: string
    emitido_em: string | null
    aprovado: boolean | null
    motivo: string | null
  }
  clienteId: string
}) {
  const qc = useQueryClient()
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const avaliar = useMutation({
    mutationFn: avaliarAtestado,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-atestados', clienteId] })
      qc.invalidateQueries({ queryKey: ['cliente-parq', clienteId] })
      qc.invalidateQueries({ queryKey: ['atestados-pendentes'] })
      setRecusando(false)
      setMotivo('')
    },
    onError: (e) => setErro((e as { message?: string }).message ?? 'Não foi possível salvar.'),
  })

  async function abrir() {
    setErro(null)
    try {
      const url = await urlDoAtestado(a.arquivo_path)
      window.open(url, '_blank', 'noopener')
    } catch {
      setErro('Não foi possível abrir o arquivo.')
    }
  }

  return (
    <li className="rounded-md border border-neutral-100 px-2.5 py-2 text-xs">
      <div className="flex items-center gap-2">
        {a.aprovado === true ? (
          <CircleCheck className="size-3.5 shrink-0 text-success-600" />
        ) : a.aprovado === false ? (
          <CircleAlert className="size-3.5 shrink-0 text-danger-600" />
        ) : (
          <Clock className="size-3.5 shrink-0 text-neutral-400" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-neutral-800">Atestado médico</span>
          <span className="block text-neutral-400">
            Enviado em {fmtData(a.enviado_em.slice(0, 10))}
            {a.emitido_em ? ` · emitido em ${fmtData(a.emitido_em)}` : ''}
          </span>
        </span>
        <button
          type="button"
          onClick={abrir}
          className="shrink-0 font-semibold text-brand-700 hover:underline"
        >
          Abrir
        </button>
      </div>

      {a.aprovado === false && a.motivo && (
        <p className="mt-1 pl-5 text-danger-600">Recusado: {a.motivo}</p>
      )}

      {a.aprovado === null && !recusando && (
        <div className="mt-2 flex gap-2 pl-5">
          <button
            type="button"
            disabled={avaliar.isPending}
            onClick={() => avaliar.mutate({ documentoId: a.id, aprovado: true })}
            className="rounded-md bg-success-600 px-2.5 py-1 font-semibold text-white disabled:opacity-50"
          >
            Aprovar
          </button>
          <button
            type="button"
            onClick={() => setRecusando(true)}
            className="rounded-md border border-neutral-300 px-2.5 py-1 font-semibold text-neutral-600"
          >
            Recusar
          </button>
        </div>
      )}

      {recusando && (
        <div className="mt-2 pl-5">
          {/* Motivo obrigatório, e o banco também recusa sem ele: é o que o
              aluno lê para saber o que refazer. */}
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por que não foi aceito? (o aluno vê)"
            className="mb-1.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-brand-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={avaliar.isPending || !motivo.trim()}
              onClick={() =>
                avaliar.mutate({ documentoId: a.id, aprovado: false, motivo: motivo.trim() })
              }
              className="rounded-md bg-danger-600 px-2.5 py-1 font-semibold text-white disabled:opacity-50"
            >
              Confirmar recusa
            </button>
            <button
              type="button"
              onClick={() => {
                setRecusando(false)
                setMotivo('')
              }}
              className="rounded-md px-2.5 py-1 font-semibold text-neutral-500"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="mt-1 pl-5 text-danger-600">{erro}</p>}
    </li>
  )
}
