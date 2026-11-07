/** Placeholder block shown while data loads. Size it with className (h-*, w-*). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse bg-ink/10 ${className}`} />
}
