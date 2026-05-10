import { create } from 'zustand'

export type AuthUser = {
  id: string
  email: string
  name: string
  image?: string | null
}

type AuthState = {
  user: AuthUser | null
  isPending: boolean
  setAuth: (next: { user: AuthUser | null; isPending: boolean }) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isPending: true,
  setAuth: (next) => set(next),
}))
