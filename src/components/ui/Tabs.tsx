import { cn } from './cn'

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: string }[]
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition',
            value === item.value
              ? 'bg-white text-brand-700 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-800',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
