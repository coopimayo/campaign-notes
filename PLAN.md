# Campaign Notes — Project Plan

A D&D campaign management tool centered on freeform notes with first-class graph visualization. Notes are typed entities (Location, NPC, Faction, Event, ...) connected by typed relationships, browsable both as a structured library and as an interactive node-link map.

The core design constraint is **extensibility**: adding a new kind of note ("Deity", "Spell", "Treasure Hoard") or a new kind of relationship ("worships", "owes a debt to") should not require touching engine code or the database schema.

---

## 1. Guiding principles

1. **Open type system.** Note types and edge types are *registered*, not hardcoded. Built-in types use the same registration mechanism that user-defined types will.
2. **Relationships are first-class data.** Edges are their own table with their own type registry, not foreign-key fields buried in a note.
3. **Storage-agnostic domain.** Domain services talk to a `StorageAdapter` interface. SQLite is the default; cloud sync becomes a different adapter later.
4. **Schema-driven, not migration-driven.** Type-specific fields live in a JSON column validated by a JSON Schema attached to the type definition. Adding a new type or field never requires a SQL migration.
5. **Local-first.** Data is a single file on the GM's disk. Sync, sharing, and player views are layered on top — never assumed.
6. **Composable views.** List, card, kanban, timeline, and map are all just consumers of the same query layer. Adding a new view means registering a `ViewProvider`, not rewriting data access.

---

## 2. Domain model

### Core entities

| Entity | Purpose |
|---|---|
| `Campaign` | Top-level container. Has its own settings, type registry overrides, and asset folder. |
| `Note` | A typed node. The atomic unit. Has common fields plus a type-specific `fields` blob. |
| `NoteType` | Registered type definition: key, label, icon, color, JSON Schema for extra fields, default edge types, optional custom editor component. |
| `Edge` | A typed, directed-or-undirected relationship between two notes. Carries its own properties. |
| `EdgeType` | Registered edge definition: key, label, allowed source/target types, directionality, style. |
| `Tag` | Lightweight free-form taxonomy, orthogonal to types. |
| `Attachment` | Files, images, hand-drawn maps, PDFs. |
| `MapView` | A named graph layout (a campaign can have several: "Political map", "Geographic map", "Faction web"). Stores per-note positions for that view. |

### Common Note fields

```
id, campaignId, type, title, summary, body, tags[],
fields (type-specific JSON), createdAt, updatedAt
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
┌──────────────────────────────────────────────────────────┐
│ UI shell (routing, layout, theming)                      │
├──────────────────────────────────────────────────────────┤
│ Views: List · Card · Editor · MapView · Timeline · ...   │
│   ↑ each view is a registered ViewProvider               │
├──────────────────────────────────────────────────────────┤
│ Plugin registries                                        │
│   • NoteTypeRegistry                                     │
│   • EdgeTypeRegistry                                     │
│   • ViewRegistry                                         │
│   • EditorExtensionRegistry (TipTap marks/nodes)         │
│   • HookRegistry  (pre/post create, update, delete)      │
├──────────────────────────────────────────────────────────┤
│ Domain services                                          │
│   • NoteService · EdgeService · SearchService            │
│   • CampaignService · ImportExportService                │
├──────────────────────────────────────────────────────────┤
│ StorageAdapter (interface)                               │
│   └── SqliteAdapter (default, local-first)               │
│   └── (future) RemoteAdapter, FileSystemAdapter          │
└──────────────────────────────────────────────────────────┘
```

### Extensibility seams

| Seam | What it lets you add | Without touching |
|---|---|---|
| `NoteTypeRegistry.register()` | New entity type with its own fields, icon, editor | Engine, DB, search |
| `EdgeTypeRegistry.register()` | New relationship kind with constraints + style | Engine, DB |
| `ViewRegistry.register()` | New way to browse data (e.g. timeline) | Existing views |
| `EditorExtensionRegistry` | New TipTap nodes/marks (e.g. dice rolls, stat blocks) | Editor core |
| `HookRegistry.on('note:created', fn)` | Cross-cutting behavior (auto-linking, indexing, audit) | Domain services |
| `StorageAdapter` | Swap or layer storage (cloud sync, encrypted backup) | Domain code |

### Why a registry pattern (vs. inheritance)

Subclassing `Note` per type forces the type set to be known at compile time and makes plugin loading awkward. A registry holds plain data + handler functions, can be populated at startup, and can be extended by user config or a plugin manifest without recompiling.

---

## 4. Data model

