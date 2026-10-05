import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { desistenciaPossivel, desistirDaContratacao } from '../api/desistencias'

/**
 * Só com o painel da matrícula aberto: a resposta depende do prazo, do
 * que foi pago e das aulas já feitas, e não vale a pena consultar isso
 * para cada cartão da lista.
 */
export function useDesistenciaPossivel(matriculaId: string | null) {
  return useQuery({
    queryKey: ['desistencia', matriculaId],
    queryFn: () => desistenciaPossivel(matriculaId!),
    enabled: Boolean(matriculaId),
  })
}


export function useDesistir() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { matriculaId: string; motivo?: string }) =>
      desistirDaContratacao(a.matriculaId, a.motivo),
    onSuccess: () => {
      // Desfazer a contratação mexe em tudo de uma vez: matrícula,
      // saldo, agenda (as aulas marcadas foram canceladas) e financeiro.
      for (const chave of ['matriculas', 'desistencia', 'desistencias', 'clientes', 'agenda', 'financeiro']) {
        qc.invalidateQueries({ queryKey: [chave] })
      }
    },
  })
}
