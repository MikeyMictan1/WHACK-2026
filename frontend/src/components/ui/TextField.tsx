import { useId, type InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
}

export function TextField({ label, hint, id, className = '', ...props }: Props) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        {hint && <span className="meta">{hint}</span>}
      </div>
      <input
        id={inputId}
        className="h-12 w-full border border-ink/20 bg-white px-4 text-[15px] text-ink outline-none placeholder:text-muted hover:border-ink/40 focus:border-ink"
        {...props}
      />
    </div>
  )
}