```sql
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER, updated_at INTEGER
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- key into NoteTypeRegistry
  title TEXT NOT NULL,
  summary TEXT,
  body_json TEXT,                -- TipTap document
  fields_json TEXT NOT NULL DEFAULT '{}',   -- type-specific
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX idx_notes_campaign_type ON notes(campaign_id, type);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  from_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  to_note_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- key into EdgeTypeRegistry
  label TEXT,
  properties_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX idx_edges_from ON edges(from_note_id);
CREATE INDEX idx_edges_to   ON edges(to_note_id);
CREATE INDEX idx_edges_type ON edges(campaign_id, type);

CREATE TABLE map_views (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  layout_json TEXT NOT NULL DEFAULT '{}',   -- {noteId: {x, y}}
  filter_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER, updated_at INTEGER
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  mime TEXT, kind TEXT, created_at INTEGER
);

CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, summary, body, content='notes', content_rowid='rowid'
);
```

The `_json` columns are a deliberate choice: type-specific fields and edge properties are owned by the registries, not the schema. The registry's JSON Schema validates writes; FTS triggers maintain the search index.

---

## 5. Map / graph view

- **Library**: React Flow (good DX, custom node renderers, built-in pan/zoom/minimap). Cytoscape.js is the alternative if we later need heavier graph algorithms.
- **Custom node renderer per NoteType** — registered alongside the type, so a Location node and an NPC node can look completely different.
- **Edge styling per EdgeType** — color, dash pattern, arrow style.
- **Layout**: manual positions persist to `map_views.layout_json`. Optional auto-layout via `dagre` or `elkjs` for first-time placement.
- **Filtering**: by type, tag, or arbitrary predicate; filter persists with the map view.
- **Multiple maps per campaign**: the same note can appear in many maps with different positions and different visible neighbors.
- **Click-through**: clicking a node opens the note editor in a side panel without leaving the map.

---

## 6. Proposed tech stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** | Native, small bundle, good filesystem access. Better than Electron for an offline GM tool. Web-only fallback remains possible. |
| UI | React + TypeScript + Vite | Standard, large ecosystem, fast iteration. |
| Styling | Tailwind + shadcn/ui | Fast, themable, fits a notes app aesthetic. |
| Graph | React Flow | Custom node renderers map cleanly to NoteType plugins. |
| Storage | SQLite (tauri-plugin-sql) | One-file campaign, FTS5 search built in. |
| Editor | TipTap (ProseMirror) | Extensible; entity @-mentions become a custom mark. |
| State | Zustand | Minimal boilerplate, scales fine. |
| Validation | Zod (+ JSON Schema bridge) | Type-safe registry definitions. |

A pure-web variant (IndexedDB via Dexie) is viable if desktop install is undesirable. Trade-off: campaigns become harder to back up by file copy.

---

## 7. Phased roadmap

**Phase 0 — Scaffold** (1–2 days)
Tauri + Vite + React project. SQLite wired up with migrations. Campaign list / create / open.

**Phase 1 — Core notes** (~1 week)
Built-in types Location and NPC. CRUD. TipTap editor. List + card views. Tags. FTS search.

**Phase 2 — Relationships** (3–4 days)
Edges with types. "Connections" panel on each note. `@mention` autocomplete in the editor that creates a `references` edge.

**Phase 3 — Map view** (~1 week)
React Flow integration. Manual + auto-layout. Per-type custom nodes. Per-edge-type styling. Filters. Multiple named map views per campaign.

**Phase 4 — Extensibility hardening** (3–4 days)
Move every built-in NoteType behind the public registry API (dogfooding). JSON-Schema-driven dynamic field editor. In-app type editor UI. Single-file campaign export/import.

**Phase 5 — Polish & extras** (ongoing)
Attachments. Session log + timeline view. Backup/restore. Themes. Optional cloud sync adapter. Player-facing read-only view.

---

## 8. Risks & how the design absorbs them

| Risk | Mitigation built into the design |
|---|---|
| Users want a note type we didn't anticipate | Registry + JSON-schema fields — no engine change needed. |
| Schema migrations get painful | Type-specific fields live in JSON; only structural changes require SQL migrations. |
| Map view doesn't scale past ~hundreds of nodes | Per-map filters; lazy-load nodes outside viewport; Cytoscape as a fallback if needed. |
| Single-user assumption breaks if sharing is needed | `StorageAdapter` interface lets us add a sync adapter without rewriting domain code. |
| Editor needs game-specific blocks (stat blocks, dice) | `EditorExtensionRegistry` already exists as a seam. |

---

## 9. Open questions

1. **Platform target**: Tauri desktop (recommended), Electron, or pure web PWA?
2. **Single-user only**, or eventual multi-GM / player sharing?
3. **Player view**: filtered read-only view per campaign, or GM-only forever?
4. **Plugin distribution**: are user-defined types config-only (JSON Schema) or full code plugins?
5. **Import sources**: do you want to bring in existing notes from Notion / Obsidian / World Anvil?
6. **In-world calendar**: do Events need a custom calendar (Forgotten Realms, Eberron, homebrew) or just freeform text dates?

Answers to 1, 2, and 4 most affect the architecture; the others can be deferred to Phase 5.
