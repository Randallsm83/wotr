// Generated-input checks of the buff-mod config writers in src/server/services/bubble-buffs.ts.
// Run through ../check.sh: it copies <repo>/src/server to a snapshot and points the code at a throwaway game dir.
import { mock, test } from "bun:test";
import fc from "fast-check";
import fs from "node:fs";
import path from "node:path";

const SNAPSHOT = process.env.WOTR_SNAPSHOT; // copy of <repo>/src/server
const GAME_DIR = process.env.WOTR_GAME_DIR; // stands in for the game install (WOTR_GAME_DIR in bubble-buffs.ts)
if (!SNAPSHOT || !GAME_DIR) throw new Error("run this through check.sh");
const opts = { seed: Number(process.env.FC_SEED ?? 20261113), numRuns: Number(process.env.FC_RUNS ?? 300) };

type Mod = "BubbleBuffs" | "BuffIt2TheLimit";
type AddRequest = { spellGuid: string; groupName: string; wantedIds: string[]; casterId: string; spellbookId: string };
type Result = { ok: true; updated?: number; skipped?: number } | { ok: false; error: string };
/** The two writers, with the signatures bubble-buffs.ts gives them. */
interface Writers {
  addBbBuff(gameId: string, entry: AddRequest & { mod: Mod }): Result;
  regroupBuffs(gameId: string, modList: readonly { id: string }[], groupMap: Record<string, number>, heuristic: (clean: string) => string): Result;
}

// regroupBuffs asks the blueprint index (data/blueprints.db) for spell names; this table stands in for the index.
const spellNames = new Map<string, string>();
mock.module(path.join(SNAPSHOT, "services/blueprint-db.ts"), () => ({
  lookupBlueprintsMany: (ids: string[]) =>
    new Map(ids.filter((id) => spellNames.has(id)).map((id) => [id, { id, name: spellNames.get(id) }])),
}));
// Dynamic on purpose: the path is the snapshot check.sh made for this run, and it has to load after the stand-in above.
const { addBbBuff, regroupBuffs }: Writers = await import(path.join(SNAPSHOT, "services/bubble-buffs.ts"));

// ─── What the two mods accept, read from their own source ────────────────────
// BubbleBuffs      github.com/factubsio/BubbleBuffs @ f4871f7
//   BubbleBuffer.cs  enum BuffGroup { Long, Short, Important }; class CasterKey { string Name; Guid Spellbook; }
//   BubbleBuff.cs    struct BuffKey { Guid Guid; int MetamagicMask; bool Archmage; }
//   SaveState.cs     SavedBuffState.InGroup is a BuffGroup; Buffs is loaded with ToDictionary keyed by BuffKey
// BuffIt2TheLimit  github.com/Gh05d/wrath-epic-buffing @ e2aa5b3
//   BubbleBuffer.cs  enum BuffGroup { Long, Quick, Important }
//   SaveState.cs     SavedBuffState.InGroups is a HashSet<BuffGroup> written as names
//   BubbleBuff.cs    InitialiseFromSave uses InGroups when it is present and InGroup only otherwise
// `groups` is each enum in declaration order, so the index is the number the mod saves.
// `pageGroups` are the names GET /api/bubbles hands the page for that mod (G_QUICK, G_IMPORTANT, G_LONG in routes/saves.ts).
const MODS: Record<Mod, { dir: string; prefix: string; groups: string[]; pageGroups: string[]; modList: { id: string }[] }> = {
  BubbleBuffs: { dir: "BubbleBuffs", prefix: "bubblebuff-", groups: ["Long", "Short", "Important"], pageGroups: ["Short", "Normal", "Long"], modList: [] },
  BuffIt2TheLimit: { dir: "BuffIt2TheLimit", prefix: "bi2tl-", groups: ["Long", "Quick", "Important"], pageGroups: ["Quick", "Important", "Long"], modList: [{ id: "BuffIt2TheLimit" }] },
};
const B2TL: Mod = "BuffIt2TheLimit";
const groupTable = (mod: Mod) => MODS[mod].groups.map((g, i) => `${i}=${g}`).join(" ");

