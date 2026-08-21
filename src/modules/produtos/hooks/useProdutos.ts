import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  arquivarProduto,
  atualizarProduto,
  criarProduto,
  definirModalidadesDoProduto,
  definirRequisitosDoProduto,
  listarProdutoModalidades,
  listarProdutos,
  listarRequisitos,
  type RequisitoInput,
} from '../api/produtos'
import type { ProdutoInsert, ProdutoUpdate } from '../types'

export function useProdutos() {
  return useQuery({ queryKey: ['produtos'], queryFn: listarProdutos })
}

export function useProdutoModalidades() {
  return useQuery({ queryKey: ['produto-modalidades'], queryFn: listarProdutoModalidades })
}

export function useRequisitos() {
  return useQuery({ queryKey: ['produto-requisitos'], queryFn: listarRequisitos })
}

function useInvalidarCatalogo() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['produtos'] })
    qc.invalidateQueries({ queryKey: ['produto-modalidades'] })
    qc.invalidateQueries({ queryKey: ['produto-requisitos'] })
  }
}

/**
 * Salvar um produto é sempre três escritas — a linha, as modalidades
 * cobertas e os requisitos. Ficam num hook só para a tela não precisar
 * orquestrar (e não conseguir salvar metade).
 */
export function useSalvarProduto() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({
    mutationFn: async (args: {
      id: string | null
      dados: ProdutoInsert | ProdutoUpdate
      modalidadeIds: string[]
      requisitos: RequisitoInput[]
    }) => {
      const produto = args.id
        ? await atualizarProduto(args.id, args.dados as ProdutoUpdate)
        : await criarProduto(args.dados as ProdutoInsert)
      await definirModalidadesDoProduto(produto.id, args.modalidadeIds)
      await definirRequisitosDoProduto(produto.id, args.requisitos)
      return produto
    },
    onSuccess: invalidar,
  })
}

export function useArquivarProduto() {
  const invalidar = useInvalidarCatalogo()
  return useMutation({ mutationFn: arquivarProduto, onSuccess: invalidar })
}
