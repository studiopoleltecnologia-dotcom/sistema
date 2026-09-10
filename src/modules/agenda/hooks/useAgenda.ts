import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  agendarAula,
  arquivarCategoria,
  atualizarCategoria,
  atualizarConfigAgendamento,
  atualizarModalidade,
  atualizarSala,
  atualizarTurma,
  cancelarAgendamento,
  contarTurmasPorModalidade,
  contarTurmasPorSala,
  criarCategoria,
  criarModalidade,
  criarSala,
  criarTurma,
  desativarTurma,
  listarCategorias,
  listarTodasModalidades,
  listarDia,
  listarCheckinsPendentes,
  listarModalidades,
  listarNomesProfessoras,
  listarOcupacao,
  listarOcupacaoPeriodo,
  listarSalas,
  listarTodasSalas,
  listarTurmas,
  obterConfigAgendamento,
  registrarPresenca,
  listarAulasSemPresenca,
  listarSuspensoes,
  resolverCheckinPendente,
  revogarSuspensao,
} from '../api/agenda'

export function useTurmas() {
  return useQuery({ queryKey: ['turmas'], queryFn: listarTurmas })
}

export function useNomesProfessoras() {
  return useQuery({ queryKey: ['nomes-professoras'], queryFn: listarNomesProfessoras })
}

export function useSalas() {
  return useQuery({ queryKey: ['salas'], queryFn: listarSalas })
}

/** Cadastro de salas — inclui as desativadas, para poder reativar. */
export function useTodasSalas() {
  return useQuery({ queryKey: ['salas-todas'], queryFn: listarTodasSalas })
}

/** sala_id → nº de turmas ativas nela. */
export function useTurmasPorSala() {
  return useQuery({ queryKey: ['turmas-por-sala'], queryFn: contarTurmasPorSala })
}

/**
 * Escrita de sala invalida `turmas` junto: o nome da sala aparece no cartão
 * da grade e é ele que decide se a semana se divide em colunas por sala.
 */
function useInvalidarSalas() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['salas'] })
    qc.invalidateQueries({ queryKey: ['salas-todas'] })
    qc.invalidateQueries({ queryKey: ['turmas-por-sala'] })
    qc.invalidateQueries({ queryKey: ['turmas'] })
  }
}

export function useCriarSala() {
  const invalidar = useInvalidarSalas()
  return useMutation({ mutationFn: criarSala, onSuccess: invalidar })
}

export function useAtualizarSala() {
  const invalidar = useInvalidarSalas()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof atualizarSala>[1] }) =>
      atualizarSala(id, patch),
    onSuccess: invalidar,
  })
}

export function useModalidades() {
  return useQuery({ queryKey: ['modalidades'], queryFn: listarModalidades })
}

/** Cadastro de modalidades — inclui as arquivadas, para poder reativar. */
export function useTodasModalidades() {
  return useQuery({ queryKey: ['modalidades-todas'], queryFn: listarTodasModalidades })
}

/** modalidade_id → nº de turmas ativas que a usam. */
export function useTurmasPorModalidade() {
  return useQuery({ queryKey: ['turmas-por-modalidade'], queryFn: contarTurmasPorModalidade })
}

export function useAtualizarModalidade() {
  const invalidar = useInvalidarCategorias()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof atualizarModalidade>[1] }) =>
      atualizarModalidade(id, patch),
    onSuccess: invalidar,
  })
}

export function useOcupacao() {
  return useQuery({ queryKey: ['ocupacao-turmas'], queryFn: listarOcupacao })
}

/** Ocupação real do intervalo exibido na grade (semana ou mês). */
export function useOcupacaoPeriodo(inicio: string, fim: string) {
  return useQuery({
    queryKey: ['ocupacao-periodo', inicio, fim],
    queryFn: () => listarOcupacaoPeriodo(inicio, fim),
  })
}

export function useDia(data: string) {
  return useQuery({ queryKey: ['agenda-dia', data], queryFn: () => listarDia(data) })
}

export function useConfigAgendamento() {
  return useQuery({ queryKey: ['config-agendamento'], queryFn: obterConfigAgendamento })
}

function useInvalidarAgenda() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['agenda-dia'] })
    // créditos, financeiro (wellhub) e clientes (ultima_aula) mudam junto
    qc.invalidateQueries({ queryKey: ['saldo-creditos'] })
    qc.invalidateQueries({ queryKey: ['entradas'] })
    qc.invalidateQueries({ queryKey: ['clientes'] })
    qc.invalidateQueries({ queryKey: ['pagamento-professoras'] })
  }
}

export function useCriarTurma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: criarTurma,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turmas'] }),
  })
}

export function useAtualizarTurma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof atualizarTurma>[1] }) =>
      atualizarTurma(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turmas'] }),
  })
}

export function useDesativarTurma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: desativarTurma,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turmas'] }),
  })
}

export function useCriarModalidade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: criarModalidade,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modalidades'] })
      // a turma nova já nasce colorida pela categoria escolhida
      qc.invalidateQueries({ queryKey: ['turmas'] })
    },
  })
}

export function useCategorias() {
  return useQuery({ queryKey: ['categorias-modalidade'], queryFn: listarCategorias })
}

/**
 * Toda escrita de categoria invalida `turmas` junto: a cor do cartão da
 * grade vem daqui, e sem isso a tela só se atualizaria no próximo refetch.
 */
function useInvalidarCategorias() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['categorias-modalidade'] })
    qc.invalidateQueries({ queryKey: ['modalidades'] })
    qc.invalidateQueries({ queryKey: ['modalidades-todas'] })
    qc.invalidateQueries({ queryKey: ['turmas-por-modalidade'] })
    qc.invalidateQueries({ queryKey: ['turmas'] })
  }
}

export function useCriarCategoria() {
  const invalidar = useInvalidarCategorias()
  return useMutation({ mutationFn: criarCategoria, onSuccess: invalidar })
}

export function useAtualizarCategoria() {
  const invalidar = useInvalidarCategorias()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof atualizarCategoria>[1] }) =>
      atualizarCategoria(id, patch),
    onSuccess: invalidar,
  })
}

export function useArquivarCategoria() {
  const invalidar = useInvalidarCategorias()
  return useMutation({ mutationFn: arquivarCategoria, onSuccess: invalidar })
}

export function useAgendarAula() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: agendarAula, onSuccess: invalidar })
}

export function useCancelarAgendamento() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: cancelarAgendamento, onSuccess: invalidar })
}

export function useRegistrarPresenca() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: registrarPresenca, onSuccess: invalidar })
}

export function useCheckinsPendentes() {
  return useQuery({ queryKey: ['checkins-pendentes'], queryFn: listarCheckinsPendentes })
}

export function useResolverCheckinPendente() {
  const qc = useQueryClient()
  const invalidar = useInvalidarAgenda()
  return useMutation({
    mutationFn: resolverCheckinPendente,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkins-pendentes'] })
      invalidar()
    },
  })
}

export function useAtualizarConfigAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: atualizarConfigAgendamento,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-agendamento'] }),
  })
}

/** Regulamento 4.7 — histórico de suspensões, com as vigentes no topo. */
export function useSuspensoes() {
  return useQuery({ queryKey: ['suspensoes'], queryFn: listarSuspensoes })
}

export function useRevogarSuspensao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: revogarSuspensao,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suspensoes'] }),
  })
}

export function useAulasSemPresenca() {
  return useQuery({ queryKey: ['aulas-sem-presenca'], queryFn: listarAulasSemPresenca })
}
