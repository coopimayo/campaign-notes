import { useEffect } from 'react'
import { useSession } from './auth.ts'
import { useAuthStore } from './store/auth.ts'

export function AuthSync() {
  const { data, isPending } = useSession()
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    setAuth({
      user: data?.user
        ? {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            image: data.user.image ?? null,
          }
        : null,
      isPending,
    })
  }, [data, isPending, setAuth])

  return null
}
