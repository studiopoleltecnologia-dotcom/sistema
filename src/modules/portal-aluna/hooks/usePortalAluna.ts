import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  agendarAula,
  atualizarMeuCliente,
  cancelarAgendamento,
  contratarPlano,
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

export function useContratarPlano() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: contratarPlano, onSuccess: invalidar })
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
