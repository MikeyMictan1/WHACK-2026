import { useId, type ReactNode, type SelectHTMLAttributes } from 'react'

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hint?: string
  children: ReactNode
}

export function SelectField({ label, hint, id, className = '', children, ...props }: Props) {
  const autoId = useId()
  const selectId = id ?? autoId

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={selectId} className="text-sm font-medium">
          {label}
        </label>
        {hint && <span className="meta">{hint}</span>}
      </div>
      <select
        id={selectId}
        className="h-12 w-full border border-ink/20 bg-white px-4 text-[15px] text-ink outline-none hover:border-ink/40 focus:border-ink"
        {...props}
      >
        {children}
      </select>
    </div>
  )
}
