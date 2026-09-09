import type { Enums, Tables, TablesInsert, TablesUpdate } from '../../lib/database.types'

export type Produto = Tables<'produtos'>
export type ProdutoInsert = TablesInsert<'produtos'>
export type ProdutoUpdate = TablesUpdate<'produtos'>
export type TipoProduto = Enums<'tipo_produto'>
export type TipoRequisito = Enums<'tipo_requisito_produto'>
export type ProdutoRequisito = Tables<'produto_requisitos'>

/**
 * `tipo_produto` é rótulo, não comportamento — nenhuma regra de negócio
 * lê esse campo. Ele existe para o formulário saber quais perguntas
 * fazem sentido mostrar.
 *
 * Quem discrimina COMPORTAMENTO é `turmas_fixas` (0 = crédito/serviço,
 * 1+ = Mensalidade por Turma Fixa) — atributo, não tipo, e a trava mora
 * no banco. Ver a migration 20260908120000.
 */
export const TIPOS_PRODUTO: { valor: TipoProduto; label: string; ajuda: string }[] = [
  {
    valor: 'plano',
    label: 'Plano',
    ajuda: 'Cobrança que se repete sozinha, ciclo após ciclo, até o aluno cancelar.',
  },
  {
    valor: 'pacote',
    label: 'Pacote',
    ajuda: 'Compra única que entrega créditos com validade própria.',
  },
  {
    valor: 'servico',
    label: 'Serviço',
    ajuda: 'Compra única sem crédito — a aula é combinada à parte.',
  },
]

export const TIPO_PRODUTO_LABEL: Record<TipoProduto, string> = {
  plano: 'Plano',
  pacote: 'Pacote',
  servico: 'Serviço',
}

export const REQUISITOS: { valor: TipoRequisito; label: string; ajuda: string }[] = [
  {
    valor: 'nunca_treinou',
    label: 'Só para quem nunca treinou aqui',
    ajuda: 'Usado na aula experimental.',
  },
  {
    valor: 'plano_ativo',
    label: 'Precisa ter plano ativo',
    ajuda: 'Usado no crédito extra.',
  },
  {
    valor: 'checkins_wellhub',
    label: 'Precisa de check-ins do Wellhub',
    ajuda: 'Usado no Studio+ — quantos check-ins, em quantos dias.',
  },
]

export const REQUISITO_LABEL: Record<TipoRequisito, string> = {
  nunca_treinou: 'nunca treinou aqui',
  plano_ativo: 'plano ativo',
  checkins_wellhub: 'check-ins Wellhub',
}

// ------------------------------------------------------------
// Como o catálogo se organiza na tela
// ------------------------------------------------------------

/**
 * O estúdio vende três coisas estruturalmente diferentes, e o
 * regulamento v3 as separa nessa ordem: plano por crédito (item 2.1/2.2),
 * mensalidade por turma fixa (2.3) e o que se compra fora de plano
 * (item 8).
 *
 * O grupo é DERIVADO dos atributos, não uma coluna nova: `turmas_fixas`
 * já diz se o produto reserva assento e `renova_automaticamente` já diz
 * se é assinatura. Guardar o grupo seria uma segunda fonte de verdade
 * que dessincroniza no primeiro produto editado.
 */
export type GrupoProduto = 'creditos' | 'turma_fixa' | 'outros'

export function grupoDoProduto(p: Pick<Produto, 'turmas_fixas' | 'renova_automaticamente'>): GrupoProduto {
  if (p.turmas_fixas > 0) return 'turma_fixa'
  if (p.renova_automaticamente) return 'creditos'
  return 'outros'
}

export const GRUPOS: {
  valor: GrupoProduto
  titulo: string
  /** Rótulo curto da aba — o título por extenso não cabe num segmented control. */
  aba: string
  descricao: string
}[] = [
  {
    valor: 'creditos',
    titulo: 'Planos por créditos',
    aba: 'Por créditos',
    descricao: 'Um crédito, todas as modalidades da grade regular.',
  },
  {
    valor: 'turma_fixa',
    titulo: 'Mensalidade por turma fixa',
    aba: 'Turma fixa',
    descricao: 'Vaga reservada numa turma específica da grade. Não gera crédito.',
  },
  {
    valor: 'outros',
    titulo: 'Fora do plano',
    aba: 'Fora do plano',
    descricao: 'Compra única: experimental, avulsa, crédito extra, particular, treino livre e Studio+.',
  },
]

/**
 * Dentro de plano por crédito e de turma fixa, o que separa as colunas é
 * o compromisso: 1 ciclo = Mensal, mais que 1 = Semestral (regulamento
 * 1.5). Produto fora do plano não tem essa divisão.
 */
export type Recorrencia = 'mensal' | 'semestral'