// POST /api/bubbles/regroup passes this groupMap and a name heuristic; three of its rows and its default are repeated here.
const GROUP_MAP: Record<string, number> = { Normal: 0, Quick: 1, Important: 2, Long: 3 };
const heuristic = (clean: string) => (clean.includes("haste") ? "Quick" : clean.includes("heroism") ? "Long" : "Important");

// ─── Oracle helpers ──────────────────────────────────────────────────────────
/** The parts of a saved buff entry the checks read. A generated file can hold any JSON, so every field is optional and read through `?.`. */
interface Entry {
  Key?: { Guid?: unknown };
  Value?: GroupState & { Wanted?: unknown; Casters?: unknown; [field: string]: unknown };
  [field: string]: unknown;
}
type GroupState = { InGroup?: unknown; InGroups?: unknown };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dashed = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
const bare = (g: unknown) => (typeof g === "string" ? g.replace(/-/g, "").toLowerCase() : null);
const isGuidSpelling = (s: string) => /^[0-9a-f]{32}$/i.test(s.replace(/-/g, ""));
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => Bun.deepEquals(a, b, true);
const show = (v: unknown) => JSON.stringify(v) ?? "absent";
const parse = (text: string): { json: true; value: unknown } | { json: false } => {
  try {
    return { json: true, value: JSON.parse(text) };
  } catch {
    return { json: false };
  }
};
/** The buff list of a config the writers can append to (an object whose Buffs is a list, null or missing), else null. */
function buffList(cfg: unknown): Entry[] | null {
  if (!isObj(cfg) || !(cfg.Buffs == null || Array.isArray(cfg.Buffs))) return null;
  return (cfg.Buffs ?? []) as Entry[]; // unchecked on purpose: items can be any JSON, and Entry is only ever read through ?.
}
/** The last entry of the Buffs list in the file text, as far as it has one. */
const lastEntry = (text: string) => buffList(JSON.parse(text))?.at(-1);

let lastWhy = "";
function must(cond: boolean, why: () => string): asserts cond {
  if (cond) return;
  lastWhy = why();
  throw new Error(lastWhy);
}

/** The groups the mod would put a saved entry in, or null when the saved value is not one its BuffGroup declares. */
function groupsModSees(mod: Mod, value: GroupState | undefined): string[] | null {
  const { groups } = MODS[mod];
  const names = value?.InGroups;
  if (mod === B2TL && names != null) return Array.isArray(names) && names.every((g) => groups.includes(g)) ? names : null;
  const n = value?.InGroup;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < groups.length ? [groups[n]] : null;
}

/** What stops the mod's own types from holding this entry, or null when nothing does. */
function unloadable(mod: Mod, e: Entry | undefined): string | null {
  if (!isObj(e) || !isObj(e.Key) || !isObj(e.Value)) return `it is ${show(e)}`;
  if (typeof e.Key.Guid !== "string" || !UUID.test(e.Key.Guid)) return `Key.Guid is ${show(e.Key.Guid)}, not a GUID`;
  const casters: { Key?: { Spellbook?: unknown } }[] = Array.isArray(e.Value.Casters) ? e.Value.Casters : [];
  for (const c of casters) {
    const book = c?.Key?.Spellbook;
    if (typeof book !== "string" || !UUID.test(book)) return `Casters[].Key.Spellbook is ${show(book)}, not a GUID`;
  }
  if (!groupsModSees(mod, e.Value)) return `its group is InGroup=${show(e.Value.InGroup)} InGroups=${show(e.Value.InGroups)}, and ${mod} declares only ${groupTable(mod)}`;
  return null;
}

/** A thrown exception is an outcome (the route answers HTTP 500), not a harness error. */
function outcome(run: () => Result): { ok: boolean; said: string; updated?: number } {
  try {
    const r = run();
    return { ok: r.ok, said: `returned ${show(r)}`, updated: r.ok ? r.updated : undefined };
  } catch (e) {
    return { ok: false, said: `threw ${e}` };
  }
}

// ─── Files on disk ───────────────────────────────────────────────────────────
const cfgFile = (mod: Mod, gameId: string) => path.join(GAME_DIR, "Mods", MODS[mod].dir, "UserSettings", `${MODS[mod].prefix}${gameId}.json`);
for (const mod of Object.keys(MODS) as Mod[]) fs.mkdirSync(path.dirname(cfgFile(mod, "x")), { recursive: true });
const NEIGHBOUR = '{"Buffs":[],"neighbour":true}';
let serial = 0;

