import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { MiddlewareHandler } from 'hono'
import { db } from './db/client.js'
import * as schema from './db/schema.js'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error('BETTER_AUTH_SECRET is not set')

const baseURL = process.env.BETTER_AUTH_URL
if (!baseURL) throw new Error('BETTER_AUTH_URL is not set')

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  secret,
  baseURL,
  trustedOrigins: process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : [],
})

export type AuthUser = typeof auth.$Infer.Session.user

export type AppEnv = {
  Variables: {
    user: AuthUser
  }
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', session.user)
  await next()
}
