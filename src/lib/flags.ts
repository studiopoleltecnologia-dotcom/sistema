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
   * "Assinar no cartão" na aprovação da contratação. DESLIGADO porque o
   * caminho não conclui: `CHECKOUT_PAID` só ativa a assinatura e nunca
   * chama `confirmar_pagamento_contratacao()` — o aluno paga e a
   * matrícula não nasce (achado na homologação de 27/09/2026). Religar
   * só depois de corrigir `assinatura_ativada()`.
   */
  cartaoRecorrente: false,
} as const

export type FlagName = keyof typeof flags
