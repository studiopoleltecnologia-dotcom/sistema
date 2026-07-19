/** Página provisória de módulo ainda não implementado (ver roadmap no CLAUDE.md). */
export function Placeholder({ title, fase }: { title: string; fase: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Módulo previsto para a {fase} do roadmap.
      </p>
    </div>
  )
}
