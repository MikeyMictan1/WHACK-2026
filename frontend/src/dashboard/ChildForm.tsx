import { useState, type FormEvent } from 'react'
import type { User } from '../auth/types.ts'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import { CHILD_MAX_AGE, CHILD_MIN_AGE, type ChildInput, type ChildUpdate } from './childrenApi.ts'

type Props =
  | { mode: 'create'; onSubmit: (input: ChildInput) => Promise<void>; onCancel?: () => void }
  | { mode: 'edit'; child: User; onSubmit: (input: ChildUpdate) => Promise<void>; onCancel: () => void }

/** Add a child, or edit one (name, age, optional password reset). */
export function ChildForm(props: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const child = props.mode === 'edit' ? props.child : null

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const display_name = String(form.get('display_name') ?? '').trim()
    const age = Number(form.get('age'))
    const password = String(form.get('password') ?? '')

    if (!display_name) return setError('Give your child a name')
    if (!Number.isInteger(age) || age < CHILD_MIN_AGE || age > CHILD_MAX_AGE) {
      return setError(`Age must be between ${CHILD_MIN_AGE} and ${CHILD_MAX_AGE}`)
    }
    if ((props.mode === 'create' || password) && password.length < 4) {
      return setError('Password must be at least 4 characters')
    }

    setError(null)
    setPending(true)
    try {
      if (props.mode === 'create') {
        await props.onSubmit({ username: String(form.get('username') ?? ''), password, display_name, age })
        formEl.reset()
      } else {
        await props.onSubmit({ display_name, age, ...(password ? { password } : {}) })
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
        <TextField
          label="Name"
          name="display_name"
          defaultValue={child?.display_name ?? ''}
          maxLength={40}
          required
        />
        <TextField
          label="Age"
          name="age"
          type="number"
          inputMode="numeric"
          min={CHILD_MIN_AGE}
          max={CHILD_MAX_AGE}
          defaultValue={child?.age ?? ''}
          hint={`${CHILD_MIN_AGE} to ${CHILD_MAX_AGE}`}
          required
        />
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
