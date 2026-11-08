import { decorArt } from './decorArt.ts'
import type { DecorItem } from './decorApi.ts'

/** One owned cosmetic: its artwork (or its first letter if it has none) and its name. */
export function DecorTile({ item, selected = false }: { item: DecorItem; selected?: boolean }) {
  const art = decorArt(item.title)
  return (
    <div
      className={`flex aspect-[3/4] flex-col items-center justify-end gap-2 border bg-white p-2 text-center ${
        selected ? 'border-brand outline outline-2 -outline-offset-2 outline-brand' : 'border-line'
      }`}
    >
      {art ? (
        <img src={art} alt="" className="min-h-0 w-full flex-1 object-contain" />
      ) : (
        <span className="flex flex-1 items-center text-d2 leading-none font-light text-brand">
          {item.title.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-xs leading-tight">{item.title}</span>
    </div>
  )
}
