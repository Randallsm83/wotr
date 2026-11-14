# WotR Companion verification map

This directory maps the user-facing behavior of the WotR Companion. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- `wotr-verify fixtures` has cached one real `Manual_*.zks` save and `blueprints.db` under `$STATE/fixtures/`. Check `SOURCE.sha256` for which save it is.
- `wotr-verify launch` printed `ready: http://127.0.0.1:42510`, and `wotr-verify doctor` printed `doctor: healthy`.
- The instance runs from the `$STATE/app` snapshot with `WOTR_SAVES_DIR=$STATE/fixtures/saves`, `WOTR_GAME_DIR=$STATE/game` and no `ANTHROPIC_API_KEY`.
- Never drive the user's own instance on ports 3000 or 5173.

## Driving conventions

- Every recipe starts from a fresh page load on `Dashboard`. Pages have no URLs.
- Switch pages with the sidebar: `page.getByRole("navigation").getByRole("button", { name: "<label>" })`.
- Pick a character or caster with `getByRole("button", { name: /^<name>/ })`. The accessible name is the name followed by class and level.
- Run recipes with `wotr-verify drive <feature>`. Copy `scripts/drive.ts` patterns when adding a recipe.
- Never press the `✦ …` AI buttons or send in `AI Advisor`. They are the paid Anthropic path and are off in this setup.

## Proof and skip reporting

- Proof is a before and after screenshot with its ARIA snapshot, plus `result.json`, all under `$STATE/evidence/<ts>-<feature>/`.
- Cross-check visible values against `api-party.json`, which is read from the server independently of the UI.
- For a mutation, show the written file (`side-effect-*.json`, or the buff-mod config) in addition to the UI message.
- A failed precondition is a FAIL with the reason, and it goes in that feature's Gotchas. Never mark it verified through another path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order:

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with wotr-verify`
4. `Gotchas`

## Features

- [Dashboard](./dashboard.md): save header, area tips, critical actions, active party cards, refresh and live-save indicator.
- [Character sheets](./characters.md): per-character stats, ability scores, feats, equipment, spellbook.
- [Spell Planner](./spell-planner.md): per-caster known and prepared spells, slot counts, prep priorities.
- [Build Planner](./build-planner.md): per-character build profile saved to `data/builds.json`.
- [BubbleBuffs](./bubblebuffs.md): buff-mod config read, missing-buff list, `+ Add` writes the mod config.

Not yet mapped: `Field Guide` (party issues and role coverage from `/api/build-guide` and `/api/party-builder`), and `AI Advisor` (paid Anthropic chat, out of scope without an explicit go-ahead to spend).
