import { Sparkles } from 'lucide-react'
import { EmptyState } from './ui/EmptyState'

/** Página provisória de módulo ainda não implementado (ver roadmap no CLAUDE.md). */
export function Placeholder({ title, fase }: { title: string; fase: string }) {
  return (
    <EmptyState
      icon={Sparkles}
      title={title}
      description={`Módulo previsto para a ${fase} do roadmap.`}
    />
  )
}