/** Put `text` where `mod` keeps one save's config, next to the other mod's file for the same save, which no call may touch. */
function withConfig(mod: Mod, text: string, body: (c: { gameId: string; read: () => string }) => void): void {
  const gameId = `save${serial++}`;
  const otherMod: Mod = mod === B2TL ? "BubbleBuffs" : B2TL;
  const file = cfgFile(mod, gameId);
  const neighbour = cfgFile(otherMod, gameId);
  fs.writeFileSync(file, text);
  fs.writeFileSync(neighbour, NEIGHBOUR);
  try {
    body({ gameId, read: () => fs.readFileSync(file, "utf8") });
    must(fs.readFileSync(neighbour, "utf8") === NEIGHBOUR, () => `a call for ${mod} rewrote the ${otherMod} file of the same save`);
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(neighbour, { force: true });
  }
}

// ─── Generators ──────────────────────────────────────────────────────────────
const hex32 = fc.string({ unit: fc.constantFrom(..."0123456789abcdef"), minLength: 32, maxLength: 32 });
/** One GUID written any way the code treats as the same GUID: with or without dashes, any letter case. */
const spelled = (h: string) =>
  fc.tuple(fc.boolean(), fc.constantFrom("lower", "upper", "mixed")).map(([dashes, letters]) => {
    const s = dashes ? dashed(h) : h;
    return letters === "lower" ? s : letters === "upper" ? s.toUpperCase() : [...s].map((ch, i) => (i % 2 ? ch.toUpperCase() : ch)).join("");
  });
const notGuid = fc.oneof(fc.string(), hex32.map((h) => h.slice(1)), hex32.map((h) => `z${h.slice(1)}`)).filter((s) => !isGuidSpelling(s));
const mods = fc.constantFrom<Mod>("BubbleBuffs", B2TL);
const unitIds = fc.array(fc.string(), { maxLength: 4 }); // character UniqueIds
const unknownFields = fc.dictionary(fc.string(), fc.jsonValue(), { maxKeys: 4 }); // settings and fields this app does not know about

/** A buff entry as the mods save one, with fields the app does not know about. */
const savedCaster = fc.record({ Key: fc.record({ Name: fc.string(), Spellbook: hex32.map(dashed) }), Value: unknownFields });
const savedBuff = fc.record({
  Key: fc.record({ Guid: hex32.chain(spelled), MetamagicMask: fc.nat(1023), Archmage: fc.boolean() }),
  Value: fc
    .tuple(unknownFields, fc.nat(3), fc.boolean(), unitIds, fc.array(savedCaster, { maxLength: 2 }))
    .map(([extra, InGroup, Blacklisted, Wanted, Casters]) => ({ ...extra, InGroup, Blacklisted, Wanted, Casters })),
});
/** A config the writers can work with: an object whose Buffs is a list of saved entries. */
const goodConfig = fc.tuple(unknownFields, fc.array(savedBuff, { maxLength: 6 })).map(([settings, Buffs]) => ({ ...settings, Buffs }));
/** An object whose Buffs is missing, null, the wrong type, or a list with junk in it. */
const oddConfig = fc
  .tuple(unknownFields, fc.oneof(fc.constant(undefined), fc.constant(null), fc.jsonValue(), fc.array(fc.oneof(savedBuff, fc.jsonValue()), { maxLength: 6 })))
  .map(([settings, Buffs]) => ({ ...settings, Buffs }));
/** Anything that can be sitting in the config file. */
const anyFile = fc.oneof(
  { weight: 6, arbitrary: fc.tuple(goodConfig, fc.constantFrom(0, 2)).map(([c, indent]) => JSON.stringify(c, null, indent)) },
  { weight: 2, arbitrary: oddConfig.map(show) },
  // JSON that is not an object
  { weight: 1, arbitrary: fc.jsonValue().map(show) },
  // not JSON: noise, a byte-order mark in front, a truncated write
  { weight: 1, arbitrary: fc.oneof(fc.string(), goodConfig.map((c) => `\uFEFF${show(c)}`), goodConfig.map((c) => show(c).slice(0, -1))) },
);

