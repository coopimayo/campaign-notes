import { z } from 'zod'
import {
  CampaignSchema,
  type Campaign,
  type CreateCampaignInput,
} from '../domain/campaign.ts'

const CampaignArraySchema = z.array(CampaignSchema)

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `${res.status} ${res.statusText}${body ? `: ${body}` : ''}`,
    )
  }
  return res.json()
}

export async function listCampaigns(): Promise<Campaign[]> {
  const json = await request('/api/campaigns')
  return CampaignArraySchema.parse(json)
}

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<Campaign> {
  const json = await request('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return CampaignSchema.parse(json)
}
