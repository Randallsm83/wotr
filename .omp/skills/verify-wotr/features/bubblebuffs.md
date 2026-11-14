# BubbleBuffs

The BubbleBuffs page reads the buff-mod config for this save's GameId: `BuffIt2TheLimit` when the save lists that mod, otherwise `BubbleBuffs`. It shows configured, missing and blacklisted counts, groups the configured buffs, and lists missing pre-combat buffs with group, target and caster. `+ Add` writes a buff into the mod config file.

## Sub-features

- `bb-read`: the header counts `N configured`, `N missing`, `N blacklisted`.
- `bb-missing`: missing-buff rows with `+ Add`, which changes to `Adding...`, then `✓ Added` or `Error`.
- `bb-regroup`: the regroup action (`POST /api/bubbles/regroup`), which reclassifies existing buffs into Quick/Important/Long and also writes the config.
- `bb-ai`: `✦ Get AI Buff Guide`, paid AI (not driven).

## How to get to it (user POV)

- Choose `BubbleBuffs` in the sidebar.

## Driving it with wotr-verify

Preconditions:

- `wotr-verify doctor` is healthy.
- A real mod config exists at `$STATE/game/Mods/BuffIt2TheLimit/UserSettings/bi2tl-<GameId>.json` for the fixture save (which lists `BuffIt2TheLimit`). `<GameId>` comes from `header.json` inside the `.zks`. Copy the file read-only from the Windows game install's `Mods/BuffIt2TheLimit/UserSettings/`.

- **Open page.** Run `wotr-verify drive bubbles`. The driver clicks the nav button `BubbleBuffs`. Screenshot: `01-bubblebuffs.png`.
- **Add.** It clicks the first `+ Add` and waits for `✓ Added`.
- **Side effect.** It requires that a config file under `$STATE/game/Mods/*/UserSettings` changed bytes. Screenshot: `02-bubblebuffs-added.png`.

## Gotchas

- Without the config file the page shows `BubbleBuffs Not Configured`, and the API says `Buff mod config not found (looking for BuffIt2TheLimit)`. The recipe then FAILs with `precondition: no buff-mod config under …`. That is the current state: the config is not under hal9k-win's default `A:\SteamGames\steamapps\common\Pathfinder Second Adventure\Mods\` (checked over ssh), and the real `WOTR_GAME_DIR` lives in that box's `.env`, which this skill must not read. Get the path from the user, copy only the one `bi2tl-*.json`, and never fabricate a config.
- `WOTR_GAME_DIR` must point at `$STATE/game`, which `launch` sets. `+ Add` and regroup write in place, and pointing them at the real game dir would edit the user's mod settings. The game also overwrites that file on its next save if it is running.
