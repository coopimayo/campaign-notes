import { Hono } from 'hono'
import { type AppEnv, requireUser } from '../auth.js'
import { CreateCampaignInputSchema } from '../domain/campaign.js'
import {
  createCampaign,
  listCampaignsForUser,
} from '../services/campaign-service.js'

export const campaignsRoutes = new Hono<AppEnv>()

campaignsRoutes.use('*', requireUser)

campaignsRoutes.get('/', async (c) => {
  const user = c.get('user')
  const rows = await listCampaignsForUser(user.id)
  return c.json(rows)
})

campaignsRoutes.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = CreateCampaignInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'invalid input', issues: parsed.error.issues },
      400,
    )
  }
  const row = await createCampaign(user.id, parsed.data)
  return c.json(row, 201)
})
