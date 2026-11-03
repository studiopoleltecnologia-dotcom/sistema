import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  abatimentoDisponivel,
  agendarAula,
  atualizarMeuCliente,
  beneficioConvidado,
  cancelarAgendamento,
  contratarPlano,
  desistirDaPausa,
  desistirDoConvidado,
  indicarConvidado,
  meusConvidados,
  desistirDaSolicitacao,
  direitoAPausa,
  minhaPausa,
  solicitarPausa,
  turmasParaAssentoFixo,
  criarContaAluna,
  entrarListaEspera,
  listarAulasCanceladas,
  listarGradePublica,
  listarMeusAgendamentos,
  listarMeusAgendamentosCanceladosPeloEstudio,
  listarMeusLotes,
  listarMeusPlanos,
  listarMinhaFila,
  listarMinhasTurmasFixas,
  listarPlanos,
  listarRestricoesCatalogo,
  minhaSolicitacaoAberta,
  listarVagas,
  meuCadastroPrevio,
  obterConfigAgendamento,
  obterContaAluna,
  obterMeuCliente,
  obterMinhaSuspensao,
  retirarSolicitacaoCancelamento,
  sairListaEspera,
  solicitarCancelamentoPlano,
  souEquipe,
} from '../api/portalAluna'
import type { ContextoAluno } from '../aulas'
import { hojeIso } from '../datas'
import { usePortalClienteId } from '../PortalClienteContext'

export function useContaAluna() {
  return useQuery({ queryKey: ['portal-conta-aluna'], queryFn: obterContaAluna })
}

export function useSouEquipe() {
  return useQuery({ queryKey: ['portal-sou-equipe'], queryFn: souEquipe })
}

export function useMeuCadastroPrevio() {
  return useQuery({ queryKey: ['portal-cadastro-previo'], queryFn: meuCadastroPrevio })
}

export function useCriarContaAluna() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: criarContaAluna,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-conta-aluna'] }),
  })
}

export function useMeuCliente() {
  const clienteId = usePortalClienteId()
  return useQuery({
    queryKey: ['portal-meu-cliente', clienteId],
    queryFn: () => obterMeuCliente(clienteId),
  })
}

export function useAtualizarMeuCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: Parameters<typeof atualizarMeuCliente>) => atualizarMeuCliente(...args),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-meu-cliente'] }),
  })
}

export function useGradePublica() {
  return useQuery({ queryKey: ['portal-grade'], queryFn: listarGradePublica })
}

export function useVagas(dataInicio: string, dataFim: string) {
  return useQuery({
    queryKey: ['portal-vagas', dataInicio, dataFim],
    queryFn: () => listarVagas(dataInicio, dataFim),
  })
}

export function useMeusAgendamentos() {
  const clienteId = usePortalClienteId()
  const hoje = hojeIso()
  return useQuery({
    queryKey: ['portal-agendamentos', clienteId, hoje],
    queryFn: () => listarMeusAgendamentos(clienteId, hoje),
  })
}

export function useAulasCanceladas() {
  const hoje = hojeIso()
  return useQuery({
    queryKey: ['portal-aulas-canceladas', hoje],
    queryFn: () => listarAulasCanceladas(hoje),
  })
}

export function useMeusCanceladosPeloEstudio() {
  const clienteId = usePortalClienteId()
  const hoje = hojeIso()
  return useQuery({
    queryKey: ['portal-cancelados-estudio', clienteId, hoje],
    queryFn: () => listarMeusAgendamentosCanceladosPeloEstudio(clienteId, hoje),
  })
}

export function useMinhaFila() {
  const clienteId = usePortalClienteId()
  return useQuery({
    queryKey: ['portal-fila', clienteId],
    queryFn: () => listarMinhaFila(clienteId),
  })
}

export function useMeusPlanos() {
  return useQuery({ queryKey: ['portal-meus-planos'], queryFn: listarMeusPlanos })
}

export function useMeusLotes() {
  const clienteId = usePortalClienteId()
  return useQuery({
    queryKey: ['portal-lotes', clienteId],
    queryFn: () => listarMeusLotes(clienteId),
  })
}

export function useMinhasTurmasFixas() {
  const clienteId = usePortalClienteId()
  return useQuery({
    queryKey: ['portal-turmas-fixas', clienteId],
    queryFn: () => listarMinhasTurmasFixas(clienteId),
  })
}

/**
 * Regulamento 4.11 + procedimento interno: "não deixar a pessoa
 * descobrir sozinha na hora de agendar". Por isso o aviso fica na
 * Agenda, antes de ela tentar agendar e levar um erro seco.
 */
export function useMinhaSuspensao() {
  const clienteId = usePortalClienteId()
  const hoje = hojeIso()
  return useQuery({
    queryKey: ['minha-suspensao', clienteId, hoje],
    queryFn: () => obterMinhaSuspensao(clienteId, hoje),
  })
}

