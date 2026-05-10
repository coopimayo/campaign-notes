import { eq, getTableColumns } from 'drizzle-orm'
import { db } from '../db/client.js'
import { campaigns, memberships } from '../db/schema.js'
import type { CreateCampaignInput } from '../domain/campaign.js'

export type CampaignRow = typeof campaigns.$inferSelect

export async function listCampaignsForUser(
  userId: string,
): Promise<CampaignRow[]> {
  return db
    .select(getTableColumns(campaigns))
    .from(campaigns)
    .innerJoin(memberships, eq(memberships.campaignId, campaigns.id))
    .where(eq(memberships.userId, userId))
    .orderBy(campaigns.createdAt)
}

export async function createCampaign(
  userId: string,
  input: CreateCampaignInput,
): Promise<CampaignRow> {
  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(campaigns)
      .values({ ownerId: userId, name: input.name })
      .returning()
    if (!campaign) throw new Error('campaign insert returned no row')
    await tx.insert(memberships).values({
      campaignId: campaign.id,
      userId,
      role: 'owner',
    })
    return campaign
  })
}
