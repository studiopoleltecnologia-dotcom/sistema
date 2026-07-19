/**
 * Feature flags — módulos preparados mas desativados.
 * Ligar uma flag revela o módulo no menu e nas rotas.
 */
export const flags = {
  /** Pró-labore e distribuição de lucros (ativar quando o negócio permitir) */
  prolabore: false,
  /** Integração ClassPass (ativar quando o estúdio aderir) */
  classpass: false,
} as const

export type FlagName = keyof typeof flags
