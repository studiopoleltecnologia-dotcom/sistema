import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from './cn'

type InputProps = ComponentPropsWithoutRef<'input'> & {
  label?: string
  error?: string
  hint?: string
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, icon, className, id, ...props },
  ref,
) {
  return (
    <label className="block" htmlFor={id}>
      {label && (
        <span className="mb-1.5 block text-xs font-medium text-neutral-600">{label}</span>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full rounded-md border bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition',
            'placeholder:text-neutral-400',
            'focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
            error ? 'border-danger-500' : 'border-neutral-200',
            icon && 'pl-8',
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <span className="mt-1 block text-xs text-danger-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-neutral-400">{hint}</span>
      ) : null}
    </label>
  )
})
