import 'dotenv/config'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'

const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors({ origin: process.env.CORS_ORIGIN ?? '*' }))

app.get('/health', (c) => c.json({ status: 'ok' }))

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`)
})
