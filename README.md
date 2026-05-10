# Campaign Notes

A cloud-backed notes app for D&D campaigns, with typed notes (Locations,
NPCs, Factions, ...) and a graph view that connects them.

See [PLAN.md](PLAN.md) for the design rationale and roadmap. Note: the plan
was originally drafted for a local-first PWA — the data model and
extensibility seams still apply, but the architecture section will be
refreshed to reflect the cloud (client + API + Postgres) approach.

## Repo layout

```
.
├── frontend/   React + Vite SPA
├── backend/    Node + Hono + Drizzle + Postgres API
└── PLAN.md     Architecture, extensibility model, phased roadmap
```

## Tech stack

**Frontend** — React + TypeScript + Vite, Tailwind 4, Zustand for state.
Dev server proxies `/api` to the backend.

**Backend** — Node + TypeScript + Hono (HTTP), Drizzle (ORM/migrations),
PostgreSQL (with JSONB for type-specific note fields), Zod (validation).

**Local Postgres** — runs via the `docker-compose.yml` in `backend/`.

## Getting started

### 1. Start Postgres

```sh
cd backend
docker compose up -d
```

### 2. Backend

```sh
cd backend
npm install                    # already done if you just cloned
cp .env.example .env
npm run dev                    # http://localhost:3000  (GET /health → ok)
```

Drizzle commands (no schema yet, so these are no-ops until Phase 1):

```sh
npm run db:generate            # generate migration from schema diff
npm run db:migrate             # apply migrations to the DB
npm run db:push                # push schema directly (dev only)
npm run db:studio              # open Drizzle Studio
```

### 3. Frontend

```sh
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

## Project structure

```
frontend/src/
├── api/          Typed API client (fetch wrappers)
├── components/   Shared UI
├── views/        Top-level views (list, map, editor, ...)
├── registries/   NoteType / EdgeType / View registries — extensibility seam
├── domain/       Shared domain types
├── store/        Zustand stores
├── App.tsx
└── main.tsx

backend/src/
├── routes/       Hono route modules
├── services/     Business logic
├── db/
│   ├── client.ts   Drizzle client
│   └── schema.ts   Drizzle schema (empty until Phase 1)
├── domain/       Domain types
├── registries/   Server-side type registries
└── index.ts      Hono app entry
```

Adding a new note type or edge type registers with the appropriate registry
on both sides — no engine, route, or DB-schema changes required (type
fields live in JSONB, validated via Zod). See PLAN.md for details.

## Status

Phase 0 scaffold. Frontend builds, backend boots and serves `/health`.
No domain logic, no auth, no real routes yet.
