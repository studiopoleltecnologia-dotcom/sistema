import { porCiclo, sufixoCiclo } from '../../lib/ciclo'
import { fmtPreco } from './components/planos/catalogo'
import { hojeIso, somarDias } from './datas'
import type { MeuPlano } from './types'

/**
 * Leitura de uma linha de `meus_planos()` para a tela.
 *
 * Nada aqui calcula prazo: renovação, prazo do pedido de cancelamento e
 * "ativo até" chegam prontos do banco (`regras_cancelamento_plano`). Este
 * arquivo só traduz o que já foi decidido em rótulos — formato, período,
 * situação — para que as três telas que mostram plano (Início, Meu plano,
 * Agenda) usem as mesmas palavras.
 */

/**
 * Os dois formatos do regulamento (1.1) e a compra avulsa. O corte segue
 * o do catálogo (turmas_fixas → turma fixa); a diferença é que plano
 * legado do Wix, que não renova sozinho, continua sendo PLANO para o aluno
 * e não "avulso" — é o contrato dele, não uma aula comprada à parte.
 */
export type FormatoPlano = 'creditos' | 'turma_fixa' | 'pacote'

export function formatoDoPlano(p: MeuPlano): FormatoPlano {
  if (p.turmas_fixas > 0) return 'turma_fixa'
  if (p.renova_automaticamente || p.tipo_produto === 'plano' || p.cancelada_em) return 'creditos'
  return 'pacote'
}

export const FORMATO_ROTULO: Record<FormatoPlano, string> = {
  creditos: 'Por créditos',
  turma_fixa: 'Turma fixa',
  pacote: 'Compra avulsa',
}

/** "Mensal", "Semestral" — ou o número de meses de um plano fora do padrão. */
export function periodoDoPlano(p: MeuPlano): string {
  if (formatoDoPlano(p) === 'pacote') return 'Compra única'
  if (p.ciclos_compromisso <= 1) return 'Mensal'
  if (p.ciclos_compromisso === 6) return 'Semestral'
  return `${p.ciclos_compromisso} meses`
}

function plural(n: number, um: string, varios = `${um}s`) {
  return n === 1 ? um : varios
}

export function fmtCreditos(n: number): string {
  return `${n} ${plural(n, 'crédito')}`
}

/** Título por extenso: "8 créditos por mês", "1 turma fixa". */
export function tituloDoPlano(p: MeuPlano): string {
  const formato = formatoDoPlano(p)
  if (formato === 'turma_fixa') {
    return `${p.turmas_fixas} ${plural(p.turmas_fixas, 'turma fixa', 'turmas fixas')}`
  }
  if (formato === 'pacote') return p.plano_nome
  return `${fmtCreditos(p.creditos_por_ciclo)} ${porCiclo(p)}`
}

/** "R$ 290/mês" */
export function precoDoPlano(p: MeuPlano): string {
  if (formatoDoPlano(p) === 'pacote') return fmtPreco(p.preco_centavos)
  return `${fmtPreco(p.preco_centavos)}${sufixoCiclo(p)}`
}

// ------------------------------------------------------------
// Situação
// ------------------------------------------------------------

export type Situacao =
  | 'ativo'
  | 'aguardando_pagamento'
  | 'pagamento_atrasado'
  | 'cancelamento_solicitado'
  | 'cancelamento_confirmado'
  | 'pausado'
  | 'expirado'
  | 'encerrado'

type Variante = 'brand' | 'success' | 'warning' | 'danger' | 'neutral'

export const SITUACAO: Record<Situacao, { rotulo: string; variante: Variante }> = {
  ativo: { rotulo: 'Ativo', variante: 'success' },
  aguardando_pagamento: { rotulo: 'Aguardando pagamento', variante: 'warning' },
  pagamento_atrasado: { rotulo: 'Pagamento em atraso', variante: 'danger' },
  cancelamento_solicitado: { rotulo: 'Cancelamento solicitado', variante: 'warning' },
  cancelamento_confirmado: { rotulo: 'Cancelado · ainda ativo', variante: 'neutral' },
  pausado: { rotulo: 'Pausado', variante: 'neutral' },
  expirado: { rotulo: 'Expirado', variante: 'neutral' },
  encerrado: { rotulo: 'Cancelado', variante: 'neutral' },
}

/**
 * A ordem das perguntas é a ordem de importância para o aluno: um plano
 * encerrado não está "aguardando pagamento", e um pedido de cancelamento
 * em análise é mais relevante que a cobrança do mês.
 */
