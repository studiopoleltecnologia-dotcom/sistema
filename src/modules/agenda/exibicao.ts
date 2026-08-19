import { useState } from 'react'

/**
 * Preferências de exibição da grade — inspiradas no painel do Wix.
 *
 * Ficam no navegador (não no banco) de propósito: são gosto de quem está
 * olhando, não configuração do estúdio. Duas pessoas podem querer densidades
 * diferentes na mesma conta.
 */
export type Espacamento = 'compacto' | 'confortavel' | 'largo'
export type ColorirPor = 'categoria' | 'ocupacao' | 'modalidade' | 'professora'

export type Exibicao = {
  espacamento: Espacamento
  colorirPor: ColorirPor
  /** Altura de uma faixa da grade, em minutos. */
  intervalo: 30 | 60
  mostrarFimDeSemana: boolean
}

export const EXIBICAO_PADRAO: Exibicao = {
  espacamento: 'confortavel',
  // Categoria é o padrão porque é o código de cor que a equipe já lê na
  // grade impressa — bater o olho e reconhecer "isso é Condicionamento"
  // vale mais no dia a dia do que a escala de ocupação, que continua a um
  // clique e responde outra pergunta ("qual aula está vazia?").
  colorirPor: 'categoria',
  intervalo: 60,
  mostrarFimDeSemana: true,
}

// Chave versionada: a preferência antiga (colorirPor: 'ocupacao') está
// gravada no navegador de quem já usa o sistema e venceria o padrão novo
// no merge abaixo — a grade por categoria simplesmente não apareceria.
// Trocar a chave aplica o padrão novo uma vez; quem preferir ocupação
// volta a escolher e a escolha persiste daí em diante.
const CHAVE = 'agenda-exibicao-v2'

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
