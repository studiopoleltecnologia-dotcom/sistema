import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Aba de uma tela guardada na URL (`?aba=ocupacao`) em vez de em `useState`.
 *
 * Existe porque o menu lateral passou a listar as sub-seções de cada módulo:
 * um link só chega numa aba se a aba tiver endereço. De quebra, recarregar a
 * página ou salvar o link deixa de jogar a pessoa de volta na primeira aba.
 *
 * `valores` não é decoração — é o que impede que `?aba=qualquer-coisa`
 * (link velho, aba que sumiu, dedo escorregando na barra de endereço) renderize
 * uma tela em branco: valor desconhecido cai no padrão.
 *
 * `replace: true` porque alternar aba não é navegação: sem isso, cada clique
 * empilha uma entrada no histórico e o botão Voltar do navegador vira um
 * desfazer-aba em vez de sair da tela.
 */
export function useAbaUrl<T extends string>(
  valores: readonly T[],
  padrao: T,
  chave = 'aba',
) {
  const [params, setParams] = useSearchParams()

  const bruto = params.get(chave)
  const aba = (valores as readonly string[]).includes(bruto ?? '') ? (bruto as T) : padrao

  const setAba = useCallback(
    (valor: T) => {
      setParams(
        (atual) => {
          const novo = new URLSearchParams(atual)
          // O padrão sai da URL: `/clientes` lê melhor que `/clientes?aba=lista`
          // e é o mesmo destino, então não há por que sujar o endereço.
          if (valor === padrao) novo.delete(chave)
          else novo.set(chave, valor)
          return novo
        },
        { replace: true },
      )
    },
    [setParams, padrao, chave],
  )

  return [aba, setAba] as const
}
