import { useCallback, useEffect, useState } from 'react'

const CHAVE = 'sigilo-financeiro'
const EVENTO = 'sigilo-financeiro-mudou'

/** O que aparece no lugar do número quando os valores estão ocultos. */
export const OCULTO = '••••••'

/**
 * Os valores financeiros do painel estão à mostra ou escondidos.
 *
 * Existe por um motivo concreto: o sistema é aberto na recepção, com aluno,
 * professora ou visitante do lado. Faturamento do mês, saldo em caixa e o
 * quanto falta para o teto do MEI não são informação que a equipe queira
 * projetar sem querer — e "não abrir o painel na frente dos outros" não é
 * uma solução, porque o painel é justamente a tela inicial.
 *
 * **Começa oculto**, e é isso que faz a proteção valer: um botão que começa
 * revelado só ajuda quem lembra de clicar *antes* de alguém chegar. Quem
 * escolheu revelar tem a escolha lembrada no navegador, então isto atrapalha
 * uma vez só por máquina.
 *
 * Não é segurança — é discrição. Quem não pode ver valor nenhum é a
 * secretária, e isso é decidido no banco por `is_gestao()` (CLAUDE.md §5.2);
 * aqui o dado já chegou, só não está desenhado na tela.
 */
export function useSigilo() {
  const [oculto, setOculto] = useState(() => {
    try {
      // Só um "0" explícito revela: navegador novo, aba anônima ou
      // localStorage bloqueado caem no lado seguro.
      return localStorage.getItem(CHAVE) !== '0'
    } catch {
      return true
    }
  })

  // O olhinho vive no cabeçalho de um bloco, mas o valor mascarado pode estar
  // em vários componentes irmãos. Sem este aviso, cada um ficaria com a sua
  // cópia do estado e só o bloco clicado reagiria.
  useEffect(() => {
    const ouvir = (e: Event) => setOculto((e as CustomEvent<boolean>).detail)
    window.addEventListener(EVENTO, ouvir)
    return () => window.removeEventListener(EVENTO, ouvir)
  }, [])

  const alternar = useCallback(() => {
    const novo = !oculto
    try {
      localStorage.setItem(CHAVE, novo ? '1' : '0')
    } catch {
      /* ignore */
    }
    setOculto(novo)
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: novo }))
  }, [oculto])

  /** Mascara um valor já formatado. */
  const mascarar = useCallback((texto: string) => (oculto ? OCULTO : texto), [oculto])

  return { oculto, alternar, mascarar }
}
