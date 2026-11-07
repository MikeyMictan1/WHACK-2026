import type { ReactNode } from 'react'

/*
  A ruled sheet: a 12-column grid (4 on mobile) whose cells share 1px borders.
  The frame draws the top and left edges; every cell draws its own right and bottom,
  so cells of any span tile into one continuous table with no double lines.

  Column boundaries used across the site: 2 | 6 | 10 | 12.
*/

const SPAN_MD = {
  2: 'md:col-span-2',
  4: 'md:col-span-4',
  6: 'md:col-span-6',
  8: 'md:col-span-8',
  10: 'md:col-span-10',
  12: 'md:col-span-12',
} as const

const SPAN_SM = {
  1: 'col-span-1',
  3: 'col-span-3',
  4: 'col-span-4',
} as const

export const CELL_BORDER = 'border-r border-b border-ink/15'
export const CELL_PAD = 'p-6 md:p-8'

export function Sheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-4 border-t border-l border-ink/15 md:grid-cols-12 ${className}`}>
      {children}
    </div>
  )
}

type CellProps = {
  span: keyof typeof SPAN_MD
  /** Span on mobile (4 columns). Defaults to the full width. */
  sm?: keyof typeof SPAN_SM
  pad?: boolean
  className?: string
  children?: ReactNode
}

export function Cell({ span, sm = 4, pad = true, className = '', children }: CellProps) {
  return (
    <div className={`${SPAN_SM[sm]} ${SPAN_MD[span]} ${CELL_BORDER} ${pad ? CELL_PAD : ''} ${className}`}>
      {children}
    </div>
  )
}

/** Title row used at the top of every sheet: heading in cols 1–6, note in cols 7–12. */
export function SheetHeader({ title, note }: { title: string; note: ReactNode }) {
  return (
    <>
      <Cell span={6} className="flex min-h-48 items-end md:min-h-64">
        <h2 className="text-[clamp(2.5rem,5vw,4.25rem)] leading-[1] font-light tracking-[-0.035em]">
          {title}
        </h2>
      </Cell>
      <Cell span={6} className="flex items-end">
        <p className="max-w-md text-lead text-muted">{note}</p>
      </Cell>
    </>
  )
}
