# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project purpose
Pathfinder: Wrath of the Righteous companion web app. Reads the game's `.zks` save files from disk, parses party/character/spellbook data, and provides:
- Live dashboard and character viewer
- Characters page (full stat block, equipment, feats, traits)
- Spell planner and party analysis
- Party Builder — role composition scoring and gap analysis
- Build Planner — per-character AI build analysis, role auto-detection, mythic path detection
- BubbleBuffs mod integration — config read/write, missing buff detection, AI buff guide
- AI Advisor (Claude Sonnet with full party context, AoN search tools, companion build meta)

## Knowledge sources (for AI system prompt and build advice)

### New player fundamentals
- **Spoiler-free New Player Guide** v0.4.12 (PF1e mechanics, combat, spellcasting, stacking, AC, skills): https://docs.google.com/document/d/10ccJ1jkX9Ox9m2Ra6R3qoK3DUwoxAIVvcIqlvNsMbbY/edit
  - Fetch as plain text: append `/export?format=txt` to URL
  - Covers sections 1-5 (fundamentals through spellcasting); sections 6+ not yet written
  - Key content in `SYSTEM_PROMPT`: bonus type stacking, AC types, demon DR/immunities/SR, flanking (CRPG rule), action economy, corruption, surprise round trick

### Build guides
- **cRPG Bro companion builds index**:
- **cRPG Bro builds organized by mythic path**: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/1kggr1p/crpg_bro_builds_organized_by_mythic_path/
- **Neoseeker WotR walkthrough** (quests, builds, gear, companion builds): https://www.neoseeker.com/pathfinder-wrath-of-the-righteous/walkthrough

### Community guide index (story mechanics, critical decisions, mythic paths)
All guides by u/Aeon (highly detailed datamined guides): https://www.reddit.com/r/Pathfinder_Kingmaker/comments/t1wj3k/index_of_my_guides_for_wrath/

**General guides**
- Checklist of Non-Essential Activities: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/qqgsqx/
- Companion Story Mechanics: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/qof5ei/
- Crusade Stats and Rank-Ups: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/qjsowb/
- Secret Ending Requirements: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/qj5bkd/
- Ending Slide Requirements: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/qs1gp3/
- Character Reactivity: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/ugf0ul/
- Mythic Reactivity: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/um1c0c/

**Mythic path guides** (datamined, covers unlock requirements, routes, army bonuses, unique endings)
- Aeon + Devil: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/qktpbv/
- Legend + Gold Dragon: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/qpucil/
- Angel + Azata: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/udan5y/
- Trickster: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/uife7g/
- Lich: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/up6wvg/
- Demon: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/utg1av/

**Small topic guides**
- Midnight Fane Final Conversation: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/qk3jhq/
- Protecting the Sword of Valor: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/udfl22/
- Hand of the Inheritor Respect: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/uv1d9a/
- Threshold Reinforcements: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/tsexn1/
- Gate Renown: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/v4c1ry/
- Misc Small Topics: https://www.reddit.com/r/Pathfinder_Kingmaker/comments/vuodxu/

### Rules reference
- **Archives of Nethys** (PF1e rules, live search via AI tools): https://www.aonprd.com

The companion build meta, mythic synergies, unlock requirements, and critical decisions are embedded in `src/server/routes/ai.ts` `SYSTEM_PROMPT`. Fetch the guides above via PowerShell `Invoke-WebRequest` with the `.json?raw_json=1` suffix to get raw markdown when updating.

## Key technologies
- **Runtime**: Bun (all scripts use `bun:sqlite`, `Bun.spawn`, etc. — no Node)
- **Backend**: Hono v4 (lightweight HTTP framework), runs on port 3000
- **Frontend**: React 19 + Vite, Tailwind CSS (custom spaceduck theme), served from `src/client/`
- **AI**: `@anthropic-ai/sdk` with an agentic tool-call loop (max 8 iterations, tools: `search_rules`, `fetch_rule_page`)
- **Database**: `bun:sqlite` — `data/blueprints.db` is a pre-built SQLite index of game blueprint GUIDs
- **Save parsing**: `fflate` — `.zks` save files are zip archives containing `header.json`, `party.json`, etc.

## Setup
1. Copy `.env.example` → `.env` and fill in `ANTHROPIC_API_KEY`
2. Set `WOTR_GAME_DIR` if not at the default Steam path (`A:\SteamGames\...`)
3. Run the one-time blueprint indexer (requires game files):
   ```
   bun run index
   ```

## Commands
| Command | What it does |
|---|---|
| `bun run dev:all` | Start API (port 3000) + Vite (port 5173) together — preferred for development |
| `bun run dev` | API server only, with `--watch` |
| `bun run dev:client` | Vite dev server only |
| `bun run index` | One-time: build `data/blueprints.db` from game's `blueprints.zip` and Mods |
| `bun run build:client` | Vite production build → `dist/client/` |
| `bun run start` | Production server (serves built client + API) |

There are no tests.

## Architecture

### Dual-server dev setup
In development, Vite (`:5173`) proxies `/api` and `/events` to the Bun server (`:3000`). In production, the Bun server serves the built client from `dist/client/` directly with SPA fallback.

### Blueprint database
`data/blueprints.db` is a SQLite index of ~250K game blueprint GUIDs (abilities, buffs, features, classes, items, etc.) built by `scripts/build-index.ts` from the game's `blueprints.zip` and mod `.jbp` files. It is **pre-built and committed** — `bun run index` only needs re-running when the game or mods change. `blueprint-db.ts` opens it read-only with a 32MB cache. All GUID resolution happens via a single bulk `lookupBlueprintsMany()` call before parsing begins.

