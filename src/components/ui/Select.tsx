import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

type SelectProps = ComponentPropsWithoutRef<'select'> & {
  label?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className, id, children, ...props },
  ref,
) {
  return (
    <label className="block" htmlFor={id}>
      {label && (
        <span className="mb-1.5 block text-xs font-medium text-neutral-600">{label}</span>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={id}
          className={cn(
            'w-full appearance-none rounded-md border bg-white px-3 py-2 pr-8 text-sm text-neutral-800 outline-none transition',
            'focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
            error ? 'border-danger-500' : 'border-neutral-200',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
      </div>
      {error && <span className="mt-1 block text-xs text-danger-600">{error}</span>}
    </label>
  )
})
