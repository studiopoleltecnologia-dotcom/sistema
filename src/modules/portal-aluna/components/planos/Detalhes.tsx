import type { ReactNode } from 'react'
import { Check, MessageCircle } from 'lucide-react'
import { cn } from '../../../../components/ui/cn'
import { linkWhatsApp } from '../../contato'
import { LinkFolha } from './Escolhas'
import {
  entregaDoPlano,
  fmtPreco,
  fraseCobranca,
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
function Cobranca({ produto: p, pagamentoCombinado = true }: { produto: Produto; pagamentoCombinado?: boolean }) {
  return (
    <div className="mt-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
      <strong className="font-semibold">{fraseCobranca(p)}</strong>
      {pagamentoCombinado && (
        <> Por enquanto, o pagamento é combinado com o estúdio (PIX ou na recepção).</>
      )}
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
  selos,
  erro,
  pendente,
  onConfirmar,
  onVoltar,
}: {
  produto: Produto
  /** Prazo que devolve o crédito: o do produto, ou a regra da casa. */
  horasCancelamento: number | null
  selos: string[]
  erro: string | null
  pendente: boolean
  onConfirmar: () => void
  onVoltar: () => void
}) {
  const ehPlano = lugarDoProduto(p) !== 'avulso'
  const temCredito = p.gera_credito && p.creditos_por_ciclo > 0

  return (
    <div>
      <Preco produto={p} selos={selos} />

      <Lista>
        {ehPlano ? (
          <>
            <Item>{entregaDoPlano(p)}, em qualquer modalidade da grade</Item>
            {p.acumula_creditos && <Item>Crédito que sobra passa para o mês seguinte</Item>}
          </>
        ) : (
          <>
            {p.descricao && <Item>{p.descricao}</Item>}
            <Item>{resumoAvulso(p)}</Item>
          </>
        )}
        {temCredito && horasCancelamento !== null && (
          <Item>Cancelou até {horasCancelamento}h antes da aula? O crédito volta.</Item>
        )}
        {temCredito && <Item>Faltou sem cancelar, o crédito é consumido.</Item>}
      </Lista>

      <Cobranca produto={p} />

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
export function PedirTurmaFixa({
  produto: p,
  onVerRegras,
  onFechar,
}: {
  produto: Produto
  onVerRegras: () => void
  onFechar: () => void
}) {
  const sufixo = sufixoPreco(p)
  const link = linkWhatsApp(
    `Olá! Quero contratar o plano ${p.nome} (${fmtPreco(p.preco_centavos)}${sufixo}). ` +
      'Pode me ajudar a escolher a turma?',
  )

  return (
    <div>
      <Preco produto={p} />

      <Lista>
        <Item>{entregaDoPlano(p)}</Item>
        <Item>Sua vaga fica reservada: não precisa agendar</Item>
        <Item>Não usa créditos</Item>
      </Lista>

      <Cobranca produto={p} pagamentoCombinado={false} />

      <p className="mt-4 text-sm leading-relaxed text-neutral-600">
        A turma fixa é combinada com a equipe: você escolhe a modalidade e o horário, e a gente
        confirma se tem vaga.
        {!link && ' Fale com a recepção, pessoalmente ou pelo WhatsApp do estúdio.'}
      </p>

      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <MessageCircle className="size-4" />
          Combinar pelo WhatsApp
        </a>
      ) : (
        <button
          onClick={onFechar}
          className="mt-5 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Entendi
        </button>
      )}

      <div className="mt-4 text-center">
        <LinkFolha onClick={onVerRegras}>Ver regras da turma fixa</LinkFolha>
      </div>
    </div>
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
