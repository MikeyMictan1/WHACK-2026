import { Button } from '../components/ui/Button.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import { newDraft, type ItemDraft } from './itemDrafts.ts'

type Props = {
  label: string
  meta: string
  /** Singular name for one row, e.g. "Item" or "Milestone". */
  noun: string
  placeholder: string
  items: ItemDraft[]
  onChange: (items: ItemDraft[]) => void
  /** Show the "Per week" column (weekly items only). */
  withLimit?: boolean
}

/** A growable list of name + cost (+ optional per-week limit) rows with an add button. */
export function ItemListField({ label, meta, noun, placeholder, items, onChange, withLimit = false }: Props) {
  function update(key: number, patch: Partial<ItemDraft>) {
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  }

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="meta">{meta}</span>
      </div>
      {items.length === 0 && (
        <p className="border border-ink/20 px-4 py-3 text-sm text-muted">No {label.toLowerCase()} yet.</p>
      )}
      {items.map((item, n) => (
        <div
          key={item.key}
          className={`grid items-end gap-3 border border-ink/20 p-4 ${
            withLimit ? 'sm:grid-cols-[1fr_7rem_7rem_auto]' : 'sm:grid-cols-[1fr_7rem_auto]'
          }`}
        >
          <TextField
            label={`${noun} ${n + 1}`}
            value={item.name}
            onChange={(e) => update(item.key, { name: e.target.value })}
            maxLength={60}
            placeholder={placeholder}
            autoComplete="off"
          />
          <TextField
            label="Cost"
            hint="WC"
            type="number"
            inputMode="numeric"
            min={0}
            value={item.cost}
            onChange={(e) => update(item.key, { cost: e.target.value })}
          />
          {withLimit && (
            <TextField
              label="Per week"
              hint="max"
              type="number"
              inputMode="numeric"
              min={1}
              value={item.weekly_limit}
              onChange={(e) => update(item.key, { weekly_limit: e.target.value })}
            />
          )}
          <Button
            type="button"
            variant="light"
            className="h-12 border border-ink"
            onClick={() => onChange(items.filter((i) => i.key !== item.key))}
            aria-label={`Remove ${noun.toLowerCase()} ${n + 1}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="light"
          className="border border-ink"
          onClick={() => onChange([...items, newDraft()])}
        >
          Add {noun.toLowerCase()}
        </Button>
      </div>
    </div>
  )
}
