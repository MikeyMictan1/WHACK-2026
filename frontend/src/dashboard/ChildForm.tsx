import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import {
  APP_EXPERIENCE_PRESETS,
  CARD_TYPE_OPTIONS,
  PRESET_SETTINGS,
  type Child,
  type ChildInput,
  type ChildUpdate,
} from './childrenApi.ts'
import { ItemListField } from './ItemListField.tsx'
import { fromWc, itemsError, toDrafts, toWc, type ItemDraft } from './itemDrafts.ts'

type Props =
  | { mode: 'create'; onSubmit: (input: ChildInput) => Promise<void>; onCancel?: () => void }
  | { mode: 'edit'; child: Child; onSubmit: (input: ChildUpdate) => Promise<void>; onCancel: () => void }

const CUSTOM = 'custom'
const PRESETS: readonly string[] = APP_EXPERIENCE_PRESETS

const CUSTOM_OPTIONS = [
  { key: 'credit_score', label: 'Credit score', description: 'Enable credit score tracking for this account' },
]

function initialExperienceChoice(child: Child | null) {
  if (!child?.app_experience) return ''
  return PRESETS.includes(child.app_experience) ? child.app_experience : CUSTOM
}

function isPreset(choice: string): choice is keyof typeof PRESET_SETTINGS {
  return choice in PRESET_SETTINGS
}

const CARD_LABEL = new Map<string, string>(CARD_TYPE_OPTIONS.map((c) => [c.value, c.label]))

/** "Credit score off · DeerDebit, CaliccoCredit" for the selected preset. */
function presetSummary(choice: keyof typeof PRESET_SETTINGS) {
  const { creditScore, cardTypes } = PRESET_SETTINGS[choice]
  return `Credit score ${creditScore ? 'on' : 'off'} · ${cardTypes.map((c) => CARD_LABEL.get(c)).join(', ')}`
}