export function usePlanos() {
  return useQuery({ queryKey: ['portal-planos'], queryFn: listarPlanos })
}

/**
 * O impedimento de cada produto para este aluno, indexado por produto.
 *
 * Fica separado de `usePlanos()` de propósito: o catálogo é igual para
 * todo mundo e cacheia bem; o veredito é pessoal e muda quando o aluno
 * completa o cadastro ou faz a primeira aula.
 */
export function useRestricoesCatalogo() {
  const q = useQuery({ queryKey: ['portal-restricoes-catalogo'], queryFn: listarRestricoesCatalogo })
  const porProduto = useMemo(() => {
    const m = new Map<string, { motivo: string; codigo: string }>()
    for (const r of q.data ?? []) {
      if (r.motivo) m.set(r.produto_id, { motivo: r.motivo, codigo: r.codigo })
    }
    return m
  }, [q.data])
  return { ...q, porProduto }
}

export function useConfigAgendamento() {
  return useQuery({ queryKey: ['portal-config-agendamento'], queryFn: obterConfigAgendamento })
}

/**
 * O que decide o estado de cada aula para ESTE aluno: planos, créditos,
 * agendamentos, fila, turma fixa e suspensão. Uma costura só, usada pela
 * Agenda, pelo Início e pelas Aulas agendadas — três telas que não podem
 * discordar sobre "posso agendar esta aula?".
 */
export function useContextoAluno() {
  const planos = useMeusPlanos()
  const lotes = useMeusLotes()
  const reservas = useMeusAgendamentos()
  const fila = useMinhaFila()
  const turmasFixas = useMinhasTurmasFixas()
  const suspensao = useMinhaSuspensao()
  const canceladas = useAulasCanceladas()
  const canceladosEstudio = useMeusCanceladosPeloEstudio()

  const hoje = hojeIso()
  const ctx = useMemo<ContextoAluno>(
    () => ({
      hoje,
      agora: new Date(),
      planos: planos.data ?? [],
      lotes: lotes.data ?? [],
      reservas: reservas.data ?? [],
      fila: fila.data ?? [],
      turmasFixas: turmasFixas.data ?? [],
      suspensaoAte: suspensao.data?.fim ?? null,
      canceladas: canceladas.data ?? [],
      canceladosPeloEstudio: canceladosEstudio.data ?? [],
    }),
    [
      hoje,
      planos.data,
      lotes.data,
      reservas.data,
      fila.data,
      turmasFixas.data,
      suspensao.data,
      canceladas.data,
      canceladosEstudio.data,
    ],
  )

  const consultas = [planos, lotes, reservas, fila, turmasFixas, suspensao, canceladas, canceladosEstudio]
  return {
    ctx,
    suspensao: suspensao.data ?? null,
    isLoading: consultas.some((q) => q.isLoading),
    error: consultas.find((q) => q.error)?.error ?? null,
    refetch: () => consultas.forEach((q) => q.refetch()),
  }
}

// ------------------------------------------------------------
// Mutações
// ------------------------------------------------------------

/**
 * Agendar, cancelar e mexer na fila mudam saldo, vagas, "minhas aulas" e
 * o plano ao mesmo tempo. Invalidar tudo num lugar só evita a tela que
 * fica desatualizada porque alguém esqueceu uma chave.
 */
function useInvalidarAgenda() {
  const qc = useQueryClient()
  return () => {
    for (const chave of [
      'portal-agendamentos',
      'portal-vagas',
      'portal-fila',
      'portal-lotes',
      'portal-meus-planos',
    ]) {
      qc.invalidateQueries({ queryKey: [chave] })
    }
  }
}

export function useAgendarAula() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: agendarAula, onSuccess: invalidar })
}

export function useCancelarAgendamento() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: cancelarAgendamento, onSuccess: invalidar })
}

export function useEntrarListaEspera() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: entrarListaEspera, onSuccess: invalidar })
}

export function useSairListaEspera() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: sairListaEspera, onSuccess: invalidar })
}

/**
 * As turmas que aceitam assento fixo, com a vaga de cada uma.
 *
 * `staleTime` curto de propósito: a vaga muda quando outra pessoa reserva,
 * e escolher uma turma que acabou de lotar significa ver o erro do banco
 * no clique de confirmar.
 */
export function useTurmasAssentoFixo(ativo = true) {
  return useQuery({
    queryKey: ['portal-turmas-assento-fixo'],
    queryFn: turmasParaAssentoFixo,
    enabled: ativo,
    staleTime: 30_000,
  })
}

