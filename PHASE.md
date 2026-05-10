# Phase 1 — Auth + first slice

Implements [PLAN.md](PLAN.md) §7 Phase 1: sign-in, session middleware,
`users` / `campaigns` / `memberships` tables, `GET`/`POST /api/campaigns`,
and a frontend campaign list + create flow.

## Decisions locked in

- **Auth provider**: Better-Auth, self-hosted, with **email + password as
  the only sign-in method for Phase 1**. Google OAuth and passkeys are
  deferred to a later phase; both can be added without schema migrations
  because Better-Auth's tables already accommodate multiple credential
  types side-by-side.
- **Memberships from day one**: ship the `memberships` table now even though
  it's single-GM today. Costs ~30 lines, saves a migration + ACL rewrite
  when sharing lands.
- **User table ownership**: Better-Auth generates and owns `users`,
  `sessions`, `accounts`, `verifications`. App tables (`campaigns`,
  `memberships`) reference `users.id` via FK.
- **API shape**: `requireUser` middleware on every campaign route. No
  unauthenticated reads in Phase 1.

---

## Prerequisites

### Backend `.env` additions

```
DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaign_notes
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3000
```

Update [backend/.env.example](backend/.env.example) with placeholders for
the two new keys.

---

## Step 1 — Install dependencies ✅

```sh
# backend/
npm i better-auth

# frontend/
npm i better-auth
```

Better-Auth ships both the server and the React client from the same
package, so no separate `@better-auth/react` install.

---

## Step 2 — Define the database schema ✅

File: [backend/src/db/schema.ts](backend/src/db/schema.ts)

Tables to add, in dependency order:

| Table | Owner | Purpose |
|---|---|---|
| `users` | Better-Auth | id, email, name, image, emailVerified, createdAt, updatedAt |
| `sessions` | Better-Auth | id, userId FK, expiresAt, token, ipAddress, userAgent |
| `accounts` | Better-Auth | id, userId FK, accountId, providerId, password hash, ... |
| `verifications` | Better-Auth | id, identifier, value, expiresAt |
| `campaigns` | App | id, ownerId FK→users, name, settings (jsonb), timestamps |
| `memberships` | App | PK (campaignId, userId), role enum, createdAt |

The four Better-Auth tables match the shape its Drizzle adapter expects
(generate them with the Better-Auth CLI: `npx @better-auth/cli generate`,
then commit). The two app tables follow [PLAN.md](PLAN.md) §4.

**Acceptance**: `npm run db:generate` emits a single migration;
`npm run db:migrate` applies cleanly against a fresh DB created by
`docker compose up -d`.

---

## Step 3 — Wire Better-Auth into the backend ✅

New file: `backend/src/auth.ts`

- Construct the Better-Auth instance with the Drizzle adapter pointing at
  the Postgres client.
