import { createContext, useContext } from 'react'
import type { Professora } from './types'

const ProfessoraContext = createContext<Professora | null>(null)

export const ProfessoraProvider = ProfessoraContext.Provider

/** Cadastro da professora logada — disponível em qualquer tela do portal. */
export function useProfessoraAtual(): Professora {
  const p = useContext(ProfessoraContext)
  if (!p) throw new Error('useProfessoraAtual usado fora do ProfessoraAuthGate')
  return p
}
