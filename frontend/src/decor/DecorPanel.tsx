import { TextLink } from '../components/ui/Button.tsx'
import { DecorTile } from './DecorTile.tsx'
import type { DecorItem, DecorSide } from './decorApi.ts'

/** A side panel on the child's home: what they have placed on that side. */
export function DecorPanel({ side, items }: { side: DecorSide; items: DecorItem[] }) {
  const mine = items.filter((i) => i.side === side)
  return (
    <aside aria-label={`Decor, ${side} side`} className="flex flex-col gap-3">
      {mine.map((i) => (
        <DecorTile key={i.reward_id} item={i} />
      ))}
      {mine.length === 0 && (
        <div className="border border-dashed border-line p-3 text-xs text-muted">
          Empty. <TextLink to="/decor">Place decor</TextLink>
        </div>
      )}
    </aside>
  )
}
