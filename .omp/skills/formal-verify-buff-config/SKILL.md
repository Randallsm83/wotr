---
name: formal-verify-buff-config
description: Check the code that writes the BubbleBuffs / Buff It 2 The Limit config file against generated files and requests. Use when a change touches addBbBuff, regroupBuffs, formatGuid or normalizeGuid in src/server/services/bubble-buffs.ts, the POST /api/bubbles/add or /api/bubbles/regroup routes, buff group names or numbers, or the mod file format.
---

# Verify the buff-mod config writers

**Property.** Every write this app makes to a buff mod's config file leaves a file the mod can load, with everything the player had set up still in it, at most one entry per spell, and each buff in the group that was asked for.

**Harm.** Both mods throw the whole saved buff setup away when they cannot deserialize the file, and overwrite the file with the empty setup on their next save; a buff saved under a group number the mod does not declare is cast by no group button.

**Tool.** fast-check 4.10.2 under `bun test`, driving the real `addBbBuff` and `regroupBuffs` with generated config files and requests. No verifier runs on this TypeScript, and the question is about every file and every request, which is an input question. Both writers are synchronous from `readFileSync` to `writeFileSync`, so two requests cannot interleave inside the server and a model checker would have no orderings to explore.

## Run

```sh
source ~/.config/zsh/agent-env.zsh   # agent shells only: puts bun on PATH
.omp/skills/formal-verify-buff-config/check.sh
```

Takes about 2 seconds. It copies `src/server` from the working tree (uncommitted edits included) to a snapshot under `~/.local/state/verify-wotr/formal-verify-buff-config/`, points the code at a throwaway game directory there, and runs 300 generated cases per property with a fixed seed. Nothing in the repo or the real game directory is written. The first run needs network once to fetch fast-check; the version and hash are pinned in `harness/bun.lock`.

A clean run prints this and exits 0:

```
---- /Users/ranmil/projects/wotr
FINDING F4 still present: addBbBuff(mod=BubbleBuffs, groupName="Long") wrote InGroup=3 ...
FINDING F1 still present: ...
FINDING F2 still present: ...
FINDING F3 still present: ...
FINDING F5 still present: ...
 12 pass
 0 fail
log: /Users/ranmil/.local/state/verify-wotr/formal-verify-buff-config/runs/20261114T021253Z.log
coverage: covered files match sync commit a9dc8a5
RESULT: properties hold
```

Wider search before a risky change: `FC_RUNS=5000 FC_SEED=$RANDOM .omp/skills/formal-verify-buff-config/check.sh`. To test another copy of the repo, set `WOTR_ROOT` to that copy's root directory for the same command.

After changing the harness, or when a property that should have failed did not, run `.omp/skills/formal-verify-buff-config/prove-can-fail.sh` (about 6 seconds). It applies each broken variant in `mutants/` to a snapshot and expects the property named in the patch header to fail. A property nobody has seen fail proves nothing.

## Coverage record

Sync commit: `a9dc8a5e2589589e137f5b0c51562c11e644fb55`

| Code | How it is covered |
| --- | --- |
| `src/server/services/bubble-buffs.ts`: `addBbBuff`, `regroupBuffs`, and what they call (`formatGuid`, `normalizeGuid`, `modPaths`, `detectBuffMod`) | Executed by every property. |
| `src/server/routes/saves.ts`, `POST /bubbles/add` | Not executed. The harness passes `addBbBuff` the fields this route passes, with the declared types. |
| `src/server/routes/saves.ts`, `POST /bubbles/regroup` | Not executed. Its `groupMap` and three rows plus the default of its `heuristic` are repeated in the harness as `GROUP_MAP` and `heuristic`. |
| `src/server/routes/saves.ts`, `GET /bubbles` | Not executed. The group names it hands the page (`G_QUICK`, `G_IMPORTANT`, `G_LONG`) are repeated as `pageGroups`. |
| `src/server/services/blueprint-db.ts`, `lookupBlueprintsMany` | Replaced by an in-memory name table. |

`check.sh` compares the two covered files with the sync commit on every run and prints `COVERAGE DRIFT` when they differ. Drift means the record above may no longer describe the code: follow "Keeping this in step" before trusting a pass.

## Properties

