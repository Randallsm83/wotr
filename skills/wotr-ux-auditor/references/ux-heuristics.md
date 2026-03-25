# UX Heuristics — WotR Companion App Audit Reference

Heuristics adapted for this specific app. Apply these lenses at every screen during the audit.

---

## 1. Visibility of System Status

The app must always show the user what's happening with their save data.

Check:
- Is the live save watcher status always visible in the sidebar (`● Live save connected`)?
- When a save update fires (SSE `save-updated` event), is there visible feedback before new data renders?
- When the AI Advisor is streaming a response, is there a clear in-progress indicator?
- When the BubbleBuffs "Add" action is in flight, is there a loading state on the button?
- Is stale data (last update time) visible anywhere — so the user knows the data isn't live?

Known risk: SSE events trigger `/api/party` + `/api/analysis` re-fetches — if no loading indicator is shown during these fetches, the UI can appear frozen for 200–600ms while large save files parse.

---

## 2. Match Between System and the Real World

Language should match how Pathfinder players think about their party, not how the code models it.

Check:
- **"Coverage"** on the Dashboard — does this match the player's mental model (e.g. "do I have a healer?")?
- **"CC"** (crowd control) — is this abbreviated or spelled out?
- **"Alignment score"** in Build Planner — "alignment" is a Pathfinder moral axis (Lawful Good, etc.). Using it to mean "build fit score" could confuse players.
- **"Mythic path"** — is this label consistent with how the game presents it?
- **"Blueprint index"** — this is a technical implementation term not meaningful to players.
- **"BubbleBuffs config"** — players know this as a mod name, but "config" may be opaque.
- **"Known but not prepared"** — clear for spell casters, but needs visual context.
- **"Priority group 1–4"** in BubbleBuffs — is 1 high priority or low priority?

---

## 3. User Control and Freedom

Players make mistakes. Escape hatches and reversibility matter.

Check:
- If a buff is added to BubbleBuffs config via the app, can it be removed again in-app?
- If a build profile is saved for a character (role, notes), can it be cleared or reset?
- Can the user dismiss or collapse the AI analysis panel in Build Planner?
- Is there any action in the app that is destructive and irreversible without warning?
- Can the user re-trigger the AI analysis for Build Planner without re-selecting the character?

---

## 4. Consistency and Standards

Similar things should look and behave the same across pages.

Check:
- Is character selection consistent — some pages may use tabs, others a dropdown or list?
- Do all "empty state when no save" messages follow the same format?
- Are loading spinners/skeletons consistent in appearance across pages?
- Do all pages that show character names use the same name format (first name only, full name)?
- Is the spaceduck color usage consistent — e.g. `text-purple` always used for active/selected, `text-green` always used for success signals?
- Are icon usage patterns consistent in the nav and on-page (decorative vs. meaningful)?

---

## 5. Error Prevention

The best error is the one the user never encounters.

Check:
- When adding a BubbleBuffs buff, is there any guard against adding a duplicate already in config?
- Is the game-running warning for BubbleBuffs write surfaced proactively, not just in docs?
- Does the Build Planner role dropdown default to a sensible value, or blank (forcing the user to pick before they get useful output)?
- Is `WOTR_SAVES_DIR` / `WOTR_GAME_DIR` misconfiguration caught early with a clear setup guide?
- Does the blueprint index check happen at startup — with a banner if it's missing — rather than silently failing on first data load?

---

## 6. Recognition Over Recall

Players shouldn't need to remember which page has which info or how the app works.

Check:
- Is it clear from each page what data it's showing (current save? historical? all characters?)?
- Are class names shown next to character names where relevant (e.g. "Ember — Oracle 12")?
- In Party Analysis, are buff names shown with spell level or context — or just raw names?
- In Build Planner, is the currently selected role always visible — not hidden behind a closed dropdown?
- Are the nav icons (`⚔ ▦ ✦ ⊞ ◎ ◉ ⌸ ◈`) legible and distinct, or do some look similar?
- Are AI Advisor slash commands shown in a list or hint somewhere — or only discoverable by typing?

