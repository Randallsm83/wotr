---
name: verify-wotr
description: "Drive the WotR Companion web app (Pathfinder: Wrath of the Righteous save viewer: Bun + Hono API serving the built React client) in headless Chrome against a real .zks save and capture screenshot/ARIA/API evidence. Use when you need to prove a change to the dashboard, character sheets, spell planner, build planner or BubbleBuffs page actually works for a user, or when the app looks broken locally."
---

# verify-wotr

The user surface is one browser SPA. The sidebar (`<nav>`) holds one button per page: `Dashboard`, `Characters`, `Spell Planner`, `Field Guide`, `BubbleBuffs`, `Build Planner`, `AI Advisor`. There are no routes: pages switch on button click, so drive by accessible button name, never by URL. All data comes from the newest `.zks` file in `WOTR_SAVES_DIR`, resolved through `data/blueprints.db`.

Everything goes through one helper, run from the repo root:

```sh
.omp/skills/verify-wotr/scripts/wotr-verify fixtures   # once: fetch real save + blueprint DB (cached)
.omp/skills/verify-wotr/scripts/wotr-verify launch
.omp/skills/verify-wotr/scripts/wotr-verify doctor
.omp/skills/verify-wotr/scripts/wotr-verify drive dashboard   # or characters|spells|builds|bubbles
.omp/skills/verify-wotr/scripts/wotr-verify cleanup
```