export function recorrenciaDoProduto(p: Pick<Produto, 'ciclos_compromisso'>): Recorrencia {
  return p.ciclos_compromisso > 1 ? 'semestral' : 'mensal'
}

export const RECORRENCIA_LABEL: Record<Recorrencia, string> = {
  mensal: 'Mensal',
  semestral: 'Semestral',
}

export const RECORRENCIA_AJUDA: Record<Recorrencia, string> = {
  mensal: 'Sem compromisso — cancela quando quiser',
  semestral: 'Compromisso de 6 ciclos, valor congelado',
}

// ------------------------------------------------------------
// O cartão do catálogo — três linhas, e só
//
// A tela inteira depende de o cartão NÃO repetir o que a navegação já
// disse. Dentro da aba "Por créditos → Semestral", escrever
// "Semestral · 8 créditos" gasta duas linhas para informar zero. Por
// isso o título é só o que diferencia um produto do vizinho ali dentro,
// e todo o resto (cobrança, regras, custo por aula, benefícios) mora no
// painel de detalhes.
// ------------------------------------------------------------

/**
 * O que distingue este produto dos irmãos do mesmo grupo — "8 créditos",
 * "2 turmas fixas". Fora do plano não há eixo comum, então vale o nome.
 */
export function tituloDoProduto(p: Produto): string {
  const grupo = grupoDoProduto(p)
  if (grupo === 'turma_fixa') {
    return `${p.turmas_fixas} turma${p.turmas_fixas === 1 ? '' : 's'} fixa${p.turmas_fixas === 1 ? '' : 's'}`
  }
  if (grupo === 'creditos') {
    return `${p.creditos_por_ciclo} crédito${p.creditos_por_ciclo === 1 ? '' : 's'}`
  }
  return p.nome
}

/** "R$ 300/mês", "R$ 60" ou "Cortesia". */
export function precoResumido(p: Produto): string {
  if (p.preco_centavos === 0) return 'Cortesia'
  const valor = (p.preco_centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: p.preco_centavos % 100 === 0 ? 0 : 2,
  })
  if (!p.renova_automaticamente) return valor
  return p.periodicidade_dias === 30 ? `${valor}/mês` : `${valor}/${p.periodicidade_dias}d`
}

/**
 * A ÚNICA linha de apoio do cartão. Uma, escolhida por relevância — não
 * a lista inteira de benefícios.
 *
 * No semestral ela é sempre a economia, porque é o argumento que decide
 * a venda (regulamento 2.2) e o que o mensal ao lado não tem. O valor
 * sai do par mensal↔semestral que `produto_sucessor_id` já registra
 * para a regra 7.7 — não é uma tabela de preços repetida aqui.
 */
export function linhaDeApoio(p: Produto, porId: Map<string, Produto>): string | null {
  if (recorrenciaDoProduto(p) === 'semestral') {
    const economia = economiaMensal(p, porId)
    if (economia !== null && economia > 0) {
      return `Economize ${fmtReais(economia)}/mês`
    }
    return 'Valor congelado por 6 ciclos'
  }
  // Turma fixa antes da descrição: o texto cadastrado é
  // necessariamente longo (precisa explicar o formato para o aluno) e
  // aqui cabe uma linha. "1 aula por semana" é o que a equipe compara.
  if (p.turmas_fixas > 0) {
    return `${p.turmas_fixas} aula${p.turmas_fixas === 1 ? '' : 's'} por semana`
  }
  const primeira = primeiraFrase(p.descricao)
  if (primeira) return primeira
  if (p.gera_credito && p.validade_creditos_dias) return `Vale ${p.validade_creditos_dias} dias`
  return null
}

/**
 * Quanto o semestral economiza por ciclo em relação ao mensal
 * equivalente. O par vem de `produto_sucessor_id`: ao fim dos 6 ciclos o
 * semestral vira exatamente esse mensal (7.7), então ele já é, por
 * definição, "o mesmo plano sem compromisso".
 */
export function economiaMensal(p: Produto, porId: Map<string, Produto>): number | null {
  if (!p.produto_sucessor_id) return null
  const mensal = porId.get(p.produto_sucessor_id)
  if (!mensal) return null
  const diff = mensal.preco_centavos - p.preco_centavos
  return diff > 0 ? diff : null
}

/** Primeira frase de um texto livre, para caber em uma linha. */
function primeiraFrase(texto: string | null): string | null {
  if (!texto) return null
  const limpo = texto.trim()
  if (!limpo) return null
  const fim = limpo.search(/\.\s|\.$/)
  return fim > 0 ? limpo.slice(0, fim) : limpo
}

function fmtReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: centavos % 100 === 0 ? 0 : 2,
  })
}

/**
 * Os benefícios do produto como frases curtas, do mais forte para o mais
 * fraco. O cartão não usa isto — quem usa é o painel de detalhes. Ficam
 * juntos aqui para que "quais são os benefícios" tenha uma resposta só
 * no código.
 */
