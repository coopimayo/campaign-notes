import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuthStore } from '../store/auth.ts'

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const isPending = useAuthStore((s) => s.isPending)

  if (isPending) return null
  if (!user) return <Navigate to="/sign-in" replace />
  return <>{children}</>
}