/** Add a child, or edit one (name, allowance, card type, app experience, optional password reset). */
export function ChildForm(props: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const child = props.mode === 'edit' ? props.child : null
  const [experienceChoice, setExperienceChoice] = useState(initialExperienceChoice(child))
  // Custom's own picks. Presets don't touch these, so switching back to Custom keeps them.
  const [customChecked, setCustomChecked] = useState<Set<string>>(
    new Set(
      initialExperienceChoice(child) === CUSTOM
        ? (child?.app_experience ?? '').split(',').filter((k) => CUSTOM_OPTIONS.some((o) => o.key === k))
        : ['credit_score'], // credit score is on by default
    ),
  )
  const [selectedCardTypes, setSelectedCardTypes] = useState<Set<string>>(
    new Set(initialExperienceChoice(child) === CUSTOM && child?.card_type ? child.card_type.split(',') : []),
  )
  const [items, setItems] = useState<ItemDraft[]>(() => toDrafts(child?.weekly_items ?? []))
  const [milestones, setMilestones] = useState<ItemDraft[]>(() => toDrafts(child?.milestones ?? []))

  function toggleCardType(value: string) {
    setSelectedCardTypes((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function toggleCustomOption(key: string) {
    setCustomChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const weekly_allowance = fromWc(String(form.get('weekly_allowance') ?? ''))
    const password = String(form.get('password') ?? '')

    if (weekly_allowance === null) {
      return setError('Enter a valid weekly allowance')
    }
    const app_experience =
      experienceChoice === CUSTOM
        ? [...customChecked].join(',') || CUSTOM
        : experienceChoice
    if (!app_experience) return setError('Choose an app experience level')
    if (experienceChoice === CUSTOM && selectedCardTypes.size === 0) {
      return setError('Select at least one card type')
    }
    // Presets send their own card types, as if the parent had picked exactly those.
    const card_type = isPreset(experienceChoice)
      ? PRESET_SETTINGS[experienceChoice].cardTypes.join(',')
      : [...selectedCardTypes].join(',')
    if ((props.mode === 'create' || password) && password.length < 4) {
      return setError('Password must be at least 4 characters')
    }
    const listError = itemsError(items, 'Weekly item', true) ?? itemsError(milestones, 'Milestone', false)
    if (listError) return setError(listError)
    const weekly_items = items.map((i) => ({
      name: i.name.trim(),
      cost: fromWc(i.cost) ?? 0,
      weekly_limit: Number(i.weekly_limit),
    }))
    const milestone_list = milestones.map((m) => ({ name: m.name.trim(), cost: fromWc(m.cost) ?? 0 }))

    setError(null)
    setPending(true)
    try {
      if (props.mode === 'create') {
        await props.onSubmit({
          username: String(form.get('username') ?? ''),
          password,
          weekly_allowance,
          app_experience,
          card_type,
          weekly_items,
          milestones: milestone_list,
        })
        formEl.reset()
        setExperienceChoice('')
        setCustomChecked(new Set())
        setSelectedCardTypes(new Set())
        setItems([])
        setMilestones([])
      } else {
        await props.onSubmit({
          weekly_allowance,
          app_experience,
          card_type,
          weekly_items,
          milestones: milestone_list,
          ...(password ? { password } : {}),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        {props.mode === 'create' && (
          <TextField
            label="Username"
            name="username"
            autoComplete="off"
            hint="They log in with this"
            required
          />
        )}
        <TextField
          label={props.mode === 'create' ? 'Password' : 'New password'}
          name="password"
          type="password"
          autoComplete="new-password"
          hint={props.mode === 'create' ? 'At least 4 characters' : 'Leave blank to keep it'}
          required={props.mode === 'create'}
        />
        <TextField
          label="Weekly allowance"
          name="weekly_allowance"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          defaultValue={child?.weekly_allowance != null ? toWc(child.weekly_allowance) : ''}
          hint="Amount in WC"
          required
        />
        <ItemListField
          label="Weekly items"
          meta="What they can order each week"
          noun="Item"
          placeholder="e.g. Comic book"
          items={items}
          onChange={setItems}
          withLimit
        />
        <ItemListField
          label="Milestones"
          meta="Bigger goals they can save towards"
          noun="Milestone"
          placeholder="e.g. New bike"
          items={milestones}
          onChange={setMilestones}
        />
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm font-medium">App experience</span>
          <div className="grid grid-cols-2 gap-px border border-ink/20 bg-ink/20 sm:grid-cols-4">
            {(
              [
                { value: '10+', sub: 'Kid-friendly, learning first' },
                { value: '13+', sub: 'Social features, light moderation' },
                { value: '15+', sub: 'Most features unlocked' },
                { value: CUSTOM, sub: 'Set your own age rating' },
              ] as const
            ).map(({ value, sub }) => (
              <label
                key={value}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 bg-paper px-3 py-4 text-center transition-colors ${
                  experienceChoice === value
                    ? 'bg-signal outline outline-2 -outline-offset-2 outline-ink'
                    : 'text-ink hover:bg-ink/5'
                }`}
              >
                <input
                  type="radio"
                  name="app_experience_choice"
                  value={value}
                  checked={experienceChoice === value}
                  onChange={() => setExperienceChoice(value)}
                  className="sr-only"
                />
                <span className="text-[15px] font-medium">{value === CUSTOM ? 'Custom' : value}</span>
                <span className={`text-xs leading-tight ${experienceChoice === value ? 'text-ink/60' : 'text-muted'}`}>
                  {sub}
                </span>
              </label>
            ))}
          </div>
          {isPreset(experienceChoice) && <p className="meta">{presetSummary(experienceChoice)}</p>}
          {experienceChoice === CUSTOM && (
            <div className="flex flex-col gap-3">
              <div className="divide-y divide-ink/10 border border-ink/20">
                {CUSTOM_OPTIONS.map(({ key, label, description }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 hover:bg-ink/5"
                  >
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted">{description}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={customChecked.has(key)}
                      onChange={() => toggleCustomOption(key)}
                      className="h-4 w-4 accent-ink"
                    />
                  </label>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Card type</span>
                <div className="grid grid-cols-5 gap-px border border-ink/20 bg-ink/20">
                  {CARD_TYPE_OPTIONS.map(({ value, label }) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer flex-col items-center justify-center gap-1 bg-paper px-2 py-3 text-center transition-colors ${
                        selectedCardTypes.has(value)
                          ? 'bg-signal outline outline-2 -outline-offset-2 outline-ink'
                          : 'text-ink hover:bg-ink/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCardTypes.has(value)}
                        onChange={() => toggleCardType(value)}
                        className="sr-only"
                      />
                      <span className="text-[13px] font-medium leading-tight">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {props.mode === 'create'
            ? pending
              ? 'Adding…'
              : 'Add child'
            : pending
              ? 'Saving…'
              : 'Save changes'}
        </Button>
        {props.onCancel && (
          <Button type="button" variant="light" className="border border-ink" onClick={props.onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
