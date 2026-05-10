import { useState, type FormEvent } from 'react'
import { createCampaign } from '../api/campaigns.ts'
import {
  CreateCampaignInputSchema,
  type Campaign,
} from '../domain/campaign.ts'

export function NewCampaignForm({
  onCreated,
}: {
  onCreated: (c: Campaign) => void
}) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = CreateCampaignInputSchema.safeParse({ name })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid name')
      return
    }
    setSubmitting(true)
    try {
      const created = await createCampaign(parsed.data)
      onCreated(created)
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <label className="block space-y-1">
        <span className="text-sm text-neutral-300">New campaign</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Curse of Strahd"
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
        disabled={submitting || name.trim().length === 0}
        className="self-start rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create'}
      </button>
    </form>
  )
}
