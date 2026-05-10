import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { signIn, signUp } from '../auth.ts'

type Mode = 'sign-in' | 'sign-up'

export function SignIn() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const result =
      mode === 'sign-up'
        ? await signUp.email({ email, password, name })
        : await signIn.email({ email, password })
    setSubmitting(false)
    if (result.error) {
      setError(result.error.message ?? 'Something went wrong.')
      return
    }
    navigate('/campaigns')
  }

  function toggle() {
    setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'))
    setError(null)
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-neutral-950 text-neutral-100 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow"
      >
        <h1 className="text-xl font-semibold">
          {mode === 'sign-in' ? 'Sign in' : 'Create an account'}
        </h1>

        {mode === 'sign-up' && (
          <label className="block space-y-1">
            <span className="text-sm text-neutral-300">Name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-500"
            />
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-sm text-neutral-300">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-neutral-300">Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-500"
          />
        </label>

        {error && (
          <div
            role="alert"
            className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
        >
          {submitting
            ? 'Working…'
            : mode === 'sign-in'
              ? 'Sign in'
              : 'Create account'}
        </button>

        <button
          type="button"
          onClick={toggle}
          className="w-full text-center text-sm text-neutral-400 hover:text-neutral-200"
        >
          {mode === 'sign-in'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
