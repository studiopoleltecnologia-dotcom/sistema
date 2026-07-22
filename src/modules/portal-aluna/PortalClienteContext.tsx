import { createContext, useContext } from 'react'

const PortalClienteContext = createContext<string | null>(null)

export const PortalClienteProvider = PortalClienteContext.Provider

/** Id do cliente da aluna logada — disponível em qualquer tela dentro do Portal. */
export function usePortalClienteId(): string {
  const id = useContext(PortalClienteContext)
  if (!id) throw new Error('usePortalClienteId usado fora do PortalAuthGate')
  return id
}
