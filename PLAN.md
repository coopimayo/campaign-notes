# Campaign Notes — Project Plan

A D&D campaign management tool centered on freeform notes with first-class graph visualization. Notes are typed entities (Location, NPC, Faction, Event, ...) connected by typed relationships, browsable both as a structured library and as an interactive node-link map.

The core design constraint is **extensibility**: adding a new kind of note ("Deity", "Spell", "Treasure Hoard") or a new kind of relationship ("worships", "owes a debt to") should not require touching engine code or the database schema.

---

## 1. Guiding principles

1. **Open type system.** Note types and edge types are *registered*, not hardcoded. Built-in types use the same registration mechanism that user-defined types will. Registries live on **both** the client (for rendering) and the server (for validation).
2. **Relationships are first-class data.** Edges are their own table with their own type registry, not foreign-key fields buried in a note.
3. **Schema-driven, not migration-driven.** Type-specific fields live in a `JSONB` column validated by a Zod schema attached to the type definition. Adding a new type or field never requires a SQL migration.
4. **API as the source of truth.** The frontend never talks to the DB directly. All reads and writes go through typed Hono routes with Zod-validated I/O.
5. **Multi-device by default.** Data lives in Postgres on the server; any browser signed in to the same account sees the same campaigns. Real-time presence and collaborative editing are layered on top, not assumed.
6. **Composable views.** List, card, kanban, timeline, and map are all consumers of the same query layer. Adding a new view means registering a `ViewProvider`, not rewriting data access.

---

## 2. Domain model

### Core entities

| Entity | Purpose |
|---|---|
| `User` | Account owner. |
| `Campaign` | Top-level container. Has its own settings, type registry overrides, and asset folder. |
| `Membership` | Joins a User to a Campaign with a role (owner / GM / player). |
| `Note` | A typed node. The atomic unit. Has common fields plus a type-specific `fields` blob. |
| `NoteType` | Registered type definition: key, label, icon, color, Zod schema for extra fields, default edge types, optional custom editor component. |
| `Edge` | A typed, directed-or-undirected relationship between two notes. Carries its own properties. |
| `EdgeType` | Registered edge definition: key, label, allowed source/target types, directionality, style. |
| `Tag` | Lightweight free-form taxonomy, orthogonal to types. |
| `Attachment` | Files, images, hand-drawn maps, PDFs. Stored in object storage; row tracks metadata. |
| `MapView` | A named graph layout (a campaign can have several: "Political map", "Geographic map", "Faction web"). Stores per-note positions for that view. |

### Common Note fields

```
id, campaignId, type, title, summary, body, tags[],
fields (type-specific JSONB), createdAt, updatedAt
```

Per-map positions live on `MapView`, not on `Note`, so the same note can sit in different places in different views.

### Built-in types (all registered the same way user types will be)

- **Location** — region, parent location, climate, population
- **NPC** — race, role, status (alive/dead/unknown), affiliations
- **Faction** — alignment, headquarters, goals
- **Event** — date (in-world), participants
- **Item** — rarity, attunement, current owner
- **Quest** — status, giver, reward
- **Lore** — known-by, source

### Built-in edge types

- `located_in`, `member_of`, `allied_with`, `enemy_of`, `parent_of`, `owns`, `knows`, `participated_in`, `references`

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (React SPA, Vite, browser)                          │
│                                                              │
│   UI shell · routing · theming                               │
│   Views: List · Card · Editor · MapView · ...                │
│   Plugin registries (client side)                            │
│     • NoteTypeRegistry · EdgeTypeRegistry                    │
│     • ViewRegistry · EditorExtensionRegistry                 │
│     • HookRegistry  (client-side hooks)                      │
│   Zustand stores (UI state, request cache)                   │
│   Typed API client (fetch + Zod-parsed responses)            │
└────────────────────────┬─────────────────────────────────────┘
                         │  HTTPS (cookie session / token)
┌────────────────────────▼─────────────────────────────────────┐
│ Backend (Hono on Node, single deployable)                    │
│                                                              │
│   HTTP routes (Hono) — Zod-validated request/response        │
│   Auth middleware                                            │
│   Domain services                                            │
│     • NoteService · EdgeService · SearchService · ...        │
│   Plugin registries (server side, mirror client)             │
│     • Validation rules                                       │
│     • Hooks (audit, search index, cascade rules)             │
│   Drizzle ORM                                                │
└────────────────────────┬─────────────────────────────────────┘
                         │  pg
