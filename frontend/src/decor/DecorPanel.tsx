import { decorArt } from './decorArt.ts'
import type { DecorItem, DecorSide } from './decorApi.ts'

/**
 * A side of the child's dashboard: the decor they placed there, just the pictures standing in the margin,
 * no frames or labels. Nothing placed means an empty margin (the Decorate button is how to add some).
 */
export function DecorPanel({ side, items }: { side: DecorSide; items: DecorItem[] }) {
  const mine = items.filter((i) => i.side === side)
  return (
    <aside aria-label={`Decor, ${side} side`} className="flex flex-col items-center gap-8">
      {mine.map((i) => (
        <DecorPiece key={i.reward_id} item={i} />
      ))}
    </aside>
  )
}

/** One placed item as it stands on the page. Items without artwork show their initial, large and faint. */
export function DecorPiece({ item, className = 'max-h-56 w-full' }: { item: DecorItem; className?: string }) {
  const art = decorArt(item.title)
  return art ? (
    <img src={art} alt={item.title} title={item.title} className={`object-contain ${className}`} />
  ) : (
    <span title={item.title} aria-label={item.title} className="text-d1 leading-none font-light text-brand/30">
      {item.title.charAt(0).toUpperCase()}
    </span>
  )
}