/** A request to add a spell no config here contains, as POST /api/bubbles/add hands it to addBbBuff. */
const request = (groupName: fc.Arbitrary<string>) =>
  fc.tuple(hex32, hex32, fc.boolean(), unitIds, groupName).chain(([spell, book, hasCaster, wantedIds, group]) =>
    fc.tuple(spelled(spell), spelled(spell), spelled(book), hasCaster ? fc.string({ minLength: 1 }) : fc.constant("")).map(([spellGuid, again, spellbookId, casterId]) => ({
      spell, // the spell's GUID as 32 lowercase hex digits
      book,
      again, // the same spell GUID spelled another way
      entry: { spellGuid, groupName: group, wantedIds, casterId, spellbookId },
    })),
  );

type SavedGroups = { InGroup: number; InGroups?: string[] };
/** A BuffIt2TheLimit config whose entries carry the given group state; spells[i] is entry i's GUID and its name in the index, or null. */
const b2tlConfig = (groupState: fc.Arbitrary<SavedGroups>) =>
  fc.tuple(unknownFields, fc.array(fc.tuple(hex32, fc.constantFrom("Haste", "Heroism", "Bless", null), groupState, unknownFields, unitIds), { maxLength: 6 })).map(([settings, rows]) => ({
    cfg: { ...settings, Buffs: rows.map(([guid, , state, extra, Wanted]) => ({ Key: { Guid: dashed(guid), MetamagicMask: 0, Archmage: false }, Value: { ...extra, Wanted, Casters: [], ...state } })) },
    spells: rows.map(([guid, name]) => ({ guid, name })),
  }));
const b2tlGroups = MODS[B2TL].groups;
/** Group state as it gets saved: by the mod (InGroup is one member of InGroups), without InGroups (the mod then falls back to InGroup), or by addBbBuff/regroupBuffs. */
const groupsAsSaved: fc.Arbitrary<SavedGroups> = fc.oneof(
  fc.subarray(b2tlGroups, { minLength: 1 }).chain((InGroups) => fc.constantFrom(...InGroups).map((one) => ({ InGroup: b2tlGroups.indexOf(one), InGroups }))),
  fc.nat(2).map((InGroup) => ({ InGroup })),
  fc.constantFrom("Quick", "Important", "Long").map((g) => ({ InGroup: GROUP_MAP[g], InGroups: [g] })),
);
/** Any InGroup number next to any InGroups list, including pairs that disagree. */
const groupsInAnyState: fc.Arbitrary<SavedGroups> = fc
  .tuple(fc.nat(3), fc.option(fc.subarray(b2tlGroups), { nil: undefined }))
  .map(([InGroup, InGroups]) => (InGroups ? { InGroup, InGroups } : { InGroup }));

function indexNames(spells: { guid: string; name: string | null }[]) {
  spellNames.clear();
  for (const { guid, name } of spells) if (name) spellNames.set(guid, name);
}
const regroup = (gameId: string, mod: Mod) => outcome(() => regroupBuffs(gameId, MODS[mod].modList, GROUP_MAP, heuristic));

/**
 * Register one property. On a counterexample it prints one line in the code's words (BROKEN <id>: ...) that check.sh repeats in its summary.
 * `finding` marks a property the current code is known to break: it prints FINDING <id> instead, and bun reports the
 * test as failing once the code is fixed, which is the cue to take the marker off.
 */
function property(name: string, prop: () => void, finding?: string) {
  (finding ? test.failing : test)(finding ? `${name} [known finding ${finding}]` : name, () => {
    lastWhy = "";
    try {
      prop();
    } catch (e) {
      console.log(`${finding ? `FINDING ${finding} still present` : `BROKEN ${name.split(" ")[0]}`}: ${lastWhy || e}`);
      throw e;
    }
  });
}

// ─── Guard ───────────────────────────────────────────────────────────────────
property("G0 the writers look only inside the throwaway game dir, and the index stand-in is live", () => {
  const miss = addBbBuff("no-such-save", { spellGuid: "0".repeat(32), groupName: "Important", wantedIds: [], casterId: "", spellbookId: "", mod: B2TL });
  must(!miss.ok && miss.error.includes(cfgFile(B2TL, "no-such-save")), () => `addBbBuff looked for its file outside ${GAME_DIR}: ${show(miss)}`);
  const guid = "a".repeat(32);
  indexNames([{ guid, name: "Haste" }]);
  withConfig(B2TL, show({ Buffs: [{ Key: { Guid: dashed(guid) }, Value: { InGroup: 0 } }] }), ({ gameId, read }) => {
    regroup(gameId, B2TL);
    must(same(lastEntry(read())?.Value?.InGroups, ["Quick"]), () => `regroupBuffs did not see the stand-in index: ${read()}`);
  });
});

