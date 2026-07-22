import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useMinhaFuncao, type FuncaoInterna } from '../lib/funcao'
import { EmptyState } from './ui/EmptyState'

/**
 * Barreira de rota por função. O menu já esconde o que a conta não pode
 * ver, mas digitar a URL na mão pularia isso — aqui a página em si recusa.
 * A proteção definitiva continua na RLS: mesmo furando daqui, o banco não
 * devolve dado financeiro para quem não é gestão.
 */
export function RotaFuncao({
  permitido,
  children,
}: {
  permitido: FuncaoInterna[]
  children: ReactNode
}) {
  const { data: funcao, isLoading } = useMinhaFuncao()

  if (isLoading) {
    return <p className="text-sm text-neutral-400">Carregando…</p>
  }

  if (!funcao || !permitido.includes(funcao)) {
    return (
      <EmptyState
        icon={Lock}
        title="Acesso restrito"
        description="Esta área é exclusiva da equipe de gestão."
      />
    )
  }

  return <>{children}</>
}
