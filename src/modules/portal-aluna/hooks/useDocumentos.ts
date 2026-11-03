import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  aceitarContrato,
  definirAutorizacaoImagem,
  enviarAtestado,
  listarMeusAtestados,
  listarMeusContratos,
  listarPerguntasParq,
  montarContrato,
  obterContrato,
  obterSituacaoParq,
  obterVersaoParq,
  pedirLinkDePagamento,
  responderParq,
  type RespostaParq,
} from '../api/documentos'
import { usePortalClienteId } from '../PortalClienteContext'

/**
 * Hooks do Contrato de Adesão e do PAR-Q.
 *
 * O PAR-Q invalida bastante coisa quando muda: ele destrava o
 * agendamento, então responder o questionário tem que refletir na Agenda
 * e no Início na mesma hora. Por isso `invalidarTudoQueDependeDoParq`
 * existe num lugar só, em vez de cada mutação lembrar da lista.
 */

function useInvalidarParq() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['portal-parq-situacao'] })
    qc.invalidateQueries({ queryKey: ['portal-parq-atestados'] })
    // A situação do PAR-Q decide se a Agenda deixa reservar.
    qc.invalidateQueries({ queryKey: ['portal-vagas'] })
    qc.invalidateQueries({ queryKey: ['portal-agendamentos'] })
  }
}

// ---- contrato ----

export function useContrato(solicitacaoId: string | null | undefined) {
  return useQuery({
    queryKey: ['portal-contrato-previa', solicitacaoId],
    queryFn: () => montarContrato(solicitacaoId as string),
    enabled: !!solicitacaoId,
    // A prévia é montada a cada abertura: o preço vem da solicitação e as
    // cláusulas da versão vigente, e as duas podem ter mudado.
    staleTime: 0,
  })
}

export function useAceitarContrato() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: aceitarContrato,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-meus-contratos'] })
      qc.invalidateQueries({ queryKey: ['portal-solicitacao-aberta'] })
      qc.invalidateQueries({ queryKey: ['portal-meus-planos'] })
    },
  })
}

/**
 * O link de pagamento, pedido logo depois do aceite do contrato.
 *
 * Separado do aceite de propósito: se o gateway estiver fora do ar, o
 * aceite **já foi registrado** e não se perde — o aluno vê "contrato
 * aceito" e um aviso de que o link vem por e-mail, em vez de uma falha
 * que o faria tentar aceitar de novo.
 */
export function usePedirLinkDePagamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pedirLinkDePagamento,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-solicitacao-aberta'] }),
  })
}

export function useMeusContratos() {
  return useQuery({ queryKey: ['portal-meus-contratos'], queryFn: listarMeusContratos })
}

export function useContratoAceito(id: string | null) {
  return useQuery({
    queryKey: ['portal-contrato', id],
    queryFn: () => obterContrato(id as string),
    enabled: !!id,
  })
}

// ---- PAR-Q ----

export function useVersaoParq() {
  return useQuery({ queryKey: ['portal-parq-versao'], queryFn: obterVersaoParq })
}

export function usePerguntasParq(versaoId: string | null | undefined) {
  return useQuery({
    queryKey: ['portal-parq-perguntas', versaoId],
    queryFn: () => listarPerguntasParq(versaoId as string),
    enabled: !!versaoId,
  })
}

export function useSituacaoParq() {
  const clienteId = usePortalClienteId()
  return useQuery({
    queryKey: ['portal-parq-situacao', clienteId],
    queryFn: () => obterSituacaoParq(clienteId),
    enabled: !!clienteId,
  })
}

export function useResponderParq() {
  const invalidar = useInvalidarParq()
  return useMutation({
    mutationFn: (args: {
      respostas: RespostaParq[]
      aceitaTermo: boolean
      observacoes?: string | null
      responsavel?: { nome: string; cpf: string; vinculo: string } | null
    }) => responderParq(args),
    onSuccess: invalidar,
  })
}

export function useMeusAtestados() {
  const clienteId = usePortalClienteId()
  return useQuery({
    queryKey: ['portal-parq-atestados', clienteId],
    queryFn: () => listarMeusAtestados(clienteId),
    enabled: !!clienteId,
  })
}

export function useEnviarAtestado() {
  const clienteId = usePortalClienteId()
  const invalidar = useInvalidarParq()
  return useMutation({
    mutationFn: (args: { respostaId: string; arquivo: File; emitidoEm?: string | null }) =>
      enviarAtestado({ ...args, clienteId }),
    onSuccess: invalidar,
  })
}

// ---- imagem ----

export function useAutorizacaoImagem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: definirAutorizacaoImagem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-meu-cliente'] }),
  })
}