// ─── addBbBuff ───────────────────────────────────────────────────────────────
property("A1 add keeps everything already in the file", () =>
  fc.assert(
    fc.property(mods, anyFile, request(fc.string()), fc.boolean(), fc.nat(), (mod, text, req, aimAtConfigured, pick) =>
      withConfig(mod, text, ({ gameId, read }) => {
        const before = parse(text);
        const cfg = before.json ? before.value : undefined;
        const old = buffList(cfg);
        // half the time, ask for a spell the file already has
        const configured = (old ?? []).map((b) => bare(b?.Key?.Guid)).filter((g): g is string => g !== null && isGuidSpelling(g));
        const reuse = aimAtConfigured && configured.length > 0;
        const spell = reuse ? configured[pick % configured.length] : req.spell;
        const entry = { ...req.entry, spellGuid: reuse ? spell : req.entry.spellGuid, mod };
        const call = `addBbBuff(${show(gameId)}, ${show(entry)})`;

        const res = outcome(() => addBbBuff(gameId, entry));
        const afterText = read();
        if (!before.json) return must(!res.ok && afterText === text, () => `the file held ${show(text)}, which is not JSON; ${call} ${res.said} and the file now holds ${show(afterText)}`);
        const after = parse(afterText);
        must(after.json, () => `${call} ${res.said} and left a file that is no longer JSON: ${show(afterText)}`);
        const present = (old ?? []).some((b) => bare(b?.Key?.Guid) === spell);
        if (old && isObj(cfg) && res.ok && !present) {
          const { Buffs: now, ...restAfter } = isObj(after.value) ? after.value : {};
          const { Buffs: _old, ...restBefore } = cfg;
          must(same(restAfter, restBefore), () => `${call} changed settings outside Buffs: ${show(restBefore)} became ${show(restAfter)}`);
          must(Array.isArray(now) && now.length === old.length + 1 && same(now.slice(0, old.length), old), () => `${call} did not leave the ${old.length} existing entries untouched with one new entry after them: ${show(old)} became ${show(now)}`);
        } else {
          must(same(after.value, cfg), () => `${call} ${res.said} and changed the file: ${show(cfg)} became ${show(after.value)}`);
          must(afterText === text || (res.ok && !present), () => `${call} ${res.said} and still rewrote the file`);
        }
      }),
    ),
    opts,
  ),
);

property("A2 add never leaves two entries for one spell", () =>
  fc.assert(
    fc.property(mods, goodConfig, request(fc.string()), fc.boolean(), fc.nat(), (mod, cfg, req, aimAtConfigured, pick) =>
      withConfig(mod, show(cfg), ({ gameId, read }) => {
        const reuse = aimAtConfigured && cfg.Buffs.length > 0;
        const spell = reuse ? bare(cfg.Buffs[pick % cfg.Buffs.length].Key.Guid) : req.spell;
        const first = { ...req.entry, spellGuid: reuse && spell ? dashed(spell).toUpperCase() : req.entry.spellGuid, mod };
        const second = { ...first, spellGuid: reuse && spell ? spell : req.again };

        const r1 = outcome(() => addBbBuff(gameId, first));
        const once = read();
        const r2 = outcome(() => addBbBuff(gameId, second));
        const twice = read();
        const calls = `addBbBuff with spellGuid ${show(first.spellGuid)} ${r1.said}, then with ${show(second.spellGuid)} ${r2.said}`;
        must(r1.ok && r2.ok, () => `${calls}: both name spell ${spell} and both should succeed`);
        const count = (buffList(JSON.parse(twice)) ?? []).filter((b) => bare(b?.Key?.Guid) === spell).length;
        must(count === 1, () => `${calls}: the file now has ${count} entries for spell ${spell}`);
        must(twice === once, () => `${calls}: the repeat rewrote the file`);
      }),
    ),
    opts,
  ),
);

