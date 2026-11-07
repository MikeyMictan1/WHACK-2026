import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'

/**
 * solid     ink block; hover swaps to lime with ink text.
 * light     white block for use over the backdrop; hover swaps to ink.
 * onAccent  for use on a lime surface; hover swaps to white.
 * Hover changes colour outright. Nothing fades, nothing moves.
 */
type Variant = 'solid' | 'light' | 'onAccent'
type Size = 'md' | 'sm'

const base =
  'inline-flex shrink-0 items-center justify-center font-medium disabled:pointer-events-none disabled:opacity-40'

const sizes: Record<Size, string> = {
  md: 'h-12 px-6 text-[15px]',
  sm: 'h-10 px-4 text-sm',
}

const variants: Record<Variant, string> = {
  solid: 'bg-ink text-white hover:bg-signal hover:text-ink active:bg-ink-2 active:text-white',
  light: 'bg-white text-ink hover:bg-ink hover:text-white',
  onAccent: 'bg-ink text-white hover:bg-white hover:text-ink',
}

type Common = { variant?: Variant; size?: Size; children: ReactNode }

export function Button({
  variant = 'solid',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & Common) {
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />
}

export function ButtonLink({
  variant = 'solid',
  size = 'md',
  className = '',
  ...props
}: LinkProps & Common) {
  return <Link className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />
}

/** Secondary action: plain text, underline on hover. */
export function TextLink({ className = '', ...props }: LinkProps) {
  return (
    <Link
      className={`text-[15px] font-medium underline-offset-[6px] hover:underline ${className}`}
      {...props}
    />
  )
}
