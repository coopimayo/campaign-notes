import { z } from 'zod'

export const CampaignSchema = z.object({
  id: z.uuid(),
  ownerId: z.string(),
  name: z.string(),
  settings: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Campaign = z.infer<typeof CampaignSchema>

export const CreateCampaignInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>
