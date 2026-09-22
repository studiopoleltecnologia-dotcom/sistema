import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { mensagemDoBanco } from '../aulas'
import { diasEntre, fmtDataCompleta, hojeIso } from '../datas'
import { useSolicitarCancelamento } from '../hooks/usePortalAluna'
import { formatoDoPlano } from '../plano'
import type { MeuPlano } from '../types'
import { fmtPreco } from './planos/catalogo'
import { Aviso } from './Basicos'
import { Folha } from './Folha'

/**
 * Pedido de cancelamento (regulamento 7.1).
 *
 * O aluno vê a consequência ANTES de enviar, com as datas do contrato
 * dele — renovação, prazo, até quando fica ativo — e não "solicite com X
 * dias de antecedência". Fora do prazo a folha não esconde nada: diz que a
 * próxima renovação acontece e até quando o plano vale.
 *
 * Todas as datas vêm de `meus_planos()` (calculadas por
 * `regras_cancelamento_plano()`), e é essa mesma função que o banco usa
 * ao gravar o pedido. O que o aluno lê aqui é o que fica registrado.
 *
 * Clicar NÃO cancela: o pedido vai para a gestão, que confirma por escrito.
 */
export function SolicitarCancelamento({ plano: p, onFechar }: { plano: MeuPlano; onFechar: () => void }) {
  const solicitar = useSolicitarCancelamento()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  const dentro = p.dentro_prazo_cancelamento === true
  const renovacao = fmtDataCompleta(p.proxima_renovacao)
  const prazo = fmtDataCompleta(p.prazo_cancelamento)
  const ate = fmtDataCompleta(p.vigente_ate_se_cancelar)
  const turmaFixa = formatoDoPlano(p) === 'turma_fixa'
  const oQueContinua = turmaFixa ? 'sua vaga na turma fixa' : 'os créditos do ciclo já pago'
  const diasDeContrato = diasEntre(p.data_contratacao, hojeIso())

  function enviar() {
    setErro(null)
    solicitar.mutate(
      { matriculaId: p.matricula_id, motivo },
      {
        onSuccess: () => setEnviado(true),
        onError: (e) => setErro(mensagemDoBanco(e, 'Não foi possível enviar a solicitação. Tente de novo.')),
      },
    )
  }

  if (enviado) {
    return (
      <Folha
        titulo="Solicitação enviada"
        onFechar={onFechar}
        rodape={
          <Button className="w-full sm:w-auto" onClick={onFechar}>
            Entendi
          </Button>
        }
      >
        <Aviso tom="sucesso" titulo="Recebemos seu pedido de cancelamento." />
        <p className="mt-4 text-sm leading-relaxed text-neutral-600">
          Seu plano continua ativo normalmente. Pelas regras do seu contrato, ele fica ativo até{' '}
          <strong className="text-neutral-900">{ate}</strong>
          {dentro ? <> e a renovação de {renovacao} não acontece.</> : '.'}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          A equipe confirma o cancelamento por escrito. Você também recebe o comprovante do pedido por e-mail.
        </p>
      </Folha>
    )
  }

  return (
    <Folha
      titulo={dentro ? 'Solicitar cancelamento do plano?' : 'O prazo desta renovação já passou'}
      onFechar={onFechar}
      rodape={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onFechar} disabled={solicitar.isPending} autoFocus>
            Voltar
          </Button>
          <Button variant="danger" onClick={enviar} loading={solicitar.isPending}>
            {dentro ? 'Solicitar cancelamento' : 'Entendi, solicitar cancelamento'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-neutral-600">
        {dentro ? (
          <>
            <p>
              Sua próxima renovação está prevista para <strong className="text-neutral-900">{renovacao}</strong>.
              Pelas regras do seu plano, pedidos feitos até{' '}
              <strong className="text-neutral-900">{prazo}</strong> impedem a próxima renovação.
            </p>
            <Aviso tom="info" titulo={`Ao enviar, seu plano continua ativo normalmente até ${ate}.`}>
              Até lá, {oQueContinua} segue valendo. Depois disso, não há novas cobranças.
            </Aviso>
          </>
        ) : (
          <>
            <Aviso
              tom="atencao"
              titulo={`O prazo para cancelar antes da renovação de ${renovacao} encerrou em ${prazo}.`}
            >
              Pelo regulamento (item 7.1), pedidos feitos com menos de {p.dias_antecedencia_cancelamento} dias
              de antecedência valem para a renovação seguinte.
            </Aviso>
            <p>
              A renovação de <strong className="text-neutral-900">{renovacao}</strong> acontece normalmente
              {p.proximo_plano_preco_centavos !== null && (
                <>, com a cobrança de {fmtPreco(p.proximo_plano_preco_centavos)}</>
              )}
              . Com o pedido feito agora, seu plano fica ativo até{' '}
              <strong className="text-neutral-900">{ate}</strong> e não renova depois disso.
            </p>
          </>
        )}

        {p.saida_antecipada && (
          <Aviso tom="atencao" titulo="Saída antes do fim do semestral">
            O encerramento acontece no ciclo {p.ciclos_utilizados_se_cancelar} de {p.ciclos_compromisso}. Pelo
            item 7.4, sair antes do fim devolve o desconto já recebido
            {p.devolucao_desconto_centavos !== null ? (
              <>
                : <strong>{fmtPreco(p.devolucao_desconto_centavos)}</strong>
              </>
            ) : null}
            . Não há essa cobrança com atestado de saúde ou mudança de cidade (item 7.5) — se for o caso, conte
            no motivo.
          </Aviso>
        )}

        {diasDeContrato <= 7 && (
          <Aviso tom="info" titulo={`Você contratou há ${diasDeContrato === 0 ? 'menos de um dia' : `${diasDeContrato} dia${diasDeContrato === 1 ? '' : 's'}`}.`}>
            Contratações feitas pelo site, WhatsApp ou telefone podem ser desfeitas em até 7 dias corridos,
            com devolução integral — descontadas as aulas já feitas pelo valor da avulsa (item 7.6). Se for o
            seu caso, conte no motivo.
          </Aviso>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Motivo do cancelamento <span className="font-normal text-neutral-400">(opcional)</span>
          </span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Se quiser, conte o motivo — ajuda a gente a melhorar."
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <p className="text-xs text-neutral-400">
          O cancelamento não acontece na hora: a equipe confirma por escrito, conforme o regulamento.
        </p>

        {erro && <p className="text-sm text-danger-600">{erro}</p>}
      </div>
    </Folha>
  )
}
