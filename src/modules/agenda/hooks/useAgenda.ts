import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  agendarAula,
  arquivarCategoria,
  atualizarCategoria,
  atualizarConfigAgendamento,
  atualizarTurma,
  cancelarAgendamento,
  criarCategoria,
  criarModalidade,
  criarTurma,
  definirCategoriaDaModalidade,
  desativarTurma,
  listarCategorias,
  listarDia,
  listarCheckinsPendentes,
  listarModalidades,
  listarNomesProfessoras,
  listarOcupacao,
  listarOcupacaoPeriodo,
  listarSalas,
  listarTurmas,
  obterConfigAgendamento,
  registrarPresenca,
  resolverCheckinPendente,
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

export function useModalidades() {
  return useQuery({ queryKey: ['modalidades'], queryFn: listarModalidades })
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

export function useDefinirCategoriaDaModalidade() {
  const invalidar = useInvalidarCategorias()
  return useMutation({
    mutationFn: ({ modalidadeId, categoriaId }: { modalidadeId: string; categoriaId: string | null }) =>
      definirCategoriaDaModalidade(modalidadeId, categoriaId),
    onSuccess: invalidar,
  })
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
