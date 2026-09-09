import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useClientes } from '../../clientes/hooks/useClientes'
import { useProdutos } from '../../produtos/hooks/useProdutos'
import {
  adicionarTurmaFixa,
  cancelarAssinatura,
  encerrarTurmaFixa,
  listarMatriculaTurmas,
  listarMatriculas,
  listarTurmasDoCliente,
  marcarInadimplente,
  matricular,
  matricularTurmaFixa,
  renovarCiclo,
  trocarTurmaFixa,
} from '../api/matriculas'
import type { MatriculaCompleta, MatriculaTurma } from '../types'

export function useSaldosMatriculas() {
  return useQuery({ queryKey: ['matriculas-saldos'], queryFn: listarMatriculas })
}

export function useMatriculaTurmas() {
  return useQuery({ queryKey: ['matricula-turmas'], queryFn: listarMatriculaTurmas })
}

export function useTurmasDoCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ['matricula-turmas-cliente', clienteId],
    queryFn: () => listarTurmasDoCliente(clienteId!),
    enabled: clienteId !== null,
  })
}

/**
 * Uma matrícula precisa de três fontes (assinatura, produto, assentos) e
 * de uma quarta para o nome do aluno. Costurar isso em cada tela seria
 * repetir a mesma lógica de "esta é de turma fixa?" três vezes — e é
 * exatamente esse tipo de repetição que faz duas telas discordarem.
 */
export function useMatriculasCompletas() {
  const saldos = useSaldosMatriculas()
  const vinculos = useMatriculaTurmas()
  const produtos = useProdutos()
  const clientes = useClientes()

  const lista = useMemo<MatriculaCompleta[]>(() => {
    const porProduto = new Map((produtos.data ?? []).map((p) => [p.id, p]))
    const porCliente = new Map((clientes.data ?? []).map((c) => [c.id, c.nome]))
    const porMatricula = new Map<string, MatriculaTurma[]>()
    for (const v of vinculos.data ?? []) {
      if (!v.matricula_id) continue
      const atual = porMatricula.get(v.matricula_id) ?? []
      atual.push(v)
      porMatricula.set(v.matricula_id, atual)
    }

    return (saldos.data ?? []).map((s) => {
      const produto = s.plano_id ? porProduto.get(s.plano_id) ?? null : null
      const todos = s.matricula_id ? porMatricula.get(s.matricula_id) ?? [] : []
      return {
        saldo: s,
        produto,
        clienteId: s.cliente_id ?? '',
        clienteNome: (s.cliente_id ? porCliente.get(s.cliente_id) : null) ?? '—',
        turmas: todos.filter((t) => t.vigente),
        turmasFuturas: todos.filter((t) => t.futuro),
        turmasEncerradas: todos.filter((t) => !t.vigente && !t.futuro),
        ehTurmaFixa: (produto?.turmas_fixas ?? 0) > 0,
      }
    })
  }, [saldos.data, vinculos.data, produtos.data, clientes.data])

  return {
    data: lista,
    isLoading: saldos.isLoading || produtos.isLoading || clientes.isLoading,
    error: saldos.error ?? vinculos.error ?? produtos.error ?? clientes.error,
  }
}

/**
 * Matricular, renovar, cancelar e mexer em assento mudam coisas que
 * aparecem em quatro telas diferentes (matrículas, ficha do aluno,
 * grade, financeiro). Invalidar tudo de uma vez, num lugar só, evita a
 * tela que fica desatualizada porque alguém esqueceu uma chave.
 */
function useInvalidarMatriculas() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['matriculas-saldos'] })
    qc.invalidateQueries({ queryKey: ['matricula-turmas'] })
    qc.invalidateQueries({ queryKey: ['matricula-turmas-cliente'] })
    qc.invalidateQueries({ queryKey: ['matriculas-cliente'] })
    qc.invalidateQueries({ queryKey: ['saldo-creditos'] })
    qc.invalidateQueries({ queryKey: ['entradas'] })
    // A vaga da turma muda quando um assento nasce ou morre.
    qc.invalidateQueries({ queryKey: ['ocupacao'] })
    qc.invalidateQueries({ queryKey: ['ocupacao-periodo'] })
  }
}

export function useMatricular() {
  const invalidar = useInvalidarMatriculas()
  return useMutation({
    mutationFn: (a: { clienteId: string; produtoId: string; turmaIds: string[] }) =>
      a.turmaIds.length > 0
        ? matricularTurmaFixa(a.clienteId, a.produtoId, a.turmaIds)
        : matricular(a.clienteId, a.produtoId),
    onSuccess: invalidar,
  })
}

export function useRenovarCiclo() {
  const invalidar = useInvalidarMatriculas()
  return useMutation({ mutationFn: renovarCiclo, onSuccess: invalidar })
}

export function useMarcarInadimplente() {
  const invalidar = useInvalidarMatriculas()
  return useMutation({ mutationFn: marcarInadimplente, onSuccess: invalidar })
}

export function useCancelarAssinatura() {
  const invalidar = useInvalidarMatriculas()
  return useMutation({
    mutationFn: (a: { matriculaId: string; motivo?: string }) =>
      cancelarAssinatura(a.matriculaId, a.motivo),
    onSuccess: invalidar,
  })
}

export function useAdicionarTurmaFixa() {
  const invalidar = useInvalidarMatriculas()
  return useMutation({
    mutationFn: (a: { matriculaId: string; turmaId: string }) =>
      adicionarTurmaFixa(a.matriculaId, a.turmaId),
    onSuccess: invalidar,
  })
}

export function useTrocarTurmaFixa() {
  const invalidar = useInvalidarMatriculas()
  return useMutation({
    mutationFn: (a: { vinculoId: string; turmaNovaId: string; imediato?: boolean }) =>
      trocarTurmaFixa(a.vinculoId, a.turmaNovaId, a.imediato),
    onSuccess: invalidar,
  })
}

export function useEncerrarTurmaFixa() {
  const invalidar = useInvalidarMatriculas()
  return useMutation({
    mutationFn: (a: { vinculoId: string; imediato?: boolean; motivo?: string }) =>
      encerrarTurmaFixa(a.vinculoId, { imediato: a.imediato, motivo: a.motivo }),
    onSuccess: invalidar,
  })
}