---

## 7. Flexibility and Efficiency

Power users should be able to move fast. Casual players should not be blocked.

Check:
- Can a power user quickly jump between characters in Build Planner without waiting for AI re-analysis each time?
- Is there a way to batch-add multiple BubbleBuffs recommendations at once, rather than one by one?
- Can the user collapse or resize the sidebar to get more horizontal space on narrow screens?
- Is tab/keyboard navigation possible through the sidebar nav items?

---

## 8. Aesthetic and Minimalist Design

Game companion tools carry cognitive load. Clarity matters.

Check:
- Does the Dashboard feel scannable at a glance, or overwhelming with numbers?
- Is the spaceduck dark theme contrast sufficient? Specifically:
  - `text-text-dim` on `bg-bg-panel` — is this readable?
  - `text-purple` on `bg-bg-base` — is the active nav item legible?
  - `text-orange` / `text-green` on dark — are warning/success colors distinguishable?
- Are there any pages that show too much data without grouping or visual hierarchy?
- Are there pages where PF1e stat blocks could overwhelm a casual player?
- Is the sidebar (w-44 / 176px) proportionate — does it feel cramped or spacious?

---

## 9. Help Users Recognize, Diagnose, and Recover from Errors

Error messages should be plain-language, specific, and tell the user what to do.

Check:
- **Blueprint index missing**: Is the error message specific (`bun run index`) or just "error loading data"?
- **Save not found**: Does the message give the expected path and how to override it (`WOTR_SAVES_DIR`)?
- **No API key**: Does the AI Advisor clearly say "Add `ANTHROPIC_API_KEY` to your `.env`" or give a vague failure?
- **BubbleBuffs config not found**: Is `WOTR_GAME_DIR` mentioned with an example path?
- **Network errors** (API server down): What does the UI show when `/api/party` fails — blank, spinner, or error?
- **CORS/proxy misconfiguration in dev**: If Vite proxy to port 3000 fails, is the error surfaced?

---

## 10. Help and Documentation

This app presents complex PF1e concepts. Missing guidance is a pain point.

Check:
- Is there any in-app explanation of what the app does and how to get started?
- Is the BubbleBuffs page self-contained — can a user understand it without reading the mod's docs?
- Are role names in Build Planner and Party Builder explained (what does "Buffer/Support" score measure)?
- Does the AI Advisor have a visible examples section or "try asking…" hints?
- Is there any guidance for first-time setup errors (blueprint index, save path)?

---

## Known Risk Areas from Code Analysis

Pay extra attention here based on codebase review:

**Live save watcher** (`file-watcher.ts`)
- 800ms debounce — rapid saves (autosave on map change) may trigger multiple re-parses
- SSE `idleTimeout: 255` (Bun max) — but if SSE drops, client `EventSource` should auto-reconnect; verify the `● Live save connected` indicator goes dark on disconnect

**Save parser edge cases** (`save-parser.ts`)
- `m_SelectionsByLevel` values are arrays, not bare strings — GUID collection and feat parsing handle this, but if a mod adds unusual data, names may silently fall back to raw GUIDs shown in the UI
- Equipment items defined via `$ref` across entity boundaries — if resolution fails, Primary Hand slot shows empty even when equipped

**AI streaming** (`routes/ai.ts` + `AiStream.tsx`)
- `AiStream` **must** have `key={characterId}` to reset state on character switch — if missing, stale streamed content from the previous character bleeds through
- 40-char SSE chunks may cause visible word-boundary choppiness in the stream

**BubbleBuffs write** (`services/bubble-buffs.ts`)
- Writing while the game is running will be overwritten on next save — no in-app guard exists
- `formatGuid()` conversion from 32-char hex to UUID-with-dashes is required — if the input GUID is already formatted or malformed, the write will silently corrupt the config

**Build Planner alignment score** (`services/build-advisor.ts`)
- Score is 0–100 but the UI label "Alignment" conflicts with PF1e alignment (Lawful Good, etc.) — players may be confused about what the number means