┌────────────────────────▼─────────────────────────────────────┐
│ PostgreSQL                                                   │
│   Tables: users, campaigns, memberships, notes, edges,       │
│           map_views, attachments                             │
│   JSONB for type-specific fields · tsvector for FTS          │
└──────────────────────────────────────────────────────────────┘
```

### Why a registry on both sides

The frontend needs the registry to render type-specific cards and editors. The backend needs the *same* registry to validate writes. If they drift, client-side validation passes but server-side rejects — bad UX.

Resolution options (we'll commit when the first user-defined type lands):
- Define each type once in a module imported by both client and server (npm workspaces or a shared package).
- Or define types on the server and ship runtime metadata to the client at session start via `GET /api/types`.

### Extensibility seams

| Seam | What it lets you add | Without touching |
|---|---|---|
| `NoteTypeRegistry.register()` (both sides) | New entity type with its own fields, icon, editor | Engine, DB, search |
| `EdgeTypeRegistry.register()` (both sides) | New relationship kind with constraints + style | Engine, DB |
| `ViewRegistry.register()` (frontend) | New way to browse data (timeline, kanban, ...) | Existing views |
| `EditorExtensionRegistry` (frontend) | New TipTap nodes/marks (dice rolls, stat blocks) | Editor core |
| Service hooks (`note:created`, etc — server) | Cross-cutting behavior (audit, search index, webhooks) | Domain services |
| New Hono route module | New API surface | Existing routes |

### Why a registry pattern (vs. inheritance)

Subclassing `Note` per type forces the type set to be known at compile time and makes plugin loading awkward. A registry holds plain data + handler functions, can be populated at startup, and can be extended by user config without recompiling.

---

## 4. Data model (Postgres)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'gm', 'player')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                 -- key into NoteTypeRegistry
  title TEXT NOT NULL,
  summary TEXT,
  body JSONB,                         -- TipTap document
  fields JSONB NOT NULL DEFAULT '{}', -- type-specific
  tags TEXT[] NOT NULL DEFAULT '{}',
  search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', title), 'A') ||
      setweight(to_tsvector('english', coalesce(summary, '')), 'B')
    ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notes_campaign_type_idx ON notes(campaign_id, type);
CREATE INDEX notes_tags_gin_idx     ON notes USING GIN (tags);
CREATE INDEX notes_fields_gin_idx   ON notes USING GIN (fields);
CREATE INDEX notes_search_idx       ON notes USING GIN (search_vector);

CREATE TABLE edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  from_note_id UUID NOT NULL REFERENCES notes(id)     ON DELETE CASCADE,
  to_note_id   UUID NOT NULL REFERENCES notes(id)     ON DELETE CASCADE,
  type TEXT NOT NULL,                 -- key into EdgeTypeRegistry
  label TEXT,
  properties JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX edges_from_idx          ON edges(from_note_id);
CREATE INDEX edges_to_idx            ON edges(to_note_id);
CREATE INDEX edges_campaign_type_idx ON edges(campaign_id, type);

CREATE TABLE map_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  layout JSONB NOT NULL DEFAULT '{}',  -- {noteId: {x, y}}
  filter JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  storage_url TEXT NOT NULL,
  mime TEXT, kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Notes:
- `JSONB` (not `JSON`) — queryable, indexable.
- Type-specific fields in `fields` are validated by the registry's Zod schema on write.
- Full-text search is a generated `tsvector` + GIN index. Body text can be added by parsing TipTap JSON later if needed.
- Cascade deletes propagate the entire campaign tree.

---

## 5. Map / graph view

- **Library**: React Flow (good DX, custom node renderers, built-in pan/zoom/minimap). Cytoscape.js is the fallback if we ever need heavier graph algorithms.
- **Custom node renderer per NoteType** — registered alongside the type, so a Location node and an NPC node can look completely different.
- **Edge styling per EdgeType** — color, dash pattern, arrow style.
- **Layout**: manual positions persist to `map_views.layout` via `PUT /api/campaigns/:id/maps/:mapId` (debounced on the client). Optional auto-layout via `dagre` or `elkjs` for first-time placement.
- **Filtering**: by type, tag, or arbitrary predicate; filter persists with the map view.
- **Multiple maps per campaign**: the same note can appear in many maps with different positions and different visible neighbors.
- **Click-through**: clicking a node opens the note editor in a side panel without leaving the map.

---

## 6. Tech stack

### Frontend

| Layer | Choice | Why |
|---|---|---|
| Framework | React + TypeScript + Vite | Standard, large ecosystem, fast iteration. |
| Styling | Tailwind 4 + shadcn/ui | Fast, themable. |
| State | Zustand | Minimal boilerplate. |
| Editor | TipTap (ProseMirror) | Extensible; entity @-mentions become a custom mark. |
| Graph | React Flow | Custom node renderers map cleanly to NoteType plugins. |
| Routing | React Router | Standard. |
| API client | Typed `fetch` wrappers + Zod-parsed responses | Lightweight; tRPC remains an option if the surface grows. |

### Backend

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js | Boring, well-supported. |
| HTTP | Hono | Fast, modern, runs on Node/Bun/edge if portability ever matters. |
| ORM | Drizzle | TypeScript-first, lightweight, excellent migrations. |
| DB | PostgreSQL | JSONB + GIN indexes + tsvector make schema-driven note types and search trivial. |
| Validation | Zod | Single source of truth for API I/O *and* registry field schemas. |
| Auth | TBD — Lucia / Better-Auth / Auth.js / managed | Open question (§9). |

### Local dev

PostgreSQL via `backend/docker-compose.yml`. Frontend dev server proxies `/api` to the backend on `localhost:3000`.

### Deployment (later)

- **Frontend**: any static host (Vercel / Netlify / Cloudflare Pages / S3 + CloudFront).
- **Backend**: any Node host (Fly / Railway / Render).
- **Postgres**: Neon / Supabase / managed RDS.
- **Attachments**: S3-compatible blob storage (R2, S3, Backblaze).

---

## 7. Phased roadmap

**Phase 0 — Scaffold** ✅
Frontend (Vite + React + TS + Tailwind 4 + Zustand). Backend (Hono + Drizzle + Postgres + Zod). Health route. docker-compose for local Postgres.

**Phase 1 — Auth + first slice** (~1 week)
Sign-up / sign-in. Session middleware. `users`, `campaigns`, `memberships` tables and migrations. `GET/POST /api/campaigns`. Frontend campaign list + create flow.

**Phase 2 — Core notes** (~1 week)
Built-in types Location and NPC, registered on both sides. Notes CRUD over `/api/campaigns/:id/notes`. TipTap editor. List + card views. Tags. Full-text search via tsvector.

**Phase 3 — Relationships** (3–4 days)
Edges with types. "Connections" panel on each note. `@mention` autocomplete in the editor that creates a `references` edge.

**Phase 4 — Map view** (~1 week)
React Flow integration. Manual + auto-layout. Per-type custom nodes. Per-edge-type styling. Filters. Multiple named map views per campaign.

**Phase 5 — Extensibility hardening** (3–4 days)
Move every built-in NoteType behind the public registry API (dogfooding). Dynamic field editor driven by Zod schemas. In-app type editor UI. Campaign export/import.

**Phase 6 — Sharing, real-time, polish** (ongoing)
Player-facing read-only view via `memberships.role`. Live updates (SSE or WebSocket). Attachments via S3-compatible storage. Themes. Audit log. Optional collaborative editing (Yjs over WebSocket) if real-time co-editing becomes a goal.

---

## 8. Risks & how the design absorbs them

| Risk | Mitigation built into the design |
|---|---|
| Users want a note type we didn't anticipate | Registry + JSONB fields — no engine change needed. |
| Schema migrations get painful | Type-specific fields live in JSONB; only structural changes require SQL migrations. |
| Map view doesn't scale past ~hundreds of nodes | Per-map filters; lazy-load nodes outside viewport; Cytoscape as a fallback. |
| Editor needs game-specific blocks (stat blocks, dice) | `EditorExtensionRegistry` exists as a seam. |
| GM has no internet at the table | Phase 6: Service Worker cache for read paths + offline write queue. Localized work, not a re-architecture. |
| Server outage takes everyone offline | Same mitigation as above + managed Postgres with automated backups. |
| Multi-user write conflicts | Optimistic UI + last-writer-wins per-field on most entities; Yjs for the rich-text body if collab editing becomes a goal. |
| Client and server registries drift | Define types in code shared by both, or expose `/api/types` and have the client hydrate at session start. |

---

## 9. Open questions

1. ~~**Platform target**: Tauri desktop, Electron, or pure web?~~ → **Web SPA + cloud API.**
2. **Auth provider**: Lucia / Better-Auth (self-hosted, full control) vs. Auth.js (familiar, batteries) vs. a managed provider (Clerk, Supabase Auth, WorkOS). Most affects Phase 1.
3. **Memberships from day one?** Even if today is single-GM, modelling `memberships` early costs little and saves a migration later. Recommended: yes.
4. **Plugin distribution**: are user-defined types config-only (Zod schema delivered as JSON) or full code plugins?
5. **Real-time co-editing**: GM editing during session vs. between sessions. SSE/polling may suffice for the latter; co-editing the same note pushes us toward Yjs.
6. **Hosting target**: Fly / Railway / self-host / edge functions? Affects how Hono is configured (long-lived Node vs. per-request edge).
7. **Import sources**: do you want to bring in existing notes from Notion / Obsidian / World Anvil?
8. **In-world calendar**: do Events need a custom calendar (Forgotten Realms, Eberron, homebrew) or just freeform text dates?

Answers to **2 and 3** most affect the next phase.
