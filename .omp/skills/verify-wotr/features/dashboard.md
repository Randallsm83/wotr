# Dashboard

The Dashboard is the landing page. It shows the newest save: area and act, player character, play time and mod count. Below that come area tips, up to two critical issues from the field guide, one card per active-party member (class, level, slots, prep hints, dying state), companions at camp, and party insights. `↻ Refresh` re-reads the save.

## Sub-features

- `dash-header`: the `WotR Companion` heading with the save name, plus the area banner `Player: <pc>`, `Played:`, `Mods:`.
- `dash-party`: the `Active Party (N)` section with one card per in-party character.
- `dash-crit`: `Critical Actions` with up to two `CRIT` issues from `/api/build-guide`.
- `dash-refresh`: `↻ Refresh` re-fetches `/api/party` and `/api/analysis`.
- `dash-live`: the sidebar footer `Live save connected` and auto-refresh when a `.zks` changes.

## How to get to it (user POV)

- Open the app. The Dashboard is the default page.
- Choose `Dashboard` in the sidebar from any other page.

## Driving it with wotr-verify

Preconditions:

- `wotr-verify doctor` is healthy.
- `$STATE/fixtures/saves` holds exactly the one fixture save.

- **Load.** Run `wotr-verify drive dashboard`. The `WotR Companion` heading appears.
- **Header and party.** The driver asserts `Player: <meta.playerCharacterName>`, `Active Party (<count of inParty>)` and every in-party `name` from `api-party.json`. Screenshot: `01-dashboard.png`.
- **Refresh.** The driver clicks `↻ Refresh` and waits for `/api/party` to return 200. `Active Party (N)` and `Live save connected` are still shown. Screenshot: `02-dashboard-after-refresh.png`.
- **Live save (manual, not in `drive.ts`).** In one shell, run `curl -sN -m 6 http://127.0.0.1:42510/api/events`. In another, run `cp "$STATE"/fixtures/saves/Manual_*.zks "$STATE"/fixtures/saves/zz-live.zks; sleep 2; rm "$STATE"/fixtures/saves/zz-live.zks`. The server side works: curl prints `event: save-updated`, and `$STATE/run/server.log` prints `[watcher] Save changed: zz-live.zks` (verified 2026-11-13). The browser should re-fetch `/api/party` without a click, but it does not (see Gotchas). Always delete `zz-live.zks`, because a newer save changes what every page shows.

## Gotchas

- Live-save push is broken in the shipped client. `useLiveSave` opens `EventSource("/events")`, but the server mounts SSE at `/api/events`. `/events` gets the SPA `index.html`, and the console logs `EventSource's response has a MIME type ("text/html")…` on every reconnect, which `result.json.consoleErrors` records. Vite dev mode proxies `/events` to the same missing route. Treat `dash-live` as a FAIL until the client path is fixed.
- `Live save connected` only means `/api/party` succeeded once (`lastUpdate` is set). It does not prove an SSE connection. Never cite it as live-update proof.
- The `Field Guide` link under `Critical Actions` has an empty click handler and does nothing. Use the sidebar button.
- The fixture save (`Manual_65_Drezen…`) has several party members dying. `CRIT` cards about Raise Dead are expected data, not a parse error.
- The app parses the newest `.zks` by mtime. A stray newer file in the saves dir silently changes every expectation.
