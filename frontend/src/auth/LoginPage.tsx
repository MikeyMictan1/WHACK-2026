import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import { AuthLayout } from './AuthLayout.tsx'
import { useAuth } from './useAuth.ts'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/profile'

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (user) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    setPending(true)
    try {
      await login({ username: String(form.get('username')), password: String(form.get('password')) })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout
      title="Log in."
      aside="Your session lives in a secure, httpOnly cookie issued by the FastAPI backend."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <TextField label="Username" name="username" autoComplete="username" required />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormError message={error} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        No account yet?{' '}
        <Link to="/register" state={location.state} className="text-ink underline underline-offset-4">
          Create one
        </Link>
      </p>
    </AuthLayout>
  )
}