### Save parsing flow
`save-parser.ts` → unzips `.zks` → reads `header.json` + `party.json` → builds a **global** `$id→object` map from the entire party JSON (`buildIdMap`), resolves all JSON.NET `$ref` back-references per entity (`resolveRefsWithMap`) — this is essential because equipped items are often defined in one entity and referenced via `$ref` in another → collects all blueprint GUIDs → bulk-resolves via `lookupBlueprintsMany()` → maps to typed `PartyData`.

Key quirks discovered through reverse engineering:
- `m_SelectionsByLevel` values are **arrays** `["guid"]`, not bare strings — both GUID collection and feat parsing must handle this
- Equipment slots (`PrimaryHand`) are `HandSlot` objects with `m_ItemRef` (a character UniqueId), not `m_Blueprint` directly — items live in `Facts.m_Facts[N].SourceItem.Collection.m_Items`
- Mythic path classes appear as additional entries in `prog.Classes` — detected via `MYTHIC_CLASS_MAP` in save-parser
- All class GUIDs including mythic paths must be prefetched before parsing

### Live save updates (SSE)
`file-watcher.ts` watches the saves directory for `.zks` changes (800ms debounce). `GET /events` returns an SSE `Response` from a `ReadableStream`. The server exports `idleTimeout: 255` (Bun's maximum) to keep these connections alive. The client uses `useLiveSave` hook which connects via `EventSource("/events")` and re-fetches `/api/party` + `/api/analysis` on `save-updated` events.

### AI Advisor
`routes/ai.ts` implements an agentic loop (up to 8 iterations) against `claude-sonnet-4-5`. On each iteration it calls the Anthropic API with `AON_TOOLS`, handles `tool_use` stop reason by executing `search_rules`/`fetch_rule_page` in parallel, then appends results and loops. On `end_turn`, it chunks the final text into 40-char SSE events (`{ text }`) to simulate streaming. Tool call status is sent as `{ tool, input }` events so the client can display "Searching AoN..." inline.

### BubbleBuffs integration
`services/bubble-buffs.ts` reads and **writes** `{GAME_DIR}/Mods/BubbleBuffs/UserSettings/bubblebuff-{GameId}.json`. The `GameId` is extracted from `header.json` inside the `.zks` save. The route (`GET /api/bubbles`) classifies party spells as pre-combat buffs, scores them by priority, and diffs against the existing BubbleBuffs config to show what's missing. `POST /api/bubbles/add` calls `addBbBuff()` to append a new entry to the config file. `formatGuid()` converts 32-char hex GUIDs to UUID-with-dashes format that BubbleBuffs expects.

**Do not write to BubbleBuffs config while the game is running** — the game will overwrite it on next save.

### Party Builder
`services/party-builder.ts` scores each character 0–5 across six roles (Frontline, Damage, Healer, Buffer, Control, Utility) using class baselines + feat/spell/equipment signals + saved `BuildProfile` role. `GET /api/party-builder` returns `PartyComposition` with per-character scores, party-level max scores, gaps (≤1), strengths (≥4), synergies, and advice.

### Build Planner / AI Analysis
`routes/saves.ts` hosts `GET /api/builds/:id/advice` for rule-based advice (only meaningful for manually-built PC). The Build Planner page always shows an AI analysis panel first — no saved profile required. `AiStream` (`src/client/components/AiStream.tsx`) is a reusable streaming component used in Build Planner and BubbleBuffs; it **must have `key={characterId}`** to reset state when the character changes.

## Code structure
- `src/server/models/types.ts` — all shared TypeScript types (`PartyData`, `CharacterData`, `SpellbookData`, `Blueprint`, `PartyComposition`, `BuildProfile`, etc.)
- `src/server/routes/saves.ts` — all non-AI endpoints, mounts at `/api`
- `src/server/routes/ai.ts` — AI chat endpoint (`POST /api/ai/chat`), contains `SYSTEM_PROMPT` with companion build meta
- `src/server/services/save-parser.ts` — `.zks` parsing, JSON.NET `$ref` resolution, feat/equipment/mythic detection
- `src/server/services/bubble-buffs.ts` — BubbleBuffs config read + write
- `src/server/services/party-builder.ts` — role scoring engine
- `src/server/services/build-advisor.ts` — rule-based build advice (role-keyed feat/stat checklists)
- `src/server/services/build-store.ts` — JSON file persistence for `BuildProfile` records (`data/builds.json`)
- `src/client/components/AiStream.tsx` — reusable inline AI streaming panel; always use `key=` prop to reset on context change
- `src/client/hooks/useLiveSave.ts` — central data hook; all pages that need save data call this
- `src/client/pages/` — one file per page, imported conditionally in `App.tsx`

## Path aliases
Configured in both `tsconfig.json` and `vite.config.ts`:
- `@client/*` → `src/client/*`
- `@models/*` → `src/server/models/*`
- `@server/*` → `src/server/*`

## Tailwind theme
Custom spaceduck-inspired palette defined in `tailwind.config.ts`. Key tokens used throughout the UI:
- Backgrounds: `bg-bg-base`, `bg-bg-panel`, `bg-bg-elevated`
- Borders: `border-bg-border`, `border-bg-border2`
- Text: `text-text-base`, `text-text-muted`, `text-text-dim`
- Accent colors: `text-purple` / `bg-purple/20`, `text-cyan`, `text-green`, `text-orange`
