import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { encerrarRegra, listarRegras, salvarRegra } from '../api/remuneracao'

const CHAVE = ['regras-remuneracao']

export function useRegrasRemuneracao() {
  return useQuery({ queryKey: CHAVE, queryFn: listarRegras })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: CHAVE })
    // A folha prevista lê valor_da_aula(), que resolve contra estas
    // regras: mudar uma regra muda o que a tela de fechamento mostra.
    qc.invalidateQueries({ queryKey: ['pagamento-mes'] })
    qc.invalidateQueries({ queryKey: ['fechamentos-mes'] })
  }
}

export function useSalvarRegra() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: salvarRegra, onSuccess: invalidar })
}

export function useEncerrarRegra() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: string; vigenciaFim: string }) => encerrarRegra(a.id, a.vigenciaFim),
    onSuccess: invalidar,
  })
}
