import type { ReactNode } from 'react'
import { fmtPreco } from './planos/catalogo'
import { RegrasTurmaFixa } from './planos/Detalhes'
import { formatoDoPlano } from '../plano'
import type { MeuPlano } from '../types'

/**
 * "Ver regras do plano" — as condições que valem para ESTE contrato, sem
 * jogar o regulamento inteiro na tela.
 *
 * Os números saem do plano e da configuração (antecedência, prazo de
 * cancelamento, limite de aulas, dias de aviso para cancelar). O que é
 * texto puro do regulamento — sem parâmetro que a equipe edite — aparece
 * com o número do item, para o aluno poder conferir no documento.
 */
export function RegrasDoPlano({ plano: p }: { plano: MeuPlano }) {
  const formato = formatoDoPlano(p)
  const semestral = p.ciclos_compromisso > 1
  // Vem de config_agendamento via meus_planos() — nunca número fixo aqui.
  const diasAviso = p.dias_antecedencia_cancelamento

  return (
    <div className="flex flex-col gap-6">
      {formato === 'turma_fixa' ? (
        <Bloco titulo="Sua turma fixa">
          <RegrasTurmaFixa />
        </Bloco>
      ) : (
        <Bloco titulo="Créditos e agendamento">
          <Lista>
            <Regra>
              Cada crédito vale 1 aula
              {p.modalidades?.length
                ? ` de ${p.modalidades.join(', ')}.`
                : ', em qualquer modalidade da grade regular.'}
            </Regra>
            {p.dias_antecedencia_agendamento && (
              <Regra>Você agenda com até {p.dias_antecedencia_agendamento} dias de antecedência.</Regra>
            )}
            <Regra>
              Cancelou ou remarcou até {p.horas_cancelamento}h antes da aula, o crédito volta. Depois disso,
              ou se faltar, ele é considerado usado.
            </Regra>
            {p.max_agendamentos_simultaneos && (
              <Regra>Até {p.max_agendamentos_simultaneos} aulas agendadas ao mesmo tempo.</Regra>
            )}
            <Regra>
              {p.acumula_creditos
                ? 'Crédito que sobra passa para o ciclo seguinte, até o limite de um ciclo do seu plano (item 3.4).'
                : 'Crédito que sobra expira no fim do ciclo (item 3.3).'}
            </Regra>
            <Regra>Os créditos mais antigos são usados primeiro (item 3.5).</Regra>
            <Regra>Créditos não valem para aula particular, treino livre, aulões e workshops (item 3.8).</Regra>
          </Lista>
        </Bloco>
      )}

      <Bloco titulo="Renovação">
        <Lista>
          <Regra>
            O plano renova sozinho a cada {p.periodicidade_dias} dias, com cobrança no meio de pagamento
            combinado, até você pedir o cancelamento (item 1.5).
          </Regra>
          {semestral ? (
            <>
              <Regra>
                Semestral: compromisso de {p.ciclos_compromisso} ciclos, com o valor congelado nesse período.
              </Regra>
              <Regra>
                Ao fim dos {p.ciclos_compromisso} ciclos, o plano não renova por mais {p.ciclos_compromisso}: passa
                a Mensal
                {p.proximo_plano_nome && p.proximo_plano_preco_centavos !== null
                  ? ` (${p.proximo_plano_nome}, ${fmtPreco(p.proximo_plano_preco_centavos)}/mês)`
                  : ''}{' '}
                (item 7.7).
              </Regra>
            </>
          ) : (
            <Regra>Mensal: sem compromisso de permanência — dá para cancelar quando quiser.</Regra>
          )}
        </Lista>
      </Bloco>

      <Bloco titulo="Cancelamento">
        <Lista>
          <Regra>
            Peça pelo portal ou pelo WhatsApp oficial com pelo menos {diasAviso} dias de antecedência da data
            de renovação. Pedido feito depois disso vale para a renovação seguinte (item 7.1).
          </Regra>
          <Regra>O ciclo já pago continua valendo até o fim (item 7.2).</Regra>
          <Regra>Não há reembolso nem conversão em dinheiro depois do início do ciclo (item 7.3).</Regra>
          {semestral && (
            <Regra>
              Sair do semestral antes dos {p.ciclos_compromisso} ciclos devolve o desconto recebido: a diferença
              entre o valor mensal e o semestral do plano, multiplicada pelos ciclos já utilizados (item 7.4).
            </Regra>
          )}
          {semestral && (
            <Regra>Sem cobrança de encerramento com atestado de saúde ou mudança de cidade (item 7.5).</Regra>
          )}
          <Regra>
            Contratou pelo site, WhatsApp ou telefone? Dá para desistir em até 7 dias corridos, com devolução
            integral — descontadas as aulas já feitas pelo valor da avulsa (item 7.6).
          </Regra>
          <Regra>O pedido é confirmado por escrito pela equipe.</Regra>
        </Lista>
      </Bloco>

      <p className="text-xs leading-relaxed text-neutral-400">
        Resumo do regulamento do Studio Pole L. Em caso de dúvida, fale com a equipe pelo WhatsApp oficial ou
        na recepção.
      </p>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{titulo}</h3>
      {children}
    </section>
  )
}

function Lista({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-2.5">{children}</ul>
}

function Regra({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-snug text-neutral-700">
      <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand-400" />
      <span>{children}</span>
    </li>
  )
}
