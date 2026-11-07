import type { DecorItem } from './decorApi.ts'

/** One owned cosmetic: a square with its first letter and its name. */
export function DecorTile({ item, selected = false }: { item: DecorItem; selected?: boolean }) {
  return (
    <div
      className={`flex aspect-square flex-col items-center justify-center gap-1 border bg-sky p-2 text-center ${
        selected ? 'border-ink outline outline-2 -outline-offset-2 outline-ink' : 'border-line'
      }`}
    >
      <span className="text-d3 leading-none font-light">{item.title.charAt(0).toUpperCase()}</span>
      <span className="text-xs leading-tight">{item.title}</span>
    </div>
  )
}