export function useContratarPlano() {
  const invalidar = useInvalidarAgenda()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: contratarPlano,
    onSuccess: () => {
      invalidar()
      qc.invalidateQueries({ queryKey: ['portal-solicitacao-aberta'] })
    },
  })
}

/**
 * O pedido que o aluno deixou pela metade.
 *
 * Existe para RETOMAR, não para informar: quem fecha a aba no passo do
 * contrato volta e encontra `solicitar_contratacao` recusando ("já existe
 * um pedido em aberto"). Sem isto, a saída seria cancelar o pedido e
 * começar de novo — por um clique em "voltar".
 */
/** A pausa em aberto deste aluno — pedida, aprovada ou em curso. */
export function useMinhaPausa() {
  return useQuery({ queryKey: ['portal-pausa'], queryFn: minhaPausa })
}

/**
 * Pode pausar, e por quantos dias.
 *
 * A conta é do banco (`direito_a_pausa`): o limite muda com o formato do
 * plano (15 dias no mensal, 30 no semestral, 90 com atestado), com o
 * intervalo desde a última pausa e com a situação da matrícula. Replicar
 * isso aqui seria a segunda versão da regra, e as duas divergiriam.
 *
 * Só consulta com a folha aberta: a resposta depende do tipo escolhido.
 */
export function useDireitoAPausa(matriculaId: string | null, atestado: boolean) {
  return useQuery({
    queryKey: ['portal-pausa', 'direito', matriculaId, atestado],
    queryFn: () => direitoAPausa(matriculaId!, atestado),
    enabled: Boolean(matriculaId),
  })
}

function useInvalidarPausa() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['portal-pausa'] })
    // A pausa muda o status e a vigência da matrícula, e estica a validade
    // dos créditos — é o que "Meu plano" e a lista de lotes leem.
    qc.invalidateQueries({ queryKey: ['portal-meus-planos'] })
    qc.invalidateQueries({ queryKey: ['portal-lotes'] })
  }
}

export function useSolicitarPausa() {
  const invalidar = useInvalidarPausa()
  return useMutation({ mutationFn: solicitarPausa, onSuccess: invalidar })
}

export function useDesistirDaPausa() {
  const invalidar = useInvalidarPausa()
  return useMutation({ mutationFn: desistirDaPausa, onSuccess: invalidar })
}

export function useDesistirSolicitacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: desistirDaSolicitacao,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-solicitacao-aberta'] }),
  })
}

export function useSolicitacaoAberta() {
  return useQuery({
    queryKey: ['portal-solicitacao-aberta'],
    queryFn: minhaSolicitacaoAberta,
  })
}

export function useSolicitarCancelamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: solicitarCancelamentoPlano,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-meus-planos'] }),
  })
}

export function useRetirarSolicitacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: retirarSolicitacaoCancelamento,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-meus-planos'] }),
  })
}

// ------------------------------------------------------------
// O convidado do semestral (regulamento 11.1)
// ------------------------------------------------------------

/** Os convites deste aluno, do mais recente para o mais antigo. */
export function useMeusConvidados() {
  return useQuery({ queryKey: ['portal-convidados'], queryFn: meusConvidados })
}

/**
 * Tem convidado neste ciclo?
 *
 * Só com a folha aberta. A resposta depende do ciclo corrente e de haver
 * convite consumindo o benefício — conta que o banco já faz em
 * `beneficio_convidado`, e que a tela não repete.
 */
export function useBeneficioConvidado(matriculaId: string | null) {
  return useQuery({
    queryKey: ['portal-convidados', 'beneficio', matriculaId],
    queryFn: () => beneficioConvidado(matriculaId!),
    enabled: Boolean(matriculaId),
  })
}

function useInvalidarConvidado() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['portal-convidados'] })
    // A confirmação do convite cria uma reserva na turma: a vaga que a
    // agenda mostra muda, mesmo sem o aluno ter agendado nada.
    qc.invalidateQueries({ queryKey: ['portal-vagas'] })
  }
}

export function useIndicarConvidado() {
  const invalidar = useInvalidarConvidado()
  return useMutation({ mutationFn: indicarConvidado, onSuccess: invalidar })
}

export function useDesistirDoConvidado() {
  const invalidar = useInvalidarConvidado()
  return useMutation({ mutationFn: desistirDoConvidado, onSuccess: invalidar })
}

/**
 * O abatimento da experimental deste aluno (regulamento 10.1).
 *
 * Fica na tela do catálogo, ANTES de ele escolher: é a informação que
 * faz a pessoa voltar dentro dos 7 dias, e é inútil depois do pedido.
 */
export function useAbatimentoDisponivel() {
  const clienteId = usePortalClienteId()
  return useQuery({
    queryKey: ['portal-abatimento', clienteId],
    queryFn: () => abatimentoDisponivel(clienteId!),
    enabled: Boolean(clienteId),
  })
}