| Id | In plain words | Broken variant that makes it fail (`mutants/`) |
| --- | --- | --- |
| G0 | The writers look only inside the throwaway game dir, and the name table is live. | (harness guard) |
| A1 | After `addBbBuff`, every setting and every existing entry is unchanged and at most one entry was added at the end. A refused or crashed call, a spell already configured, or a file that is not JSON leaves the file byte for byte as it was. The other mod's file is untouched. | `a1-drops-settings`, `a1-unreadable-file-replaced` |
| A2 | Adding a spell twice, or adding a configured spell, in any spelling of its GUID (dashes or not, any letter case), leaves exactly one entry and the second call does not rewrite the file. | `a2-dedupe-exact-string` |
| A3 | The new entry carries the spell GUID, the `Wanted` ids and the caster with its spellbook GUID that were asked for, with GUIDs in dashed form. | `a3-guid-slice` |
| A4 | With a group name the page can send, the new entry is in the group the mod reads as that name. Passes for BuffIt2TheLimit; see F4 for BubbleBuffs. | `a4-b2tl-group-not-written` |
| A5, A6, A7 | Whatever strings the request holds, `addBbBuff` either writes nothing or writes an entry the mod's types can hold. See F1, F2, F3. | (fail today) |
| R1 | `regroupBuffs` changes only `Value.InGroup` and `Value.InGroups`; count, order, other fields and other settings stay. A refusal (other mod, not JSON) or a crash leaves the file byte for byte as it was. | `r1-regroup-drops-fields` |
| R2 | After `regroupBuffs`, the mod reads every buff in the group the heuristic chose, and a second run reports `updated: 0` and leaves the file alone. Holds for group state as the mod or this app saves it; see F5 for the rest. | `r2-regroup-skips-ingroups` |
| R3 | The same for any `InGroup` number next to any `InGroups` list. See F5. | (fails today) |

What "the mod reads" and "the mod's types can hold" mean comes from the mods' source, not from the comments in `bubble-buffs.ts`:

- BubbleBuffs, `github.com/factubsio/BubbleBuffs` at `f4871f7`: `enum BuffGroup { Long, Short, Important }` (saved as 0, 1, 2; unchanged since the enum was added in 2021); `BuffKey.Guid` and `CasterKey.Spellbook` are `Guid`; `Buffs` is loaded with `ToDictionary` keyed by `BuffKey`; `BuffExecutor.Execute` casts the buffs where `b.InGroup == buffGroup`.
- BuffIt2TheLimit, `github.com/Gh05d/wrath-epic-buffing` at `e2aa5b3`: `enum BuffGroup { Long, Quick, Important }`; `SavedBuffState.InGroups` is a set of those names and `InitialiseFromSave` uses it whenever it is present, falling back to the number `InGroup` only when it is absent; the key types are the same.
- Both load the file inside `try { ... } catch (JsonException) { ...; save = new SavedBufferState(); }` in `BubbleBuffSpellbookController.CreateBuffstate`, and both save with `File.CreateText(SettingsPath)`.
- Newtonsoft.Json, `github.com/JamesNK/Newtonsoft.Json` at `52fa3ae`: a string that does not convert to the target type, and a name `StringEnumConverter` does not know, raise `JsonSerializationException`, which is a `JsonException`; an integer becomes an enum through `Enum.ToObject` with no range check.

None of the three was executed here, and the mod and Newtonsoft versions installed with the game were not checked.

## Known findings

The current code breaks these. Each is registered with its finding id as the third argument of `property(...)` in the harness, so the run stays green while the finding is still there and prints its smallest counterexample as a `FINDING` line.

- **F4, reachable from the page with legacy BubbleBuffs.** `GET /api/bubbles` suggests group `"Long"`; the page posts it; `addBbBuff(mod="BubbleBuffs", groupName="Long")` writes `InGroup: 3`. The mod's groups are 0=Long, 1=Short, 2=Important, so the buff is in no group and no group button casts it.
- **F5, `regroupBuffs` decides by the wrong field.** It compares the number `InGroup` and skips the entry when that matches, while BuffIt2TheLimit reads `InGroups`. An entry `{ InGroup: 2, InGroups: ["Long"] }` whose spell the heuristic puts in Important comes back as "already correct" (`updated: 0, skipped: 1`) and the mod still reads Long. Its numbering is also the app's own (Long = 3), so an entry `{ InGroup: 3 }` with no `InGroups` is skipped as Long although the mod has no group 3.
- **F1, a spell id that is not a GUID is written as given.** `addBbBuff({ spellGuid: "0000000000000000000000000000000", ... })` (31 digits) returns `{ ok: true }` and appends `Key.Guid: "0000000000000000000000000000000"`. The route checks only that `spellGuid` is not empty. The mod cannot convert that to a `Guid`, which lands in the catch that discards the whole setup.
- **F2, the same for the caster's spellbook id.** With a `casterId` and a `spellbookId` that is not a GUID (the route's default is `""`), the entry gets `Casters[0].Key.Spellbook` as given, with the same end.
- **F3, BuffIt2TheLimit gets group names it does not declare.** `addBbBuff(mod="BuffIt2TheLimit", groupName="Normal")` returns `{ ok: true }` and writes `InGroups: ["Normal"]`. `"Normal"` is in the code's own `b2tlGroup` table but not in the mod's enum, so the mod cannot read the list and discards the whole setup. The page sends only Quick, Important and Long; any other client of `POST /api/bubbles/add` can send anything.

