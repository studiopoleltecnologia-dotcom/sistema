import { Button } from '../../../components/ui/Button'
import { fmtDiaMes, fmtHora, isoLocal, limiteCancelamento, rotuloDia } from '../datas'
import { Aviso } from './Basicos'
import { Folha } from './Folha'

/**
 * Confirmação de cancelamento de UMA aula agendada.
 *
 * A consequência vem antes do botão, com o horário-limite escrito: "até
 * 15:30" responde a dúvida que "até 4h antes" deixa para o aluno fazer de
 * cabeça. O prazo exibido é o do plano que pagou a aula — o mesmo que
 * `cancelar_agendamento()` aplica.
 */
export function CancelarAula({
  aula,
  horasCancelamento,
  usaCredito,
  pendente,
  erro,
  onConfirmar,
  onFechar,
}: {
  aula: { data: string; horario: string; modalidade: string; professora: string }
  horasCancelamento: number
  usaCredito: boolean
  pendente: boolean
  erro: string | null
  onConfirmar: () => void
  onFechar: () => void
}) {
  const limite = limiteCancelamento(aula.data, aula.horario, horasCancelamento)
  const noPrazo = new Date() < limite
  const horaLimite = `${String(limite.getHours()).padStart(2, '0')}:${String(limite.getMinutes()).padStart(2, '0')}`
  const diaLimite = rotuloDia(isoLocal(limite))
  const dia = rotuloDia(aula.data)

  return (
    <Folha
      titulo="Cancelar esta aula?"
      onFechar={onFechar}
      rodape={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onFechar} disabled={pendente} autoFocus>
            Voltar
          </Button>
          <Button variant="danger" onClick={onConfirmar} loading={pendente}>
            Cancelar aula
          </Button>
        </div>
      }
    >
      <p className="text-sm text-neutral-600">
        <strong className="font-semibold text-neutral-900">{aula.modalidade}</strong>
        {aula.professora && <> com {aula.professora}</>}
        <br />
        {dia}
        {dia.includes(',') ? '' : `, ${fmtDiaMes(aula.data)}`} às {fmtHora(aula.horario)}
      </p>

      <div className="mt-4">
        {!usaCredito ? (
          <Aviso tom="info" titulo="A vaga é liberada para outra pessoa." />
        ) : noPrazo ? (
          <Aviso tom="sucesso" titulo="Dentro do prazo: o crédito volta para o seu saldo.">
            Cancelamento sem perda até {diaLimite.toLowerCase()} às {horaLimite} ({horasCancelamento}h antes da aula).
          </Aviso>
        ) : (
          <Aviso tom="atencao" titulo="Fora do prazo: o crédito não volta.">
            O cancelamento sem perda ia até {diaLimite.toLowerCase()} às {horaLimite} ({horasCancelamento}h
            antes). Cancelar mesmo assim libera a vaga para quem está na lista de espera.
          </Aviso>
        )}
      </div>

      {erro && <p className="mt-3 text-sm text-danger-600">{erro}</p>}
    </Folha>
  )
}
