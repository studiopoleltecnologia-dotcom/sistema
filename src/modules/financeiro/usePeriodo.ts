import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { lerSessao, gravarSessao } from '../../lib/selecao'
import { contemMes, mesAtual, periodoMes, type Periodo } from './periodo'

/**
 * O período escolhido no Financeiro, guardado na URL (`?de=&ate=`) e na
 * sessão — não em `useState`.
 *
 * Em `useState` ele se perdia: escolher dezembro, abrir um lançamento ou ir a
 * outra aba e voltar devolvia a tela ao mês corrente, sem aviso. Quem está
 * fechando dezembro reescolhia o mês a cada ida e volta, e — pior — lia
 * números de novembro achando que eram de dezembro.
 *
 * São duas camadas porque resolvem coisas diferentes:
 *
 *  · a **URL** faz o recorte ser endereçável: recarregar, voltar no navegador
 *    e mandar o link para outra sócia caem no mesmo mês. É a mesma razão de
 *    `useAbaUrl` ([src/lib/aba.ts](../../lib/aba.ts)) — estado de tela que a
 *    pessoa escolheu tem endereço;
 *  · a **sessão** (`sessionStorage`) atravessa a navegação do menu, que não
 *    leva query nenhuma: sair de Entradas para Saídas mantém dezembro. Por
 *    sessão, e não `localStorage`, de propósito — abrir o sistema amanhã
 *    começa no mês corrente, que é o que se quer quase sempre.
 *
 * Mês corrente não vai para a URL: `/financeiro/entradas` lê melhor que
 * `?de=2026-11&ate=2026-11` e é o mesmo destino.
 */

const CHAVE_SESSAO = 'financeiro:periodo'
const FORMATO = /^\d{4}-(0[1-9]|1[0-2])$/

function valido(inicio: string | null, fim: string | null): Periodo | null {
  if (!inicio || !fim) return null
  if (!FORMATO.test(inicio) || !FORMATO.test(fim)) return null
  // Faixa invertida é link torto, não escolha: ignora em vez de renderizar
  // um período vazio que ninguém sabe explicar.
  if (inicio > fim) return null
  return { inicio, fim }
}

/*
  A leitura e a escrita da sessão vêm de [lib/selecao.ts](../../lib/selecao.ts),
  que é onde mora a regra (sessão e não localStorage, e o try/catch para a
  aba privada). Aqui fica só o que é próprio do Financeiro: um PAR de
  meses em vez de um valor só.
*/
function lerPeriodoDaSessao(): Periodo | null {
  const bruto = lerSessao(CHAVE_SESSAO)
  if (!bruto) return null
  const [inicio, fim] = bruto.split('|')
  return valido(inicio ?? null, fim ?? null)
}

export function usePeriodo(): [Periodo, (p: Periodo) => void] {
  const [params, setParams] = useSearchParams()

  const periodo =
    valido(params.get('de'), params.get('ate')) ?? lerPeriodoDaSessao() ?? periodoMes(mesAtual())

  const setPeriodo = useCallback(
    (p: Periodo) => {
      gravarSessao(CHAVE_SESSAO, `${p.inicio}|${p.fim}`)
      setParams(
        (atual) => {
          const novo = new URLSearchParams(atual)
          if (p.inicio === p.fim && p.inicio === mesAtual()) {
            novo.delete('de')
            novo.delete('ate')
          } else {
            novo.set('de', p.inicio)
            novo.set('ate', p.fim)
          }
          return novo
        },
        // Trocar de mês não é navegação: sem `replace`, o Voltar do navegador
        // viraria um desfaz-mês em vez de sair da tela.
        { replace: true },
      )
    },
    [setParams],
  )

  return [periodo, setPeriodo]
}

/** O período inclui o mês corrente? (Para "voltar para hoje" na tela.) */
export function periodoIncluiHoje(p: Periodo): boolean {
  return contemMes(p, mesAtual())
}