export function beneficiosDoProduto(p: Produto, porId: Map<string, Produto>): string[] {
  const out: string[] = []
  const economia = economiaMensal(p, porId)
  if (economia !== null) out.push(`Economiza ${fmtReais(economia)} por ciclo em relação ao mensal`)
  if (p.ciclos_compromisso > 1) out.push(`Valor congelado pelos ${p.ciclos_compromisso} ciclos`)
  if (p.acumula_creditos) {
    out.push(
      p.teto_acumulo_ciclos === 1
        ? 'Crédito que sobra acumula (saldo nunca passa do dobro do plano)'
        : `Crédito que sobra acumula até ${p.teto_acumulo_ciclos} ciclos`,
    )
  }
  if (p.convidados_por_ciclo > 0) {
    out.push(`${p.convidados_por_ciclo} convidado${p.convidados_por_ciclo === 1 ? '' : 's'} por ciclo`)
  }
  if (p.desconto_eventos_pct > 0) out.push(`${p.desconto_eventos_pct}% de desconto em aulões e workshops`)
  return out
}

/** As regras de uso já cadastradas, como pares rótulo/valor. */
export function regrasDoProduto(p: Produto): { rotulo: string; valor: string }[] {
  const out: { rotulo: string; valor: string }[] = []
  if (p.turmas_fixas > 0) {
    // Regulamento 4.8/4.9: sem reserva semanal, não há prazo de
    // cancelamento nem janela de agendamento para exibir.
    out.push({ rotulo: 'Agendamento', valor: 'Não precisa — a vaga é do aluno toda semana' })
    out.push({ rotulo: 'Falta e cancelamento', valor: 'Não geram crédito, reposição nem desconto' })
    return out
  }
  if (p.dias_antecedencia_agendamento) {
    out.push({ rotulo: 'Antecedência para agendar', valor: `até ${p.dias_antecedencia_agendamento} dias` })
  }
  if (p.max_agendamentos_simultaneos) {
    out.push({ rotulo: 'Aulas agendadas ao mesmo tempo', valor: `máximo ${p.max_agendamentos_simultaneos}` })
  }
  if (p.horas_cancelamento !== null) {
    out.push({ rotulo: 'Cancelamento devolve o crédito', valor: `até ${p.horas_cancelamento}h antes` })
  }
  if (p.limite_por_cliente) {
    out.push({ rotulo: 'Limite por aluno', valor: `${p.limite_por_cliente} compra(s)` })
  }
  return out
}

/**
 * Frase que descreve a cobrança em português — a mesma ideia que vai
 * para o checkout do aluno. O regulamento (1.5) insiste que "mensal"
 * não é uma cobrança avulsa todo mês, e é isso que o texto precisa
 * dizer sem depender de o aluno interpretar.
 */
export function descreverCobranca(p: Produto): string {
  if (p.preco_centavos === 0) return 'Cortesia — sem cobrança'
  if (!p.renova_automaticamente) return 'Pagamento único'
  const cada =
    p.periodicidade_dias === 30 ? 'a cada 30 dias' : `a cada ${p.periodicidade_dias} dias`
  if (p.ciclos_compromisso > 1) {
    return `Cobrança automática ${cada}, com permanência mínima de ${p.ciclos_compromisso} ciclos`
  }
  return `Cobrança automática ${cada}, até cancelar`
}

/** Resumo do que o produto entrega, para a linha do cartão. */
export function descreverEntrega(p: Produto): string {
  if (p.turmas_fixas > 0) {
    return `${p.turmas_fixas} turma${p.turmas_fixas === 1 ? '' : 's'} da grade, 1 aula por semana em cada`
  }
  if (!p.gera_credito) return 'Não entrega crédito'
  const n = p.creditos_por_ciclo
  const unidade = `${n} crédito${n === 1 ? '' : 's'}`
  if (p.renova_automaticamente) return `${unidade} por ciclo`
  if (p.validade_creditos_dias) return `${unidade} · vale ${p.validade_creditos_dias} dias`
  return unidade
}

/**
 * "R$ 35,00 por aula" — o número que o regulamento manda NÃO publicar
 * (2.4, bloco INTERNO) mas que existe justamente para a equipe
 * argumentar no atendimento. Só faz sentido onde há crédito.
 */
export function custoPorAula(p: Produto): number | null {
  if (p.turmas_fixas > 0) {
    // 1 aula por semana por turma, ~4,3 semanas no ciclo de 30 dias.
    const aulas = p.turmas_fixas * 4.3
    return Math.round(p.preco_centavos / aulas)
  }
  if (!p.gera_credito || p.creditos_por_ciclo === 0) return null
  return Math.round(p.preco_centavos / p.creditos_por_ciclo)
}
