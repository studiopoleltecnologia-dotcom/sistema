import { ROTULO_MOTIVO_AULA } from '../../agenda/types'
import type { MinhaAulaCancelada } from '../aulas'
import { fmtHora, rotuloDia } from '../datas'
import { Aviso } from './Basicos'

/**
 * "Sua aula de quinta foi cancelada" — no Início e em Aulas agendadas.
 * Diz o motivo e, principalmente, o que aconteceu com o aluno: o crédito
 * voltou, ou a turma fixa ganhou reposição.
 */
export function AvisoAulaCancelada({ aula: a }: { aula: MinhaAulaCancelada }) {
  const consequencia =
    a.origem === 'agendamento'
      ? 'O crédito voltou para o seu saldo — é só agendar outra aula.'
      : a.reposicao
        ? 'Você ganhou 1 crédito de reposição para fazer outra aula.'
        : 'A equipe vai combinar a reposição com você.'

  return (
    <Aviso
      tom="atencao"
      titulo={`${a.modalidade} de ${rotuloDia(a.data).toLowerCase()} às ${fmtHora(a.horario)} foi cancelada`}
    >
      Motivo: {ROTULO_MOTIVO_AULA[a.motivo].toLowerCase()}. {consequencia}
      {a.mensagem && <span className="mt-1 block italic">“{a.mensagem}”</span>}
    </Aviso>
  )
}