State root: `STATE=${XDG_STATE_HOME:-$HOME/.local/state}/verify-wotr` (override with `WOTR_VERIFY_STATE`). Port: `42510` (override with `WOTR_VERIFY_PORT`, must stay in 42500-42599; 3000 and 5173 belong to the user's own dev servers).

## Launch

Preconditions: macOS or Linux with `bun`, `rsync`, `sqlite3`, `curl`, `lsof` and Google Chrome installed; `ssh hal9k-win` working the first time only.

1. `wotr-verify fixtures` fills `$STATE/fixtures/` once and prints SHA-256s into `$STATE/fixtures/SOURCE.sha256`:
   - the newest `Manual_*.zks` from `hal9k-win:%USERPROFILE%\AppData\LocalLow\Owlcat Games\Pathfinder Wrath Of The Righteous\Saved Games` (read-only `scp`; nothing is written on the Windows box). Use another save with `WOTR_FIXTURE_SAVE=/path/to/file.zks wotr-verify fixtures`. The app parses the newest file in the dir, so keep one save there.
   - `C:/Users/ranmil/projects/wotr/data/blueprints.db` (about 48 MB). It is gitignored and only buildable from game files (`bun run index`), so a Mac checkout has none.
2. `wotr-verify launch`:
   - rsyncs the working tree (minus `.git`, `node_modules`, `dist`, `data`, `.env*`, `.omp`, root `*.html`) into `$STATE/app/`. The server writes `dist/`, `data/builds.json` and resolves `data/blueprints.db` relative to its own source, so running from a snapshot keeps the checkout untouched.
   - copies the DB into `$STATE/app/data/` and creates its persisted `-wal`/`-shm` sidecars (`blueprint-db.ts` opens the DB read-only and then sets WAL, which fails with `unable to open database file` without them).
   - `bun install --frozen-lockfile`, then `bunx vite build` into `$STATE/app/dist/client` (logs: `$STATE/run/install.log`, `$STATE/run/build.log`).
   - starts `bun run src/server/index.ts` with `PORT=42510 WOTR_SAVES_DIR=$STATE/fixtures/saves WOTR_GAME_DIR=$STATE/game` and `ANTHROPIC_API_KEY` removed from the environment. The snapshot has no `.env`, so Bun loads no key. PID: `$STATE/run/server.pid`. Log: `$STATE/run/server.log`.
   - is ready only when `GET /api/party` returns 200, meaning the save was parsed. It prints `ready: http://127.0.0.1:42510 (pid N)`.
3. Launch refuses to start when its PID file is alive or the port has another listener. Run a second instance with a different `WOTR_VERIFY_STATE` and `WOTR_VERIFY_PORT`. Never drive the user's own `bun run dev:all` instance on 3000/5173.

Teardown: `wotr-verify stop` (server only) or `wotr-verify cleanup`.

## Doctor

`wotr-verify doctor` is read-only and exits non-zero unless every line is `ok`:

- the PID in `$STATE/run/server.pid` is alive, and `lsof` shows that PID listening on the port.
- `src scripts package.json bun.lock vite.config.ts tailwind.config.ts postcss.config.js tsconfig.json` in the snapshot equal the checkout. It prints the checkout HEAD. On drift, run cleanup and launch again: the instance is serving stale code.
- `/api/status` reports `"indexed":true`, about 236k blueprints. `false` means the DB or its sidecars are missing.
- `/api/saves` lists the fixture dir, and `/api/party` returns 200.
- `POST /api/ai/chat` answers `ANTHROPIC_API_KEY not set`. This proves the paid Claude path is off: the handler returns before any network call.

## Drive

`wotr-verify drive <feature>` installs `playwright-core@1.65.1` into `$STATE/harness/` on first use and runs `scripts/drive.ts`. That script launches headless Google Chrome (`channel: "chrome"`; no Playwright browser download), opens the app, and waits for the `WotR Companion` heading. It then follows the feature recipe:

| feature | user path | proof it asserts |
|---|---|---|
| `dashboard` | land on Dashboard, click `↻ Refresh` | `Player: <pc>`, `Active Party (N)`, every in-party name from `/api/party`; refresh re-fetches `/api/party` 200 |
| `characters` | nav `Characters`, click the 2nd party member | `Ability Scores`, `Hit Points`, class name |
| `spells` | nav `Spell Planner`, click the 2nd caster | a known spell of that caster is listed |
| `builds` | nav `Build Planner`, pick 1st party member, `Save Build` | PUT `/api/builds/:id` 200, `GET /api/builds` has it, `$STATE/app/data/builds.json` written |
| `bubbles` | nav `BubbleBuffs`, first `+ Add` | button turns `✓ Added` and a config file under `$STATE/game/Mods/*/UserSettings` changed |

Exit code 0 means PASS and 1 means FAIL. The last line names the reason. For ad-hoc steps, copy `drive.ts` patterns: `page.getByRole("navigation").getByRole("button", { name })` for pages, and `getByRole("button", { name: /^<character name>/ })` for character pickers. Per-feature detail, preconditions and traps are in [`features/`](features/README.md).

Do not click `✦ Analyse Build`, `✦ Get AI Buff Guide`, `✦ Generate Respec Guide` or send from `AI Advisor`: these are the paid Anthropic path. With the key stripped they only show an error, which proves nothing.

## Evidence

Each drive writes `$STATE/evidence/<UTC-timestamp>-<feature>/`:

- `NN-<step>.png` full-page screenshots and `NN-<step>.aria.yml` ARIA snapshots, taken before and after the action.
- `api-*.json` server state read independently of the UI (`/api/party`, `/api/builds` before and after).
- `side-effect-*.json` files the action wrote, such as the `builds.json` copy.
- `result.json` with feature, status, failure reason, every step, and the browser console errors.
- `zz-failure.png` and `zz-failure.aria.yml` on failure.

Proof standards: drive the real UI path, not `curl` on the endpoint the button calls. Capture the state before and after the action. Cross-check visible values against the API JSON, and check written files for every mutation. `result.json` with `"status": "pass"` and no screenshot is not proof. Fixture provenance is in `$STATE/fixtures/SOURCE.sha256`.

## Cleanup

`wotr-verify cleanup` kills the server by its recorded PID (never by name) and deletes `$STATE/app`, `$STATE/game` and `$STATE/run`. It keeps `$STATE/evidence/` (proof), `$STATE/fixtures/` and `$STATE/harness/` (download caches). Delete the caches by hand only when you want a fresh save or DB. Run cleanup after every failed launch too.

## Helpers

- `scripts/wotr-verify` (zsh): `fixtures | launch | doctor | drive <feature> | stop | cleanup`, plus the env knobs `WOTR_VERIFY_STATE`, `WOTR_VERIFY_PORT`, `WOTR_VERIFY_REMOTE` (default `hal9k-win`) and `WOTR_FIXTURE_SAVE`. It sources `~/.config/zsh/agent-env.zsh` when `bun` is not on PATH.
- `scripts/drive.ts`: `bun drive.ts <feature> <baseUrl> <outDir>`. Its cwd must be `$STATE/harness`, which `wotr-verify drive` handles. It reads `WOTR_VERIFY_GAME_DIR` and `WOTR_VERIFY_APP_DIR` for side-effect checks.

Keep this skill current with `/maintain-verification-skill` when pages, labels or launch steps change.
