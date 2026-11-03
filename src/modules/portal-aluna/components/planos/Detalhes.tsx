import type { ReactNode } from 'react'
import {
  CalendarCheck,
  Check,
  Clock,
  Hourglass,
  PiggyBank,
  Ticket,
  RefreshCw,
} from 'lucide-react'
import { cn } from '../../../../components/ui/cn'
import { fmtDataCompleta } from '../../datas'
import { AjudaWhatsApp } from '../AjudaWhatsApp'
import { LinkFolha } from './Escolhas'
import { SeletorTurmaPortal } from './SeletorTurmaPortal'
import {
  entregaDoPlano,
  expiracaoDoPlano,
  fmtPreco,
  fraseCobranca,
  frequenciaSemanal,
  lugarDoProduto,
  periodoLabel,
  recorrenciaDoProduto,
  resumoAvulso,
  sufixoPreco,
  tituloDoPlano,
  type Produto,
  type TipoPlano,
} from './catalogo'

// ------------------------------------------------------------
// Peças comuns
// ------------------------------------------------------------

function Lista({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-2.5">{children}</ul>
}

/** Item com ✓ — o que o aluno RECEBE. Regras usam `Regra`, com ponto. */
function Item({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-snug text-neutral-700">
      <Check className="mt-0.5 size-4 shrink-0 text-brand-500" strokeWidth={2.5} />
      <span>{children}</span>
    </li>
  )
}

function Regra({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-snug text-neutral-700">
      <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand-400" />
      <span>{children}</span>
    </li>
  )
}

function Preco({ produto: p, selos = [] }: { produto: Produto; selos?: string[] }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-1">
        <span className="font-display text-3xl font-bold text-neutral-900">
          {p.preco_centavos === 0 ? 'Grátis' : fmtPreco(p.preco_centavos)}
        </span>
        <span className="text-sm font-medium text-neutral-500">{sufixoPreco(p)}</span>
      </div>
      {selos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selos.map((s) => (
            <span
              key={s}
              className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Recorrência dita antes do botão, não em nota de rodapé. O regulamento
 * (1.3) insiste que "sem compromisso" quer dizer que dá para cancelar
 * quando quiser — não que a cobrança para sozinha. É essa frase que evita
 * a discussão de cobrança dois meses depois.
 */
/**
 * O abatimento da aula experimental (regulamento 10.1).
 *
 * Só o que o aluno precisa para decidir: quanto sai desta cobrança, e
 * que é só desta. A segunda parte importa tanto quanto a primeira — sem
 * ela, o valor cheio no mês seguinte parece aumento de preço.
 */
export type Abatimento = { valor_centavos: number; prazo_ate: string | null }

export function AvisoAbatimento({
  abatimento: a,
  preco,
}: {
  abatimento: Abatimento
  preco: number
}) {
  const liquido = Math.max(preco - a.valor_centavos, 0)
  return (
    <div className="mt-4 flex gap-2.5 rounded-lg border border-success-200 bg-success-50 px-3 py-2.5 text-xs leading-relaxed text-success-800">
      <Ticket className="mt-px size-4 shrink-0" />
      <span>
        <strong className="font-semibold">
          {fmtPreco(a.valor_centavos)} da sua aula experimental entram como desconto.
        </strong>{' '}
        Você paga {fmtPreco(liquido)} nesta primeira cobrança; as seguintes voltam ao valor do
        plano.
      </span>
    </div>
  )
}

function Cobranca({ produto: p, comoPaga = true }: { produto: Produto; comoPaga?: boolean }) {
  return (
    <div className="mt-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
      <strong className="font-semibold">{fraseCobranca(p)}</strong>
      {comoPaga && <> Você recebe o link de pagamento por e-mail, com Pix ou cartão.</>}
    </div>
  )
}

/**
 * O que acontece com o crédito que sobra, como bloco próprio.
 *
 * Pedido explícito da gestão (30/09/2026): "créditos não acumulam"
 * precisa ficar MUITO mais claro. Antes era o rabicho de uma frase em
 * cinza claro. Aqui é um bloco com cor de atenção quando expira e cor
 * de benefício quando acumula — a mesma informação, nos dois sentidos,
 * sem o aluno ter que inferir qual é o caso dele.
 */
function Expiracao({ produto: p, ate }: { produto: Produto; ate?: string | null }) {
  // O crédito extra vale "N dias, limitado ao ciclo vigente" — e dizer
  // só o N é dizer meia cláusula para quem está no fim do ciclo. Com a
  // data na mão, a tela diz a que importa.
  const texto = ate ? `Vale até ${fmtDataCompleta(ate)}, o fim do seu ciclo atual` : expiracaoDoPlano(p)
  if (!texto) return null
  const acumula = p.acumula_creditos
  return (
    <div
      className={cn(
        'mt-4 flex gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
        acumula
          ? 'border-success-200 bg-success-50 text-success-800'
          : 'border-warning-200 bg-warning-50 text-warning-800',
      )}
    >
      {acumula ? (
        <PiggyBank className="mt-px size-4 shrink-0" />
      ) : (
        <Hourglass className="mt-px size-4 shrink-0" />
      )}
      <span>
        <strong className="font-semibold">{texto}.</strong>{' '}
        {ate
          ? 'Ele é um extra do plano que você já tem, então acompanha o ciclo dele e não passa para o seguinte.'
          : acumula
            ? `O saldo acumula até ${p.teto_acumulo_ciclos + 1}× os créditos do ciclo, e expira no fim do compromisso de ${p.ciclos_compromisso} meses.`
            : p.renova_automaticamente
              ? 'Os créditos valem só dentro do mês contratado. O que você não usar até a renovação não passa para o mês seguinte.'
              : 'Depois desse prazo o crédito não pode mais ser usado.'}
      </span>
    </div>
  )
}

/** Título da folha de um plano: "8 aulas por mês" + selo do período. */
export function TituloPlano({ produto: p }: { produto: Produto }) {
  if (lugarDoProduto(p) === 'avulso') return <>{p.nome}</>
  const semestral = recorrenciaDoProduto(p) === 'semestral'
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {tituloDoPlano(p)}
      <span
        className={cn(
          'rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold',
          semestral ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-600',
        )}
      >
        {periodoLabel(recorrenciaDoProduto(p))}
      </span>
    </span>
  )
}

// ------------------------------------------------------------
// Confirmar a compra (créditos e avulsos)
// ------------------------------------------------------------

export function ConfirmarCompra({
  produto: p,
  horasCancelamento,
  abatimento,
  validadeAte,
  selos,
  erro,
  pendente,
  onConfirmar,
  onVoltar,
}: {
  produto: Produto
  /** Prazo que devolve o crédito: o do produto, ou a regra da casa. */
  horasCancelamento: number | null
  /** Abatimento da experimental, quando este produto e este aluno têm. */
  abatimento: Abatimento | null
  /** Crédito extra: a data em que ele expira de verdade (fim do ciclo). */
  validadeAte?: string | null
  selos: string[]
  erro: string | null
  pendente: boolean
  onConfirmar: () => void
  onVoltar: () => void
}) {
  const ehPlano = lugarDoProduto(p) !== 'avulso'
  const temCredito = p.gera_credito && p.creditos_por_ciclo > 0
  const frequencia = frequenciaSemanal(p)

  return (
    <div>
      <Preco produto={p} selos={selos} />

      {/*
        "Para quem este plano é indicado" não é campo novo no banco: é a
        `produtos.descricao`, que a equipe já preenche e que estava sendo
        mostrada SÓ nos avulsos. Num plano ela dizia exatamente o que o
        aluno precisa ("Um crédito, todas as modalidades da grade
        regular", "Valor congelado por 6 ciclos") e ficava escondida.
      */}
      {p.descricao && (
        <p className="-mt-1 mb-4 text-sm leading-relaxed text-neutral-600">{p.descricao}</p>
      )}

      <Lista>
        {ehPlano ? (
          <>
            <Item>{entregaDoPlano(p)}, em qualquer modalidade da grade</Item>
            {frequencia && <Item>{frequencia}</Item>}
          </>
        ) : (
          <Item>{resumoAvulso(p)}</Item>
        )}
        {temCredito && horasCancelamento !== null && (
          <Item>Cancelou até {horasCancelamento}h antes da aula? O crédito volta.</Item>
        )}
        {temCredito && <Item>Faltou sem cancelar, o crédito é consumido.</Item>}
      </Lista>

      <Expiracao produto={p} ate={validadeAte} />

      <Cobranca produto={p} />

      {abatimento && <AvisoAbatimento abatimento={abatimento} preco={p.preco_centavos} />}

      {erro && <p className="mt-3 text-sm text-danger-600">{erro}</p>}

      <button
        onClick={onConfirmar}
        disabled={pendente}
        className="mt-5 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {pendente ? 'Confirmando…' : ehPlano ? 'Confirmar contratação' : 'Confirmar compra'}
      </button>
      <button
        onClick={onVoltar}
        className="mt-1.5 w-full rounded-lg py-2.5 text-sm font-medium text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800"
      >
        Voltar
      </button>

      <div className="mt-3 text-center">
        <AjudaWhatsApp
          variante="linha"
          mensagem={`Olá! Tenho uma dúvida antes de contratar o ${p.nome}:`}
        />
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Turma fixa — não é autocompra
// ------------------------------------------------------------

/**
 * A matrícula de turma fixa NÃO passa pelo portal: `matricular()` recusa
 * produto com `turmas_fixas > 0` e `matricular_turma_fixa()` é só da
 * equipe (regulamento 2.3.1 — o assento sai da capacidade da sala e a
 * escolha da turma passa por quem conhece a grade). Antes desta tela o
 * botão "Contratar" chamava a RPC mesmo assim e devolvia um erro seco.
 *
 * Aqui a folha diz a verdade e leva a conversa para a recepção, já com o
 * plano escolhido escrito na mensagem.
 */
/**
 * Pedir uma vaga fixa — o fluxo todo, menos o pagamento.
 *
 * Esta folha era informativa: mostrava o preço e mandava o aluno para o
 * WhatsApp ("a turma fixa é combinada com a equipe"). Quem estava no app
 * às 22h de domingo não contratava.
 *
 * Agora ele escolhe a turma e pede. O que NÃO muda é a ordem: a equipe
 * confirma a vaga antes de existir qualquer cobrança — o assento sai da
 * capacidade da sala (regulamento 2.3.1), e por isso o produto é de
 * `politica_contratacao = 'aprovacao_previa'`, que o banco recusa trocar.
 *
 * O aviso de que nada será cobrado aparece **antes** do botão, não depois
 * do pedido: é a dúvida que decide se a pessoa clica.
 */
export function PedirTurmaFixa({
  produto: p,
  selecionadas,
  onSelecionar,
  onPedir,
  pendente,
  erro,
  onVerRegras,
}: {
  produto: Produto
  selecionadas: string[]
  onSelecionar: (ids: string[]) => void
  onPedir: () => void
  pendente: boolean
  erro: string | null
  onVerRegras: () => void
}) {
  const quantas = p.turmas_fixas || 1
  const completo = selecionadas.length === quantas

  return (
    <div>
      <Preco produto={p} />

      <Lista>
        <Item>{entregaDoPlano(p)}</Item>
        <Item>Sua vaga fica reservada: não precisa agendar</Item>
        <Item>Não usa créditos</Item>
      </Lista>

      <Cobranca produto={p} comoPaga={false} />

      <div className="mt-5">
        <SeletorTurmaPortal
          maximo={quantas}
          selecionadas={selecionadas}
          onChange={onSelecionar}
        />
      </div>

      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-3.5 text-sm leading-relaxed text-brand-800">
        <strong className="font-semibold">Nenhuma cobrança é feita agora.</strong> Como a sua vaga
        fica guardada durante todo o plano, a gente confere se a turma tem lugar antes de qualquer
        pagamento. Você é avisado por e-mail — e só depois disso o pagamento é liberado.
      </div>

      {erro && (
        <p className="mt-3 rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{erro}</p>
      )}

      <button
        onClick={onPedir}
        disabled={!completo || pendente}
        className="mt-4 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pendente
          ? 'Enviando…'
          : completo
            ? 'Pedir esta vaga'
            : `Escolha ${quantas - selecionadas.length} turma${quantas - selecionadas.length > 1 ? 's' : ''}`}
      </button>

      <div className="mt-4 text-center">
        <LinkFolha onClick={onVerRegras}>Ver regras da turma fixa</LinkFolha>
      </div>
    </div>
  )
}
// ------------------------------------------------------------
// Regras à vista, na própria lista de planos
// ------------------------------------------------------------

/**
 * As três regras que mudam a decisão, impressas na tela dos planos.
 *
 * Não substitui `RegrasCreditos` (a lista completa, na folha) — é o
 * recorte do que não pode depender de clique. O critério para entrar
 * aqui é ter custo para o aluno se ele descobrir depois: crédito que
 * expira, prazo que devolve o crédito, e cobrança que se repete.
 *
 * Valem para todos os planos do período em tela, e por isso ficam
 * embaixo dos cartões em vez de repetidas dentro de cada um.
 */
export function RegrasEssenciais({
  tipo,
  referencia: p,
  horasCancelamento,
  className,
}: {
  tipo: TipoPlano
  /** Um plano do período em tela — de onde saem prazo e acúmulo. */
  referencia: Produto | undefined
  horasCancelamento: number | null
  className?: string
}) {
  if (!p) return null

  const itens: { Icone: typeof Hourglass; texto: ReactNode }[] = []

  if (tipo === 'creditos') {
    itens.push({
      Icone: p.acumula_creditos ? PiggyBank : Hourglass,
      texto: p.acumula_creditos ? (
        <>
          Crédito que sobra <strong>acumula</strong> para o mês seguinte, até o fim do compromisso.
        </>
      ) : (
        <>
          Os créditos valem <strong>só dentro do mês contratado</strong> — o que não usar{' '}
          <strong>não acumula</strong> e expira na renovação.
        </>
      ),
    })
  } else {
    itens.push({
      Icone: CalendarCheck,
      texto: (
        <>
          Sua vaga fica <strong>reservada toda semana</strong>: não precisa agendar, e não usa
          crédito.
        </>
      ),
    })
  }

  if (horasCancelamento !== null) {
    itens.push({
      Icone: Clock,
      texto: (
        <>
          Cancelou a aula com <strong>{horasCancelamento}h ou mais</strong> de antecedência? O
          crédito volta. Depois disso, ou se faltar, ele é consumido.
        </>
      ),
    })
  }

  if (p.renova_automaticamente) {
    itens.push({
      Icone: RefreshCw,
      texto:
        p.ciclos_compromisso > 1 ? (
          <>
            Cobrança <strong>automática todo mês</strong>, com permanência mínima de{' '}
            {p.ciclos_compromisso} meses.
          </>
        ) : (
          <>
            Cobrança <strong>automática todo mês</strong>, até você pedir o cancelamento — sem
            multa e sem prazo mínimo.
          </>
        ),
    })
  }

  return (
    <ul className={cn('flex flex-col gap-2 rounded-xl bg-neutral-50 p-3.5', className)}>
      {itens.map(({ Icone, texto }, i) => (
        <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-neutral-600">
          <Icone className="mt-px size-3.5 shrink-0 text-neutral-400" />
          <span>{texto}</span>
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------
// Como funciona
// ------------------------------------------------------------

export function RegrasCreditos({
  referencia: p,
  horasCancelamento,
}: {
  /** Um plano do período em tela — de onde saem prazo e limites. */
  referencia: Produto | undefined
  horasCancelamento: number | null
}) {
  return (
    <Lista>
      <Regra>Cada crédito vale 1 aula, em qualquer modalidade da grade.</Regra>
      {p?.dias_antecedencia_agendamento && (
        <Regra>
          Você agenda pelo portal, com até {p.dias_antecedencia_agendamento} dias de antecedência.
        </Regra>
      )}
      {horasCancelamento !== null && (
        <Regra>
          Cancelou até {horasCancelamento}h antes, o crédito volta. Depois disso, ou se faltar, ele
          é consumido.
        </Regra>
      )}
      {p?.max_agendamentos_simultaneos && (
        <Regra>Até {p.max_agendamentos_simultaneos} aulas agendadas ao mesmo tempo.</Regra>
      )}
      <Regra>Dá para fazer duas aulas no mesmo dia — usa dois créditos.</Regra>
      <Regra>Créditos de plano não valem para aula particular, treino livre, aulões e workshops.</Regra>
    </Lista>
  )
}

export function RegrasTurmaFixa() {
  return (
    <Lista>
      <Regra>
        Você se matricula numa turma da grade — mesma modalidade, dia e horário — e faz aula nela
        1× por semana.
      </Regra>
      <Regra>Não funciona por créditos.</Regra>
      <Regra>A vaga nessa turma fica reservada para você.</Regra>
      <Regra>Faltas não geram reposição nem desconto.</Regra>
      <Regra>Se o estúdio cancelar a aula, a equipe define a reposição.</Regra>
      <Regra>Não vale para Pole Dance e suas variações, nem para Flexibilidade.</Regra>
    </Lista>
  )
}

// ------------------------------------------------------------
// Mensal ou semestral?
// ------------------------------------------------------------

/**
 * A comparação sai dos atributos dos próprios produtos — compromisso,
 * acúmulo, antecedência, convidado, desconto em aulões. Se a equipe mudar
 * uma regra no catálogo, a tabela muda junto; nada aqui é tabela de preço
 * repetida.
 */
export function ComparativoPeriodo({
  tipo,
  mensal,
  semestral,
}: {
  tipo: TipoPlano
  mensal: Produto | undefined
  semestral: Produto | undefined
}) {
  if (!mensal || !semestral) return null

  const linhas: { rotulo: string; m: string; s: string }[] = [
    { rotulo: 'Compromisso', m: 'Nenhum', s: `${semestral.ciclos_compromisso} meses` },
    { rotulo: 'Pagamento', m: 'Mês a mês', s: 'Mês a mês (não é à vista)' },
    { rotulo: 'Valor', m: 'Pode ser reajustado', s: 'Congelado' },
  ]
  if (tipo === 'creditos') {
    linhas.push({
      rotulo: 'Crédito que sobra',
      m: mensal.acumula_creditos ? 'Acumula' : 'Expira',
      s: semestral.acumula_creditos ? 'Acumula' : 'Expira',
    })
  }
  if (mensal.dias_antecedencia_agendamento && semestral.dias_antecedencia_agendamento) {
    linhas.push({
      rotulo: 'Agenda com até',
      m: `${mensal.dias_antecedencia_agendamento} dias`,
      s: `${semestral.dias_antecedencia_agendamento} dias`,
    })
  }
  if (mensal.convidados_por_ciclo > 0 || semestral.convidados_por_ciclo > 0) {
    const conv = (n: number) => (n > 0 ? `${n} por mês` : '—')
    linhas.push({
      rotulo: 'Convidado',
      m: conv(mensal.convidados_por_ciclo),
      s: conv(semestral.convidados_por_ciclo),
    })
  }
  if (mensal.desconto_eventos_pct > 0 || semestral.desconto_eventos_pct > 0) {
    const pct = (n: number) => (n > 0 ? `${Number(n).toLocaleString('pt-BR')}% off` : '—')
    linhas.push({
      rotulo: 'Aulões e workshops',
      m: pct(mensal.desconto_eventos_pct),
      s: pct(semestral.desconto_eventos_pct),
    })
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              <th className="w-[36%] bg-neutral-50 px-3 py-2" />
              <th className="bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-800">Mensal</th>
              <th className="bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Semestral</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {linhas.map((l) => (
              <tr key={l.rotulo}>
                <th scope="row" className="px-3 py-2.5 font-medium text-neutral-500">
                  {l.rotulo}
                </th>
                <td className="px-3 py-2.5 text-neutral-800">{l.m}</td>
                <td className="bg-brand-50/60 px-3 py-2.5 font-medium text-brand-900">{l.s}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 flex flex-col gap-1 text-[11px] leading-snug text-neutral-500">
        {semestral.produto_sucessor_id && (
          <li>
            Depois dos {semestral.ciclos_compromisso} meses, o semestral vira mensal — não renova
            sozinho por mais {semestral.ciclos_compromisso}.
          </li>
        )}
        <li>Sair do semestral antes do fim devolve o desconto já recebido.</li>
      </ul>
    </div>
  )
}
