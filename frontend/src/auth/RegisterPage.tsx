import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import { AuthLayout } from './AuthLayout.tsx'
import { useAuth } from './useAuth.ts'

export function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (user) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password'))
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setError(null)
    setPending(true)
    try {
      await register({
        username: String(form.get('username')),
        password,
        display_name: String(form.get('display_name') ?? '').trim() || undefined,
      })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout
      title="Parents start here."
      aside="Sign up as a parent. You create and manage your kids' accounts from your dashboard."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <TextField label="Your name" name="display_name" autoComplete="name" hint="Optional" maxLength={40} />
        <TextField
          label="Username"
          name="username"
          autoComplete="username"
          hint="3–32 letters, numbers, . _ -"
          required
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          required
        />
        <FormError message={error} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Creating account…' : 'Create parent account'}
        </Button>
      </form>

      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" state={location.state} className="text-ink underline underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
