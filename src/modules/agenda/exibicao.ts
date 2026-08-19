import { useState } from 'react'

/**
 * Preferências de exibição da grade — inspiradas no painel do Wix.
 *
 * Ficam no navegador (não no banco) de propósito: são gosto de quem está
 * olhando, não configuração do estúdio. Duas pessoas podem querer densidades
 * diferentes na mesma conta.
 */
export type Espacamento = 'compacto' | 'confortavel' | 'largo'
export type ColorirPor = 'ocupacao' | 'modalidade' | 'professora'

export type Exibicao = {
  espacamento: Espacamento
  colorirPor: ColorirPor
  /** Altura de uma faixa da grade, em minutos. */
  intervalo: 30 | 60
  mostrarFimDeSemana: boolean
}

export const EXIBICAO_PADRAO: Exibicao = {
  espacamento: 'confortavel',
  // Ocupação é o padrão porque é o que a grade precisa responder de longe:
  // "qual aula está vazia?". Modalidade continua disponível para quem
  // preferir o visual antigo.
  colorirPor: 'ocupacao',
  intervalo: 60,
  mostrarFimDeSemana: true,
}

const CHAVE = 'agenda-exibicao'

export function useExibicao() {
  const [exibicao, setExibicao] = useState<Exibicao>(() => {
    try {
      const salvo = localStorage.getItem(CHAVE)
      return salvo ? { ...EXIBICAO_PADRAO, ...JSON.parse(salvo) } : EXIBICAO_PADRAO
    } catch {
      return EXIBICAO_PADRAO
    }
  })

  const alterar = (patch: Partial<Exibicao>) =>
    setExibicao((atual) => {
      const novo = { ...atual, ...patch }
      try {
        localStorage.setItem(CHAVE, JSON.stringify(novo))
      } catch {
        /* ignore */
      }
      return novo
    })

  return [exibicao, alterar] as const
}

/** Altura da faixa de uma hora, por espaçamento. */
export const ALTURA_FAIXA: Record<Espacamento, number> = {
  compacto: 48,
  confortavel: 64,
  largo: 88,
}
