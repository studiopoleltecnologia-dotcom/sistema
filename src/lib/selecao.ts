import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * O recorte de tempo que a pessoa escolheu numa tela: na URL e na sessão,
 * nunca só em `useState`.
 *
 * ## O problema, que apareceu três vezes
 *
 * Escolher dezembro no Financeiro, abrir outra tela e voltar devolvia o
 * mês corrente. Depois a mesma coisa no Fechamento: escolher a
 * competência, mudar de tela, e a folha voltava para o mês de hoje. É
 * sempre o mesmo defeito — estado de tela que a pessoa escolheu morando
 * em memória que a navegação descarta — e o estrago não é o clique
 * perdido: é **ler o número do mês errado achando que é o certo**.
 *
 * Por isso o mecanismo mora aqui, e não em cada tela. Primo de
 * `useAbaUrl` ([aba.ts](aba.ts)), que faz o mesmo com a aba, e do
 * `usePeriodo` do Financeiro, que aplica a mesma regra a um par de meses
 * (de/até) e usa as funções de sessão deste arquivo.
 *
 * ## Duas camadas, cada uma resolvendo uma coisa
 *
 *  · a **URL** faz o recorte ser endereçável: recarregar, voltar no
 *    navegador e mandar o link para outra sócia caem no mesmo mês;
 *  · a **sessão** atravessa a navegação do menu, que não leva query
 *    nenhuma — é ela que resolve o "mudei de tela e voltou".
 *
 * `sessionStorage` e não `localStorage` de propósito: abrir o sistema
 * amanhã começa no mês corrente, que é o que se quer quase sempre.
 * Lembrar para sempre seria outro jeito de mostrar o mês errado.
 *
 * Cada tela guarda a **própria** escolha (chave de sessão própria).
 * Compartilhar um "mês global" faria escolher dezembro no Financeiro
 * mover a folha das professoras junto, o que ninguém pediu.
 */

/*
  `sessionStorage` pode lançar (aba privada, cookies de site bloqueados).
  Nesse caso a tela continua funcionando — só deixa de lembrar.
*/
export function lerSessao(chave: string): string | null {
  try {
    return sessionStorage.getItem(chave)
  } catch {
    return null
  }
}

export function gravarSessao(chave: string, valor: string) {
  try {
    sessionStorage.setItem(chave, valor)
  } catch {
    /* sem memória de sessão: a tela segue, só não lembra */
  }
}

/** Mês corrente em 'YYYY-MM'. */
export function mesCorrente(): string {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`
}

/** Hoje em ISO 'YYYY-MM-DD'. */
export function hojeISO(): string {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

const FORMATO_MES = /^\d{4}-(0[1-9]|1[0-2])$/
const FORMATO_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/**
 * Um valor de recorte guardado na URL + sessão.
 *
 * `valido` não é decoração: é o que impede que `?mes=qualquer-coisa`
 * (link velho, dedo escorregando na barra de endereço) faça a tela
 * consultar um período que não existe. Valor estranho cai no padrão.
 *
 * O padrão sai da URL — `/fechamento` lê melhor que `/fechamento?mes=`
 * com o mês de hoje, e é o mesmo destino.
 */
function useSelecaoUrl(opts: {
  chave: string
  sessao: string
  padrao: () => string
  valido: (v: string) => boolean
}): [string, (v: string) => void] {
  const { chave, sessao, padrao, valido } = opts
  const [params, setParams] = useSearchParams()

  const daUrl = params.get(chave)
  const daSessao = lerSessao(sessao)
  const valor =
    daUrl && valido(daUrl)
      ? daUrl
      : daSessao && valido(daSessao)
        ? daSessao
        : padrao()

  const definir = useCallback(
    (novo: string) => {
      if (!valido(novo)) return
      gravarSessao(sessao, novo)
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          if (novo === padrao()) p.delete(chave)
          else p.set(chave, novo)
          return p
        },
        // Trocar de mês não é navegação: sem `replace`, o Voltar do
        // navegador viraria um desfaz-mês em vez de sair da tela.
        { replace: true },
      )
    },
    [chave, sessao, padrao, valido, setParams],
  )

  return [valor, definir]
}

/** Competência ('YYYY-MM') da tela, lembrada entre navegações. */
export function useMesUrl(sessao: string, chave = 'mes') {
  return useSelecaoUrl({ chave, sessao, padrao: mesCorrente, valido: (v) => FORMATO_MES.test(v) })
}

/** Dia ('YYYY-MM-DD') da tela, lembrado entre navegações. */
export function useDiaUrl(sessao: string, chave = 'dia') {
  return useSelecaoUrl({ chave, sessao, padrao: hojeISO, valido: (v) => FORMATO_DIA.test(v) })
}