export function situacaoDoPlano(p: MeuPlano, hoje = hojeIso()): Situacao {
  if (p.status === 'cancelada') return 'encerrado'
  if (p.cancelamento_efetivo_em && p.cancelamento_efetivo_em < hoje) return 'encerrado'
  if (!p.renova_automaticamente && !p.cancelada_em && p.data_fim < hoje) return 'expirado'
  if (p.solicitacao_status === 'pendente') return 'cancelamento_solicitado'
  if (p.cancelada_em) return 'cancelamento_confirmado'
  if (p.status === 'inadimplente') return 'pagamento_atrasado'
  if (p.status === 'pausada') return 'pausado'
  if (p.pagamento_pendente_desde) return 'aguardando_pagamento'
  return 'ativo'
}

/** Ainda dá acesso (ou vai dar) — o contrário de expirado/encerrado. */
export function planoVigente(p: MeuPlano, hoje = hojeIso()): boolean {
  const s = situacaoDoPlano(p, hoje)
  return s !== 'expirado' && s !== 'encerrado'
}

/**
 * Até quando o plano vale, pelo que se sabe hoje: o fim confirmado do
 * cancelamento; senão o que as regras deram ao pedido em análise; senão o
 * fim do ciclo pago. Sem o segundo caso, o cartão diria "ativo até 23/09"
 * logo acima de "seu plano permanecerá ativo até 24/10".
 */
export function ativoAte(p: MeuPlano): string {
  if (p.cancelamento_efetivo_em) return p.cancelamento_efetivo_em
  if (p.solicitacao_status === 'pendente' && p.solicitacao_vigente_ate) return p.solicitacao_vigente_ate
  return p.data_fim
}

/**
 * A próxima renovação que VAI acontecer. Pedido dentro do prazo, mesmo
 * ainda em análise, já impede a renovação (item 7.1) — mostrar a data
 * como se nada tivesse mudado desmentiria o pedido que o aluno acabou de
 * fazer.
 */
export function proximaRenovacaoEfetiva(p: MeuPlano): string | null {
  if (p.cancelada_em) {
    // Fora do prazo e confirmado: ainda há UMA renovação antes do fim. O
    // banco não devolve a data (o plano já não 'renova' para fins de novo
    // pedido), mas ela é a de sempre: o dia seguinte ao fim do ciclo.
    return p.renova_automaticamente && p.cancelamento_efetivo_em && p.cancelamento_efetivo_em > p.data_fim
      ? somarDias(p.data_fim, 1)
      : null
  }
  if (p.solicitacao_status === 'pendente' && p.solicitacao_dentro_prazo) return null
  return p.proxima_renovacao
}

/**
 * Os planos do aluno separados como a tela os mostra: o contrato principal
 * (créditos e/ou turma fixa — pode haver os dois, é uso legítimo), os
 * pacotes avulsos ainda com saldo, e o último encerrado, que só aparece
 * quando não sobra nenhum vigente ("seu plano terminou em…").
 */
export function separarPlanos(planos: MeuPlano[], hoje = hojeIso()) {
  const vigentes = planos.filter((p) => planoVigente(p, hoje))
  const principais = vigentes.filter((p) => formatoDoPlano(p) !== 'pacote')
  const pacotes = vigentes.filter(
    (p) => formatoDoPlano(p) === 'pacote' && (p.saldo > 0 || p.data_fim >= hoje),
  )
  const encerrados = planos
    .filter((p) => !planoVigente(p, hoje) && formatoDoPlano(p) !== 'pacote')
    .sort((a, b) => ativoAte(b).localeCompare(ativoAte(a)))
  return {
    principais,
    pacotes,
    ultimoEncerrado: principais.length === 0 ? (encerrados[0] ?? null) : null,
    temCreditos: vigentes.some((p) => p.gera_credito && p.creditos_por_ciclo > 0),
    temTurmaFixa: principais.some((p) => formatoDoPlano(p) === 'turma_fixa'),
  }
}

/** Pedido de cancelamento só faz sentido para plano que renova e ainda não foi cancelado. */
export function podeSolicitarCancelamento(p: MeuPlano): boolean {
  return (
    p.renova_automaticamente &&
    !p.cancelada_em &&
    p.status !== 'cancelada' &&
    p.solicitacao_status !== 'pendente' &&
    p.proxima_renovacao !== null
  )
}
