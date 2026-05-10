import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { signOut } from '../auth.ts'
import { useAuthStore } from '../store/auth.ts'
import { listCampaigns } from '../api/campaigns.ts'
import type { Campaign } from '../domain/campaign.ts'
import { NewCampaignForm } from '../components/new-campaign-form.tsx'

export function CampaignsList() {
  const navigate = useNavigate()
  const userName = useAuthStore((s) => s.user?.name ?? '')
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const list = await listCampaigns()
      setCampaigns(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns')
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  function handleCreated(c: Campaign) {
    setCampaigns((prev) => (prev ? [c, ...prev] : [c]))
    refetch()
  }

  async function handleSignOut() {
    await signOut()
    useAuthStore.getState().setAuth({ user: null, isPending: false })
    navigate('/sign-in')
  }

  return (
    <div className="min-h-full bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <div className="flex items-center gap-3 text-sm">
          {userName && <span className="text-neutral-400">{userName}</span>}
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded border border-neutral-700 px-3 py-1 hover:bg-neutral-800"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <NewCampaignForm onCreated={handleCreated} />

        {error && (
          <div
            role="alert"
            className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {campaigns === null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No campaigns yet — create your first one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-neutral-500">
                  Created {new Date(c.createdAt).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