When a fix makes one of them hold, bun reports that test as failing because it is marked as expected to fail. Confirm the fix, delete the finding id from that `property(...)` call, delete the finding here, and rerun.

## Reading a result

- A `BROKEN` line such as `BROKEN A1: ...` with exit 1 is a counterexample. The line says, in this repo's words, which call was made on which file content and what the file held afterwards. Compare it with the property's row above. If the outcome is one you intended (a new field, a renamed group, a different refusal), go to "Keeping this in step". Otherwise it is a bug in the change: fast-check has already shrunk the case to the smallest one, and the seed and the full input are in the log named on the `log:` line.
- A `(fail)` line ending in a finding marker such as `[known finding F4]`, with no `BROKEN` line, means that finding stopped reproducing. See "Known findings".
- A harness problem looks different: `BROKEN G0`, exit 2, `Cannot find module`, or a `BROKEN` line that carries a JavaScript error raised in `buff-config.property.test.ts` (a `TypeError`, a `ReferenceError`) where a sentence about a call and a file should be. `Cannot find module` after `bubble-buffs.ts` gained an import of an npm package means the snapshot has no such package: add it to `harness/package.json` at the version in the repo's `bun.lock`, run `bun install` in a copy of `harness/` outside the repo, and copy the new `bun.lock` back.
- `prove-can-fail.sh` printing `STALE` means a patch in `mutants/` no longer applies to `bubble-buffs.ts`; `SURVIVED` means a property stopped being able to fail. Both need the fix in "Keeping this in step" before a pass means anything.

## Keeping this in step

When a change to the covered code is intended, change the harness to say the new truth, never to make a red run green.

1. Read what changed in the covered files since the sync commit: `git diff a9dc8a5e2589589e137f5b0c51562c11e644fb55 -- src/server/services/bubble-buffs.ts src/server/routes/saves.ts` (use the commit on the `Sync commit:` line once it has moved).
2. Update what the harness repeats from the code, all in `harness/buff-config.property.test.ts`:
   - `Writers`: the two function signatures.
   - `MODS`: the directory and file prefix per mod (from `modPaths`), `pageGroups` (from `GET /bubbles`), and `groups`, which must come from the mod's own `BuffGroup` enum, not from this repo.
   - `GROUP_MAP` and `heuristic`: from `POST /bubbles/regroup`.
   - `request(...)` and `AddRequest`: the fields `POST /bubbles/add` passes.
   - `unloadable` and A3: the fields of the entry `addBbBuff` appends.
3. Run `check.sh`, then `prove-can-fail.sh`. Rewrite any `STALE` patch against the current file: each is `diff -u` output for `src/server/services/bubble-buffs.ts` with paths `a/` and `b/`, under a first line such as `# breaks: A1` that names the property it must break.
4. Only when both pass and the table in "Coverage record" is still true, set `Sync commit:` to the commit that contains the code you checked.

For verification that fell behind changes nobody rechecked, use the pstack skill `/maintain-formal-verification-skill`.

## Bounds and what is left out

- 300 cases per property, fixed seed 20261113; files with up to 6 buff entries and up to 4 unknown fields per object; file content that is a workable config, a config with a missing, null, wrong-typed or junk-filled `Buffs`, JSON that is not an object, or not JSON at all (noise, a leading byte-order mark, a truncated file). A pass covers those cases, not every file.
- Request fields have their declared types (strings and a list of strings). A request body with a number or object in their place is not generated.
- The existing file never holds integers above 2^53 or repeated keys. `JSON.parse` followed by `JSON.stringify` changes both, so a file that had them would not survive a write.
- The game or the mod writing the file at the same moment, and a crash in the middle of `writeFileSync`, are outside what this code can show. `AGENTS.md` already says not to write while the game runs.
- The routes, the save-header `GameId` that picks the file, and the real blueprint index are not executed.
- `readBbConfig` is not checked. It labels groups with the same numbering as the writers, so it shows a buff the mod saved as Long (`InGroup: 0`) as "Normal".