property("A3 add writes the spell, targets and caster that were asked for", () =>
  fc.assert(
    fc.property(mods, goodConfig, request(fc.string()), (mod, cfg, req) =>
      withConfig(mod, show(cfg), ({ gameId, read }) => {
        const entry = { ...req.entry, mod };
        const res = outcome(() => addBbBuff(gameId, entry));
        const call = `addBbBuff(${show(entry)}) ${res.said}`;
        must(res.ok, () => `${call} for a spell the file does not have`);
        const added = lastEntry(read());
        const guid = added?.Key?.Guid;
        must(typeof guid === "string" && bare(guid) === req.spell && UUID.test(guid), () => `${call} and wrote Key.Guid ${show(guid)} for spell ${req.spell}`);
        must(same(added?.Value?.Wanted, entry.wantedIds), () => `${call} and wrote Wanted ${show(added?.Value?.Wanted)}`);
        const casters = added?.Value?.Casters;
        const only: { Key?: { Name?: unknown; Spellbook?: unknown } } | undefined = Array.isArray(casters) && casters.length === 1 ? casters[0] : undefined;
        const book = only?.Key?.Spellbook;
        const casterOk = entry.casterId ? only?.Key?.Name === entry.casterId && typeof book === "string" && bare(book) === req.book && UUID.test(book) : same(casters, []);
        must(casterOk, () => `${call} and wrote Casters ${show(casters)} for caster ${show(entry.casterId)} with spellbook ${req.book}`);
      }),
    ),
    opts,
  ),
);

const filesUnderAskedGroup = (mod: Mod) => () =>
  fc.assert(
    fc.property(goodConfig, request(fc.constantFrom(...MODS[mod].pageGroups)), (cfg, req) =>
      withConfig(mod, show(cfg), ({ gameId, read }) => {
        addBbBuff(gameId, { ...req.entry, mod });
        const value = lastEntry(read())?.Value;
        const sees = groupsModSees(mod, value);
        const asked = req.entry.groupName;
        must(sees !== null && (!MODS[mod].groups.includes(asked) || same(sees, [asked])), () =>
          `addBbBuff(mod=${mod}, groupName=${show(asked)}) wrote InGroup=${show(value?.InGroup)} InGroups=${show(value?.InGroups)}; ${mod} declares ${groupTable(mod)} and so reads ${sees ? show(sees) : "no declared group"}`,
        );
      }),
    ),
    opts,
  );
property("A4 add (BuffIt2TheLimit) files the buff under the group the page asked for", filesUnderAskedGroup(B2TL));
property("A4 add (BubbleBuffs) files the buff under the group the page asked for", filesUnderAskedGroup("BubbleBuffs"), "F4");

const neverUnloadable = (whichMods: fc.Arbitrary<Mod>, requests: fc.Arbitrary<AddRequest>) => () =>
  fc.assert(
    fc.property(whichMods, goodConfig, requests, (mod, cfg, req) =>
      withConfig(mod, show(cfg), ({ gameId, read }) => {
        const entry = { ...req, mod };
        const res = outcome(() => addBbBuff(gameId, entry));
        const afterText = read();
        if (same(JSON.parse(afterText), JSON.parse(show(cfg)))) return; // refused: nothing was written
        const why = unloadable(mod, lastEntry(afterText));
        must(why === null, () => `addBbBuff(${show(entry)}) ${res.said} and appended an entry the mod's types cannot hold: ${why}`);
      }),
    ),
    opts,
  );
const loadable = request(fc.constant("Important")).map((r) => r.entry); // GUIDs are GUIDs, and both mods accept the group the code derives from "Important"
property(
  "A5 add never writes a spell id that is not a GUID",
  neverUnloadable(mods, fc.tuple(loadable, notGuid.filter((s) => s !== "")).map(([entry, spellGuid]) => ({ ...entry, spellGuid }))),
  "F1",
);
property(
  "A6 add never writes a caster whose spellbook id is not a GUID",
  neverUnloadable(mods, fc.tuple(loadable, notGuid, fc.string({ minLength: 1 })).map(([entry, spellbookId, casterId]) => ({ ...entry, spellbookId, casterId }))),
  "F2",
);
property(
  "A7 add (BuffIt2TheLimit) never writes a group the mod does not declare",
  neverUnloadable(fc.constant(B2TL), fc.tuple(loadable, fc.string()).map(([entry, groupName]) => ({ ...entry, groupName }))),
  "F3",
);

