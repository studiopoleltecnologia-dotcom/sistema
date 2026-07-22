import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  buscarAluna,
  listarAlunasDaAula,
  listarMeusPagamentos,
  listarMinhasTurmas,
  obterContaProfessora,
  obterMinhaProfessora,
  registrarPresenca,
} from '../api/portalProfessora'

export function useContaProfessora() {
  return useQuery({ queryKey: ['prof-conta'], queryFn: obterContaProfessora })
}

export function useMinhaProfessora() {
  return useQuery({ queryKey: ['prof-cadastro'], queryFn: obterMinhaProfessora })
}

export function useMinhasTurmas() {
  return useQuery({ queryKey: ['prof-turmas'], queryFn: listarMinhasTurmas })
}

export function useAlunasDaAula(turmaId: string, data: string) {
  return useQuery({
    queryKey: ['prof-chamada', turmaId, data],
    queryFn: () => listarAlunasDaAula(turmaId, data),
  })
}

export function useRegistrarPresenca(turmaId: string, data: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { clienteId: string; presente: boolean }) =>
      registrarPresenca({ turmaId, data, ...args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prof-chamada', turmaId, data] })
      // o pagamento previsto deriva das presenças
      qc.invalidateQueries({ queryKey: ['prof-pagamentos'] })
    },
  })
}

export function useBuscarAluna(termo: string) {
  return useQuery({
    queryKey: ['prof-busca-aluna', termo],
    queryFn: () => buscarAluna(termo),
    // a RPC já devolve vazio abaixo de 3 caracteres; evita ida à rede à toa
    enabled: termo.trim().length >= 3,
  })
}

export function useMeusPagamentos() {
  return useQuery({ queryKey: ['prof-pagamentos'], queryFn: listarMeusPagamentos })
}
