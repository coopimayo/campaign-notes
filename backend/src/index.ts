import 'dotenv/config'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { auth, type AppEnv } from './auth.js'
import { campaignsRoutes } from './routes/campaigns.js'

const app = new Hono<AppEnv>()

app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  }),
)

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))

app.route('/api/campaigns', campaignsRoutes)

app.get('/health', (c) => c.json({ status: 'ok' }))

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`)
})
