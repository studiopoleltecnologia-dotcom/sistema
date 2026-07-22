import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  agendarAula,
  atualizarMeuCliente,
  cancelarReserva,
  contratarPlano,
  criarContaAluna,
  entrarListaEspera,
  listarMinhaFila,
  sairListaEspera,
  listarGradePublica,
  listarMinhasReservas,
  listarPlanos,
  listarVagas,
  obterConfigAgendamento,
  obterContaAluna,
  obterMeuCliente,
  obterMeuSaldo,
  souEquipe,
} from '../api/portalAluna'

export function useContaAluna() {
  return useQuery({ queryKey: ['portal-conta-aluna'], queryFn: obterContaAluna })
}

export function useSouEquipe() {
  return useQuery({ queryKey: ['portal-sou-equipe'], queryFn: souEquipe })
}

export function useCriarContaAluna() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: criarContaAluna,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-conta-aluna'] }),
  })
}

export function useMeuCliente() {
  return useQuery({ queryKey: ['portal-meu-cliente'], queryFn: obterMeuCliente })
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

export function useMinhasReservas() {
  return useQuery({ queryKey: ['portal-reservas'], queryFn: listarMinhasReservas })
}

export function useMinhaFila() {
  return useQuery({ queryKey: ['portal-fila'], queryFn: listarMinhaFila })
}

export function useEntrarListaEspera() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: entrarListaEspera,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-fila'] }),
  })
}

export function useSairListaEspera() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: sairListaEspera,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-fila'] })
      qc.invalidateQueries({ queryKey: ['portal-vagas'] })
    },
  })
}

export function useMeuSaldo() {
  return useQuery({ queryKey: ['portal-saldo'], queryFn: obterMeuSaldo })
}

export function usePlanos() {
  return useQuery({ queryKey: ['portal-planos'], queryFn: listarPlanos })
}

export function useContratarPlano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: contratarPlano,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-saldo'] }),
  })
}

export function useConfigAgendamento() {
  return useQuery({ queryKey: ['portal-config-agendamento'], queryFn: obterConfigAgendamento })
}

function useInvalidarAgenda() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['portal-reservas'] })
    qc.invalidateQueries({ queryKey: ['portal-vagas'] })
    qc.invalidateQueries({ queryKey: ['portal-saldo'] })
  }
}

export function useAgendarAula() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: agendarAula, onSuccess: invalidar })
}

export function useCancelarReserva() {
  const invalidar = useInvalidarAgenda()
  return useMutation({ mutationFn: cancelarReserva, onSuccess: invalidar })
}
