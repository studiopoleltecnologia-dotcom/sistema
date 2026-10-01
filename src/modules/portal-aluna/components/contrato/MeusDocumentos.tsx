import { useState } from 'react'
import { FileText, HeartPulse } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fmtDataCompleta } from '../../datas'
import { Secao } from '../Basicos'
import { Folha } from '../Folha'
import { useContratoAceito, useMeusContratos, useSituacaoParq } from '../../hooks/useDocumentos'
import { DocumentoHtml, EstiloDocumento } from './DocumentoHtml'

function brl(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * "Documentos" em Meu plano: os contratos que o aluno aceitou e a situação
 * do PAR-Q.
 *
 * Mostra o **histórico**, não só o atual: quem contratou três vezes ao
 * longo do tempo tem três contratos, cada um com a versão e as condições
 * daquele momento. É o que responde "o que eu aceitei quando entrei?" —
 * e é por isso que o texto fica congelado na linha, e não é remontado a
 * partir do modelo de hoje.
 */
export function MeusDocumentos() {
  const { data: contratos } = useMeusContratos()
  const { data: parq } = useSituacaoParq()
  const [vendo, setVendo] = useState<string | null>(null)

  const nenhum = (contratos ?? []).length === 0

  return (
    <Secao titulo="Documentos">
      <EstiloDocumento />

      <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {nenhum && (
          <p className="px-4 py-3.5 text-sm text-neutral-500">
            Nenhum Contrato de Adesão por aqui ainda. Ele é gerado quando você contrata um plano.
          </p>
        )}

        {(contratos ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setVendo(c.id)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-neutral-50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FileText className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-neutral-900">
                Contrato de Adesão — {c.produto}
              </span>
              <span className="block text-xs text-neutral-500">
                Aceito em {fmtDataCompleta(c.aceito_em.slice(0, 10))} · versão {c.versao} ·{' '}
                {brl(c.valor_centavos)}
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-brand-700">Visualizar</span>
          </button>
        ))}

        {/* O PAR-Q entra na mesma lista porque, para o aluno, é "meus
            documentos" — mas é link, não visualização: as respostas de
            saúde não ficam penduradas numa tela de plano. */}
        <Link
          to="../saude"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-neutral-50"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <HeartPulse className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-900">
              PAR-Q e Termo de Responsabilidade
            </span>
            <span className="block text-xs text-neutral-500">
              {parq?.situacao === 'nao_preenchido' || !parq
                ? 'Ainda não preenchido'
                : parq.situacao === 'expirado'
                  ? 'Vencido — precisa renovar'
                  : parq.liberado
                    ? `Em dia${parq.validade ? ` até ${fmtDataCompleta(parq.validade)}` : ''}`
                    : 'Pendente de atestado médico'}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-brand-700">Abrir</span>
        </Link>
      </div>

      {vendo && <VerContrato id={vendo} onFechar={() => setVendo(null)} />}
    </Secao>
  )
}

function VerContrato({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { data, isLoading } = useContratoAceito(id)
  return (
    <Folha titulo="Contrato de Adesão" onFechar={onFechar}>
      {isLoading && <p className="py-6 text-sm text-neutral-400">Carregando…</p>}
      {data && (
        <>
          <p className="mb-3 text-xs text-neutral-500">
            Versão {data.versao} · aceito em {fmtDataCompleta(data.aceito_em.slice(0, 10))}
          </p>
          <DocumentoHtml html={data.corpo_html} />
        </>
      )}
    </Folha>
  )
}