- Enable `emailAndPassword` (Better-Auth's built-in credential provider).
  Disable email verification for Phase 1 — adding it requires an email
  sender (Resend / SES) we don't want to set up yet.
- Export `auth` plus a `requireUser` Hono middleware that:
  - Calls `auth.api.getSession({ headers: c.req.raw.headers })`.
  - On hit: `c.set('user', session.user)` and `await next()`.
  - On miss: returns `401`.

Edit: [backend/src/index.ts](backend/src/index.ts)

- Mount Better-Auth: `app.on(['POST','GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))`.

**Acceptance**: `POST /api/auth/sign-up/email` with `{ email, password, name }`
creates a row in `users` and returns a session cookie;
`POST /api/auth/sign-in/email` with the same credentials returns a
session cookie; `POST /api/auth/sign-out` clears it.

---

## Step 4 — Domain types + Zod schemas ✅

New file: `backend/src/domain/campaign.ts`

- `CampaignSchema` — the row shape returned to clients.
- `CreateCampaignInput` — `{ name: string }` (1–80 chars, trimmed).

Mirror these on the frontend at `frontend/src/domain/campaign.ts`. Defer
the shared-package decision until the first user-defined type lands
([PLAN.md](PLAN.md) §3).

---

## Step 5 — CampaignService ✅

New file: `backend/src/services/campaign-service.ts`

- `listCampaignsForUser(userId)` — selects from `campaigns` joined to
  `memberships` where `memberships.userId = userId`.
- `createCampaign(userId, input)` — single transaction: insert the
  campaign with `ownerId = userId`, then insert a `memberships` row with
  `role = 'owner'`. Returns the new campaign.

---

## Step 6 — Campaign routes ✅

New file: `backend/src/routes/campaigns.ts`

- `GET  /api/campaigns` — `requireUser`, returns user's campaigns.
- `POST /api/campaigns` — `requireUser`, body validated against
  `CreateCampaignInput`, returns the new campaign.

Mount in [backend/src/index.ts](backend/src/index.ts):
`app.route('/api/campaigns', campaignsRoutes)`.

**Acceptance**: with a session cookie, `curl` against both routes works;
without one, both return `401`. `POST` creates exactly one row each in
`campaigns` and `memberships`.

---

## Step 7 — Frontend auth client

New file: `frontend/src/auth.ts`

- Create the Better-Auth React client. Same-origin in dev (Vite proxies
  `/api` → `localhost:3000`), so no `baseURL` needed.
- Export `authClient`, `useSession`, `signIn`, `signUp`, `signOut`.

New file: `frontend/src/store/auth.ts`

- Thin Zustand store mirroring `useSession` for synchronous reads in
  route guards (avoids hook-only access).

---

## Step 8 — Sign-in page + protected route wrapper

Files:

- `frontend/src/views/sign-in.tsx` — email + password form with a
  "Sign up" / "Sign in" toggle. Sign-up calls
  `authClient.signUp.email({ email, password, name })`; sign-in calls
  `authClient.signIn.email({ email, password })`. On success, navigate
  to `/campaigns`. Surface server errors inline.
- `frontend/src/components/require-auth.tsx` — renders children when the
  session resolves to a user; otherwise `<Navigate to="/sign-in" />`.

Routing in [frontend/src/App.tsx](frontend/src/App.tsx) (add React Router
if not already present):

- `/sign-in` — public
- `/` and `/campaigns` — wrapped in `<RequireAuth>`

**Acceptance**: visiting `/campaigns` signed out lands on `/sign-in`;
signing up with a new email creates a user and returns to `/campaigns`;
signing out and back in with the same credentials works.

---

## Step 9 — Typed API client

New file: `frontend/src/api/campaigns.ts`

- `listCampaigns()` → `GET /api/campaigns`, response parsed with
  `z.array(CampaignSchema)`.
- `createCampaign(input)` → `POST /api/campaigns`, response parsed with
  `CampaignSchema`.

Both throw on non-2xx and on Zod parse failure (treat parse failure as a
hard bug, not a recoverable error).

---

## Step 10 — Campaign list + create UI

Files:

- `frontend/src/views/campaigns-list.tsx` — fetches on mount, renders the
  list with an empty state, shows a sign-out button in the header.
- `frontend/src/components/new-campaign-form.tsx` — name input + submit;
  on success, optimistically prepend then refetch.

**Acceptance**: signing in for the first time shows an empty list;
creating a campaign makes it appear; signing out and back in still shows
it; opening a second browser signed in with the same credentials sees
the same data.

---

## Step 11 — README updates

Edit [README.md](README.md):

- Document the two new env vars (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`)
  in the backend setup section.
- Update **Status** from "Phase 0 scaffold" to "Phase 1 — auth + campaigns".

---

## Verification checklist

- [ ] `npm run typecheck` passes in both `backend/` and `frontend/`.
- [ ] Fresh DB: `db:migrate` creates all six tables with FKs intact.
- [ ] Sign-up + sign-in flow works end-to-end: a new email creates a
      `users` row, sets a session cookie, and `useSession` returns the
      user; sign-out clears the cookie.
- [ ] `GET /api/campaigns` returns `401` without a session, `[]` with one
      for a brand-new user.
- [ ] `POST /api/campaigns` creates **one** row in `campaigns` and **one**
      in `memberships` (owner role) inside a single transaction.
- [ ] Second browser signed in with the same credentials sees the same
      campaign list.
- [ ] Sign-out clears the session cookie and protected routes redirect.

---

## Out of scope for Phase 1 (deferred)

- **Google OAuth** (and other social providers) — deferred. Adding Google
  later is one provider config in `auth.ts` + one frontend button; no
  schema migration needed because Better-Auth's `accounts` table already
  supports multiple providers per user.
- **Passkeys (WebAuthn)** — deferred. Better-Auth supports them natively;
  add when desired.
- **Email verification + password reset** — deferred. Both require an
  email sender (Resend / SES). Build when account recovery becomes a
  real concern.
- Campaign settings editor — Phase 5 (type-editor UI).
- Inviting other users / role management — Phase 6 (sharing).
- Notes, edges, map views — Phases 2–4.
- Per-campaign type-registry overrides — Phase 5.