// ─── regroupBuffs ────────────────────────────────────────────────────────────
property("R1 regroup changes nothing but each buff's group", () => {
  const withoutGroup = (b: Entry) => {
    if (!isObj(b) || !isObj(b.Value)) return b;
    const { InGroup: _number, InGroups: _names, ...value } = b.Value;
    return { ...b, Value: value };
  };
  const files = fc.oneof(
    anyFile.map((text) => ({ text, spells: [] as { guid: string; name: string | null }[] })),
    b2tlConfig(groupsInAnyState).map(({ cfg, spells }) => ({ text: JSON.stringify(cfg, null, 2), spells })),
  );
  fc.assert(
    fc.property(mods, files, (mod, { text, spells }) =>
      withConfig(mod, text, ({ gameId, read }) => {
        indexNames(spells);
        const res = regroup(gameId, mod);
        const afterText = read();
        const before = parse(text);
        const call = `regroupBuffs for ${mod} ${res.said}`;
        must(!res.ok || (mod === B2TL && before.json), () => `${call} on ${mod !== B2TL ? "a mod it does not support" : `a file that is not JSON (${show(text)})`}`);
        if (!res.ok || !before.json) return must(afterText === text, () => `${call} and still rewrote the file: ${show(text)} became ${show(afterText)}`);
        const after = parse(afterText);
        must(after.json, () => `${call} and left a file that is no longer JSON: ${show(afterText)}`);
        const cfg = before.value;
        if (!isObj(cfg) || !Array.isArray(cfg.Buffs)) return must(same(after.value, cfg), () => `${call} and changed a file with no buff list: ${show(cfg)} became ${show(after.value)}`);
        const { Buffs: now, ...restAfter } = isObj(after.value) ? after.value : {};
        const { Buffs: old, ...restBefore } = cfg;
        must(same(restAfter, restBefore), () => `${call} and changed settings outside Buffs: ${show(restBefore)} became ${show(restAfter)}`);
        must(Array.isArray(now) && same(now.map(withoutGroup), cfg.Buffs.map(withoutGroup)), () => `${call} and changed more than InGroup/InGroups: ${show(old)} became ${show(now)}`);
      }),
    ),
    opts,
  );
});

const landsAndSettles = (groupState: fc.Arbitrary<SavedGroups>) => () =>
  fc.assert(
    fc.property(b2tlConfig(groupState), ({ cfg, spells }) =>
      withConfig(B2TL, show(cfg), ({ gameId, read }) => {
        indexNames(spells);
        const first = regroup(gameId, B2TL);
        must(first.ok, () => `regroupBuffs ${first.said} on ${show(cfg)}`);
        const once = read();
        (buffList(JSON.parse(once)) ?? []).forEach((b, i) => {
          const want = heuristic((spells[i].name ?? "").toLowerCase().replace(/[^a-z]/g, "")); // the name clean-up regroupBuffs does before it asks the heuristic
          const sees = groupsModSees(B2TL, b?.Value);
          const was = cfg.Buffs[i].Value;
          must(sees !== null && sees.includes(want), () =>
            `regroupBuffs ${first.said}; the heuristic wants ${spells[i].name ?? "a spell missing from the index"} in ${want}. The entry had InGroup=${show(was.InGroup)} InGroups=${show(was.InGroups)} and now has InGroup=${show(b?.Value?.InGroup)} InGroups=${show(b?.Value?.InGroups)}, which the mod reads as ${sees ? show(sees) : "no declared group"}`,
          );
        });
        const second = regroup(gameId, B2TL);
        must(second.ok && second.updated === 0 && read() === once, () => `a second regroupBuffs right after the first ${second.said} and ${read() === once ? "left the file alone" : "rewrote the file"}`);
      }),
    ),
    opts,
  );
property("R2 regroup puts every buff in the heuristic's group, then settles", landsAndSettles(groupsAsSaved));
property("R3 regroup does the same whatever InGroup and InGroups held before", landsAndSettles(groupsInAnyState), "F5");
