/**
 * Feature flags — módulos preparados mas desativados.
 * Ligar uma flag revela o módulo no menu e nas rotas.
 */
export const flags = {
  /** Pró-labore e distribuição de lucros (ativar quando o negócio permitir) */
  prolabore: false,
  /** Integração ClassPass (ativar quando o estúdio aderir) */
  classpass: false,
  /**
   * "Assinar no cartão" na aprovação da contratação.
   *
   * Ficou DESLIGADA de 27/09 a 01/10/2026 porque o caminho não concluía:
   * `CHECKOUT_PAID` só ativava a assinatura e nunca chamava
   * `confirmar_pagamento_contratacao()` — o aluno pagava e a matrícula não
   * nascia. Corrigido em `20261003190000`: `assinatura_ativada()` conclui a
   * contratação, e a reentrega do webhook não duplica matrícula nem receita.
   * Testado no DEV ponta a ponta antes de religar.
   */
  cartaoRecorrente: true,
} as const

export type FlagName = keyof typeof flags
