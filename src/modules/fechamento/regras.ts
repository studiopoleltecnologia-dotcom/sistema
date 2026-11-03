/**
 * A regra de precedência dos números da folha, num lugar só.
 *
 * Cada mês de cada professora tem dois números possíveis para "aulas",
 * "horas", "alunos" e "bruto":
 *
 * - o **digitado** pela gestão em `fechamentos_professora` (hoje o caminho
 *   normal: a folha é conferida à mão, e a coluna já nasceu anulável com a
 *   semântica "nulo = calcula ao vivo");
 * - o **calculado** por `vw_pagamento_professoras` a partir das presenças
 *   marcadas na Agenda.
 *
 * Digitado ganha sempre. Na falta dele:
 *
 * - mês **aberto** → vale o cálculo ao vivo;
 * - mês **aprovado** → vale zero, porque aprovado é snapshot congelado. Se
 *   voltasse a calcular, a folha de um mês já pago mudaria sozinha no dia em
 *   que alguém marcasse uma presença atrasada — e o valor da tela deixaria de
 *   bater com a saída que foi para o Financeiro.
 *
 * A tabela da folha e o painel de detalhe precisam concordar: se divergirem,
 * a linha mostra um número e o painel outro, para o mesmo mês.
 */
export function valorEfetivoFolha(
  digitado: number | null | undefined,
  calculado: number,
  aprovado: boolean,
): number {
  return digitado ?? (aprovado ? 0 : calculado)
}
