# Build Planner

The Build Planner lets the user pick a character and save a build profile: role (auto-detected from party-builder scores), class path, mythic path and notes. It also shows rule-based advice and AI analysis panels. Saved profiles persist in `data/builds.json` and feed role scoring and the AI context.

## Sub-features

- `build-pick`: character selector buttons.
- `build-profile`: the `Build Profile` editor, saved with `Save Build` (shows `Saved.` or `Class path is required.`).
- `build-advice`: rule-based advice from `GET /api/builds/:id/advice` after saving.
- `build-ai`: `✦ Analyse Build` and `✦ Generate Respec Guide`, both paid AI (not driven).

## How to get to it (user POV)

- Choose `Build Planner` in the sidebar, then a character, then `Save Build`.

## Driving it with wotr-verify

Preconditions:

- `wotr-verify doctor` is healthy.
- The instance was launched fresh, so `$STATE/app/data/builds.json` does not exist and `api-builds-before.json` is `[]`.

- **Open page.** Run `wotr-verify drive builds`. The driver saves `GET /api/builds` to `api-builds-before.json` and clicks the nav button `Build Planner`.
- **Pick character.** It clicks the first in-party character and waits for `Build Profile`. Screenshot: `01-build-planner.png`.
- **Save.** It clicks `Save Build` and waits for `PUT /api/builds/<uniqueId>` to return 200.
- **Persistence.** A fresh `GET /api/builds` (`api-builds-after.json`) contains that `characterId`. The file `$STATE/app/data/builds.json` is copied to `side-effect-builds.json`. Screenshot: `02-build-saved.png`.

## Gotchas

- The checkout's real `data/builds.json` is the user's own profiles. Never run the server from the checkout to drive this, because the snapshot exists so the write lands in `$STATE/app/data/`. Cleanup deletes that copy, and the evidence keeps the side-effect file.
- The save is silently skipped with `Class path is required.` when neither the field nor auto-detection gives a class path. Then no PUT happens and the recipe fails waiting for the response.
- The AI panel renders before the profile. Do not click its `✦` buttons.
