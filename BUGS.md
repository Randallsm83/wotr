# Known Issues & UX Findings

UX audit conducted 2026-03-25. All pages audited live against a real save file.

---

## Critical

| # | Issue | GitHub |
|---|---|---|
| C1 | **Build Planner: AI analysis output disappears after streaming completes** — `AiStream` loses its `text` state after the live-save SSE refresh re-renders the parent during streaming. `Analyse Build` runs but result is never visible. | [#1](https://github.com/Randallsm83/wotr/issues/1) |
| C2 | **Spell Planner: unresolved blueprint GUID shown as spell name** — `bad01be5` appears in Kaede's spell list. Blueprint resolver falls through to the raw GUID instead of a fallback display name. | [#2](https://github.com/Randallsm83/wotr/issues/2) |

---

## High

| # | Issue | GitHub |
|---|---|---|
| H1 | **All pages: `_Companion` suffix not stripped from character names** — `Seelah_Companion`, `Camelia_Companion` etc. everywhere. Fix in `save-parser.ts`. | [#3](https://github.com/Randallsm83/wotr/issues/3) |
| H2 | **All pages: internal PascalCase identifiers shown instead of human-readable names** — spell names, feat names, class features, and buff names are raw identifiers (`ResistEnergy`, `TwoWeaponFighting`, `PowerAttackFeature`). Needs a display-name normalizer. | [#4](https://github.com/Randallsm83/wotr/issues/4) |
| H3 | **Dashboard: area shown as raw GUID in Current Save card** — `Area: 799a58b9f4456514ea48af2319ba8fae`. Area name is already in the subtitle; remove or resolve the field. | [#5](https://github.com/Randallsm83/wotr/issues/5) |
| H4 | **Build Planner: "BUILD ALIGNMENT" label conflicts with PF1e's moral alignment system** — rename to "BUILD FIT" or "BUILD QUALITY". | [#6](https://github.com/Randallsm83/wotr/issues/6) |
| H5 | **Characters: class features section shows 40+ unfiltered internal tags** — includes archetype permission flags (`Fire Domain Allowed Separatist` ×20). Filter and group. | [#7](https://github.com/Randallsm83/wotr/issues/7) |

---

## Medium

| # | Issue | Notes |
|---|---|---|
| M1 | **Characters: scroll position doesn't reset on character switch** | `mainEl.scrollTop = 0` in the character-change `useEffect` |
| M2 | **Build Planner: role score abbreviations (F:4 D:5 H:0 B:1 C:1 U:5) unexplained** | Expand to full names or add tooltip |
| M3 | **BubbleBuffs: "Good on Important" is opaque internal jargon** | "Important" is a BubbleBuffs targeting group name unknown to most users |
| M4 | **Characters: equipment item names carry internal numeric/stage suffixes** | `Headband Of Charisma2` → `Headband of Charisma +2`, strip "Item" suffix |
| M5 | **BubbleBuffs: "1 buffs" grammar error** | `count !== 1 ? 'buffs' : 'buff'` |
| M6 | **Party Builder: role score scale (0–5) never stated** | Add "/ 5" or a legend |
| M7 | **Party Builder: synergy icon ⟳ looks like a refresh button** | Use `↔` or similar |
| M8 | **Spell Planner: no caster selector — all casters stacked vertically** | Add tabs or dropdown to jump to a specific caster |
| M9 | **AI Advisor: slash command chips fill input but don't auto-send** | Chips should call `handleSubmit()` directly |

---

## Low

| # | Issue | Notes |
|---|---|---|
| L1 | **Dashboard: party coverage uses unexplained abbreviations** | "CC" → "Crowd Control", "Prot Evil" → "Protection from Evil", "Magic Wep" → "Magic Weapon" |
| L2 | **Dashboard: no HP/status indicator on party member cards** | Party can be critically wounded with no visual warning on the dashboard |
| L3 | **Spell Planner: inconsistent spell level badge styling** | Some levels in cyan badge, others as plain text; no legend |
| L4 | **BubbleBuffs: no explanation of what BubbleBuffs is** | Add one-sentence description at page top |
| L5 | **Sidebar nav: "Party Analysis" wraps to two lines** | Shorten to "Analysis" or widen sidebar |
| L6 | **Characters: feat level prefixes ("L0", "L1") unexplained** | Column header: "Feat (acquired at level)" |
| L7 | **App-wide: no loading state during initial save parse** | Add loading skeleton while `/api/party` is in flight |
