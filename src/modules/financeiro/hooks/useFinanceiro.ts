import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  atualizarConfig,
  atualizarEntrada,
  criarCategoriaSaida,
  criarEntrada,
  criarRecorrente,
  criarReservaMovimento,
  criarSaida,
  desativarRecorrente,
  excluirEntrada,
  excluirSaida,
  lancarRecorrente,
  listarCategoriasSaida,
  listarEntradas,
  listarMixReceitaMensal,
  listarMixReceitaPeriodo,
  listarRecorrentes,
  listarReserva,
  listarSaidas,
  listarSaidasMensal,
  listarSaidasPeriodo,
  obterConfig,
  obterMei,
  obterSaldoCaixa,
} from '../api/financeiro'
import type { Periodo } from '../periodo'
import type { ConfigFinanceiroUpdate, EntradaInsert, EntradaUpdate } from '../types'

// invalidações em bloco: qualquer lançamento mexe em MEI e resumo
function useInvalidarFinanceiro() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['entradas'] })
    qc.invalidateQueries({ queryKey: ['saidas'] })
    qc.invalidateQueries({ queryKey: ['mei'] })
    qc.invalidateQueries({ queryKey: ['reserva'] })
    qc.invalidateQueries({ queryKey: ['saldo-caixa'] })
  }
}

export function useSaldoCaixa() {
  return useQuery({ queryKey: ['saldo-caixa'], queryFn: obterSaldoCaixa })
}

export function useEntradas(periodo: Periodo) {
  return useQuery({
    queryKey: ['entradas', periodo.inicio, periodo.fim],
    queryFn: () => listarEntradas(periodo),
  })
}

export function useSaidas(periodo: Periodo) {
  return useQuery({
    queryKey: ['saidas', periodo.inicio, periodo.fim],
    queryFn: () => listarSaidas(periodo),
  })
}

export function useCategoriasSaida() {
  return useQuery({ queryKey: ['categorias-saida'], queryFn: listarCategoriasSaida })
}

export function useConfigFinanceiro() {
  return useQuery({ queryKey: ['config-financeiro'], queryFn: obterConfig })
}

export function useMei() {
  return useQuery({ queryKey: ['mei'], queryFn: obterMei })
}

export function useReserva() {
  return useQuery({ queryKey: ['reserva'], queryFn: listarReserva })
}

export function useMixReceitaMensal(meses = 6) {
  return useQuery({
    queryKey: ['mix-receita-mensal', meses],
    queryFn: () => listarMixReceitaMensal(meses),
  })
}

export function useSaidasMensal(meses = 6) {
  return useQuery({
    queryKey: ['saidas-mensal', meses],
    queryFn: () => listarSaidasMensal(meses),
  })
}

export function useMixReceitaPeriodo(periodo: Periodo) {
  return useQuery({
    queryKey: ['mix-receita-periodo', periodo.inicio, periodo.fim],
    queryFn: () => listarMixReceitaPeriodo(periodo),
  })
}

export function useSaidasPeriodo(periodo: Periodo) {
  return useQuery({
    queryKey: ['saidas-periodo', periodo.inicio, periodo.fim],
    queryFn: () => listarSaidasPeriodo(periodo),
  })
}

export function useCriarEntrada() {
  const invalidar = useInvalidarFinanceiro()
  return useMutation({
    mutationFn: (input: EntradaInsert) => criarEntrada(input),
    onSuccess: invalidar,
  })
}

export function useAtualizarEntrada() {
  const invalidar = useInvalidarFinanceiro()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EntradaUpdate }) =>
      atualizarEntrada(id, patch),
    onSuccess: invalidar,
  })
}

export function useExcluirEntrada() {
  const invalidar = useInvalidarFinanceiro()
  return useMutation({ mutationFn: excluirEntrada, onSuccess: invalidar })
}

export function useCriarSaida() {
  const invalidar = useInvalidarFinanceiro()
  return useMutation({ mutationFn: criarSaida, onSuccess: invalidar })
}

export function useExcluirSaida() {
  const invalidar = useInvalidarFinanceiro()
  return useMutation({ mutationFn: excluirSaida, onSuccess: invalidar })
}

export function useRecorrentes() {
  return useQuery({ queryKey: ['recorrentes'], queryFn: listarRecorrentes })
}

export function useCriarRecorrente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: criarRecorrente,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recorrentes'] })
      qc.invalidateQueries({ queryKey: ['saldo-caixa'] })
    },
  })
}

export function useDesativarRecorrente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: desativarRecorrente,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recorrentes'] })
      qc.invalidateQueries({ queryKey: ['saldo-caixa'] })
    },
  })
}

export function useLancarRecorrente() {
  const invalidar = useInvalidarFinanceiro()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: lancarRecorrente,
    onSuccess: () => {
      invalidar()
      qc.invalidateQueries({ queryKey: ['recorrentes'] })
    },
  })
}

export function useCriarCategoriaSaida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: criarCategoriaSaida,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categorias-saida'] }),
  })
}

export function useAtualizarConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: ConfigFinanceiroUpdate) => atualizarConfig(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-financeiro'] })
      qc.invalidateQueries({ queryKey: ['mei'] })
      qc.invalidateQueries({ queryKey: ['saldo-caixa'] })
    },
  })
}

export function useCriarReservaMovimento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: criarReservaMovimento,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reserva'] }),
  })
}
