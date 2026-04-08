import { Hono } from "hono";
import { parseSave, listSaves } from "../services/save-parser.ts";
import { analyzeParty } from "../services/party-analyzer.ts";
import { analyzeComposition } from "../services/party-builder.ts";
import { isIndexed, getStats, searchBlueprintsByName, lookupBlueprintsMany } from "../services/blueprint-db.ts";
import { createSseResponse } from "../services/file-watcher.ts";
import { readBbConfig, addBbBuff, detectBuffMod, regroupBuffs } from "../services/bubble-buffs.ts";
import { getBuilds, getBuild, upsertBuild } from "../services/build-store.ts";
import { adviseBuild } from "../services/build-advisor.ts";
import { getBuildGuide } from "../services/build-guide.ts";
import type { BuildProfile } from "../models/types.ts";

const app = new Hono();

/** GET /api/status — health + index status */
app.get("/status", (c) => {
  const indexed = isIndexed();
  const stats = indexed ? getStats() : null;
  return c.json({ ok: true, indexed, stats });
});

/** GET /api/saves — list all save files */
app.get("/saves", (c) => {
  const saves = listSaves().map((s) => ({
    name: s.name,
    path: s.path,
    mtime: s.mtime.toISOString(),
  }));
  return c.json(saves);
});

/** GET /api/party — parse most recent save and return party data */
app.get("/party", async (c) => {
  const savePath = c.req.query("save");
  const data = await parseSave(savePath);
  if (!data) return c.json({ error: "No save found or parse failed" }, 404);
  return c.json(data);
});

/** GET /api/analysis — party + analysis overlay */
app.get("/analysis", async (c) => {
  const savePath = c.req.query("save");
  const data = await parseSave(savePath);
  if (!data) return c.json({ error: "No save found or parse failed" }, 404);
  const analysis = analyzeParty(data);
  return c.json({ party: data, analysis });
});

/** GET /api/blueprints/search?q= */
app.get("/blueprints/search", (c) => {
  const q = c.req.query("q") ?? "";
  if (q.length < 2) return c.json([]);
  const results = searchBlueprintsByName(q);
  return c.json(results);
});

/** GET /api/bubbles — BubbleBuffs config + diff vs available buffs */
app.get("/bubbles", async (c) => {
  const savePath = c.req.query("save");
  const party = await parseSave(savePath);
  if (!party) return c.json({ error: "No save found" }, 404);

  const gameId = party.meta.name
    ? undefined
    : undefined; // GameId is in raw header; use the meta approach below

  // GameId is embedded in save meta — re-read header to get it
  const bbConfig = await (async () => {
    // Try common GameId patterns from save name
    // BubbleBuffs uses the GameId from header.json
    const saves = listSaves();
    const target = savePath ?? saves[0]?.path;
    if (!target) return null;
    const { unzipSync } = await import("fflate");
    const fs = await import("fs");
    const zipData = fs.readFileSync(target);
    const files = unzipSync(zipData);
    const headerEntry = Object.entries(files).find(([k]) => {
      const base = k.split(/[\/\\]/).pop() ?? k;
      return base === "header.json";
    });
    if (!headerEntry) return null;
    const header = JSON.parse(new TextDecoder().decode(headerEntry[1]));
    const gameId: string = header.GameId ?? "";
    return gameId ? await readBbConfig(gameId, party.meta.mods) : null;
  })();

  const activeMod = detectBuffMod(party.meta.mods);

  if (!bbConfig) {
    return c.json({ configured: false, message: `Buff mod config not found (looking for ${activeMod})` });
  }

  // Pre-combat buff spell keywords — things that belong in BubbleBuffs
  // Excludes: CC, debuffs, damage, healing, condition removal
  const PREBUFF_NAMES = [
    "bless", "haste", "heroism", "prayer", "goodhope", "inspire",
    "magearmor", "shield", "protection", "resist", "blur", "mirrorimage",
    "displacement", "stoneskin", "barkskin", "magicweapon", "magicfang",
    "divinefavor", "divinepower", "holyaura", "guidance", "virtue",
    "resistance", "unbreakableheart", "removefear", "communal",
    "bull", "bear", "cat", "eagle", "fox", "owl", "freedom",
    "shield", "faerie", "feather", "longstrider", "aid",
  ];
  // Priority score for sorting (higher = more important)
  const PRIORITY: Record<string, number> = {
    bless: 100, haste: 95, prayer: 90, goodhope: 85, heroism: 80,
    communal: 75, magicweapon: 70, protection: 65, magearmor: 60,
    divinefavor: 55, divinepower: 50, barkskin: 45, stoneskin: 40,
    blur: 35, mirrorimage: 35, displacement: 35, bull: 30, bear: 30,
    guidance: 20, resistance: 20, virtue: 20, unbreakableheart: 25,
    removefear: 25, freedom: 20, aid: 15,
  };

  // Group suggestions for missing buffs — adapted per active mod
  // B2TL groups: Quick / Important / Long
  // BubbleBuffs:  Short  / Normal   / Long
  const isB2TL = activeMod === "BuffIt2TheLimit";
  const G_QUICK     = isB2TL ? "Quick"     : "Short";
  const G_IMPORTANT = isB2TL ? "Important" : "Normal";
  const G_LONG      = isB2TL ? "Long"      : "Long";

  const BB_GROUP: Record<string, string> = {
    haste: G_QUICK, prayer: G_QUICK,
    bless: G_IMPORTANT, protection: G_IMPORTANT, communal: G_IMPORTANT,
    guidance: G_IMPORTANT, resistance: G_IMPORTANT, virtue: G_IMPORTANT,
    unbreakableheart: G_IMPORTANT, aid: G_IMPORTANT, divinefavor: G_IMPORTANT, magicfang: G_IMPORTANT,
    goodhope: G_LONG, heroism: G_LONG, magicweapon: G_LONG, magearmor: G_LONG, divinepower: G_LONG,
    blur: G_LONG, mirrorimage: G_LONG, displacement: G_LONG, stoneskin: G_LONG, barkskin: G_LONG,
    bull: G_LONG, bear: G_LONG, cat: G_LONG, eagle: G_LONG, fox: G_LONG, owl: G_LONG,
    removefear: G_LONG, freedom: G_LONG,
  };

  const GROUP_TIP_MAP: Record<string, string> = {
    [G_QUICK]:     "rounds/level — cast right before each fight",
    [G_IMPORTANT]: "standard prebuff — cast before every encounter",
    [G_LONG]:      "situational — cast as needed",
  };

  // Who to target in BubbleBuffs / B2TL
  type Target = "All" | "Frontline" | "Caster" | "Strongest melee";
  const BB_TARGET: Record<string, Target> = {
    bless: "All", haste: "All", prayer: "All", goodhope: "All", heroism: "All",
    communal: "All", aid: "All", resistance: "All", guidance: "All",
    virtue: "All",
    protection: "Frontline", stoneskin: "Frontline", magearmor: "Caster",
    magicweapon: "Strongest melee", divinefavor: "Frontline",
    blur: "Frontline", mirrorimage: "Caster", displacement: "Frontline",
    bull: "Strongest melee", bear: "Frontline", barkskin: "Frontline",
    unbreakableheart: "All", removefear: "All", freedom: "Frontline",
  };

  function bbGroup(name: string): string {
    const n = name.toLowerCase().replace(/[^a-z]/g, "");
    for (const [k, v] of Object.entries(BB_GROUP)) {
      if (n.includes(k)) return v;
    }
    return G_IMPORTANT;
  }
  function bbTarget(name: string): Target {
    const n = name.toLowerCase().replace(/[^a-z]/g, "");
    for (const [k, v] of Object.entries(BB_TARGET)) {
      if (n.includes(k)) return v;
    }
    return "All";
  }

  function isPrebuff(name: string): boolean {
    const n = name.toLowerCase().replace(/[^a-z]/g, "");
    return PREBUFF_NAMES.some((k) => n.includes(k));
  }
  function priority(name: string): number {
    const n = name.toLowerCase().replace(/[^a-z]/g, "");
    for (const [k, v] of Object.entries(PRIORITY)) {
      if (n.includes(k)) return v;
    }
    return 5;
  }

  // Collect only pre-combat buff spells from party spellbooks
  const allSpells = party.characters.flatMap((ch) => ch.spellbook?.knownSpells.flat() ?? []);
  const seen = new Set<string>();
  const availablePrebuffs = allSpells
    .filter((s) => {
      if (seen.has(s.blueprintId)) return false;
      seen.add(s.blueprintId);
      return isPrebuff(s.name);
    })
    .sort((a, b) => priority(b.name) - priority(a.name));

  const configuredGuids = new Set(bbConfig.buffs.map((b) => b.spellGuid));

  // Build caster name lookup — prefer display name (customName) over blueprint name
  // ch.name comes from save parser: customName || blueprintName || id.slice(0,8)
  // For companions, blueprintName looks like "Camelia_Companion" — clean it up
  function cleanName(n: string): string {
    return n.replace(/_Companion$/, "").replace(/_/g, " ");
  }
  const spellToCaster: Record<string, string> = {};     // blueprintId -> caster display name
  const spellToCasterId: Record<string, string> = {};   // blueprintId -> caster uniqueId
  const spellToSpellbookId: Record<string, string> = {}; // blueprintId -> spellbook blueprint
  const idToName: Record<string, string> = {};
  for (const ch of party.characters) {
    idToName[ch.uniqueId] = cleanName(ch.name);
    if (!ch.spellbook) continue;
    for (const lvlSpells of ch.spellbook.knownSpells) {
      for (const s of lvlSpells) {
        if (!spellToCaster[s.blueprintId]) {
          spellToCaster[s.blueprintId]     = cleanName(ch.name);
          spellToCasterId[s.blueprintId]   = ch.uniqueId;
          spellToSpellbookId[s.blueprintId] = ch.spellbook!.blueprintId;
        }
      }
    }
  }
  const allCharacterIds = party.characters.map((ch) => ch.uniqueId);

  // Spell effect descriptions for common buffs
  const EFFECTS: Record<string, string> = {
    bless: "+1 morale to attack rolls & saves vs fear — covers whole party",
    haste: "+1 attack, +30ft speed, +1 AC/Reflex — best combat buff",
    prayer: "+1 luck to attacks/damage/saves for allies, -1 for enemies",
    goodhope: "+2 morale to attacks, damage, saves, checks",
    heroism: "+2 morale to attacks, saves, skills",
    magicweapon: "+1 enhancement bonus to weapon",
    protection: "+2 deflection AC, +2 resistance saves vs alignment",
    magearmor: "+4 armor AC for unarmored characters",
    divinefavor: "+1 luck to attacks & damage per 3 levels",
    guidance: "+1 competence to one attack, save, or skill",
    resistance: "+1 resistance to all saves",
    virtue: "+1 temp HP per caster level",
    unbreakableheart: "immunity to shaken/confused from morale effects",
    removefear: "+4 morale vs fear; removes fear effects",
    stoneskin: "DR 10/adamantine, max 10/level",
    barkskin: "+2 to +5 natural armor AC",
    blur: "20% miss chance (concealment)",
    mirrorimage: "2d4 illusory duplicates absorb hits",
    displacement: "50% miss chance",
    bull: "+4 enhancement STR",
    bear: "+4 enhancement CON",
    freedom: "immune to movement-impairing effects",
    aid: "+1 morale to attacks/saves + temp HP",
  };

  function effect(name: string): string {
    const n = name.toLowerCase().replace(/[^a-z]/g, "");
    for (const [k, v] of Object.entries(EFFECTS)) {
      if (n.includes(k)) return v;
    }
    return "";
  }

  const missing = availablePrebuffs
    .filter((s) => !configuredGuids.has(s.blueprintId))
    .map((s) => {
      const grp = bbGroup(s.name);
      return {
        guid:        s.blueprintId,
        name:        s.displayName || s.name,
        level:       s.spellLevel,
        priority:    priority(s.name),
        isCantrip:   s.isCantrip,
        group:       0,            // legacy; frontend uses groupLabel
        groupLabel:  grp,
        groupTip:    GROUP_TIP_MAP[grp] ?? "",
        target:      bbTarget(s.name),
        caster:      spellToCaster[s.blueprintId]     ?? "Unknown",
        casterId:    spellToCasterId[s.blueprintId]   ?? "",
        spellbookId: spellToSpellbookId[s.blueprintId] ?? "",
        wantedIds:   allCharacterIds,
        effect:      effect(s.name),
      };
    });

  // Advice on each existing configured buff
  const existingAdvice: Record<string, string> = {};
  for (const b of bbConfig.buffs) {
    const n = b.spellName.toLowerCase();
    if (n.includes("guidance") || n.includes("resistance") || n.includes("virtue")) {
      existingAdvice[b.spellGuid] = "Cantrip — free and unlimited. Cast on everyone.";
    } else if (n.includes("magelight") || n.includes("light")) {
      const targets = b.wanted.length;
      if (targets <= 1) existingAdvice[b.spellGuid] = "⚠️ Only targeting 1 person — consider targeting all or removing (it\'s just a light source).";
      else existingAdvice[b.spellGuid] = "Utility (light) — free cantrip, OK to keep.";
    } else if (n.includes("bless")) {
      existingAdvice[b.spellGuid] = "Perfect. Cast on all frontliners, targeting the whole party.";
    }
  }

  return c.json({
    configured: true,
    gameId: bbConfig.gameId,
    verboseCasting: bbConfig.verboseCasting,
    allowInCombat: bbConfig.allowInCombat,
    buffs: bbConfig.buffs.map((b) => ({
      ...b,
      groupLabel: b.groupName,  // group name read directly from config
      casterNames: b.casterIds.map((id) => idToName[id] ?? cleanName(id)),
      wantedNames: b.wanted.map((id) => idToName[id] ?? cleanName(id)),
      advice: existingAdvice[b.spellGuid] ?? "",
    })),
    missing,
    stats: {
      total: bbConfig.buffs.length,
      active: bbConfig.buffs.filter((b) => !b.blacklisted).length,
      blacklisted: bbConfig.buffs.filter((b) => b.blacklisted).length,
      missing: missing.length,
    },
  });
});

// ─── Build planner endpoints ──────────────────────────────────────────────────

/** GET /api/builds — all saved build profiles */
app.get("/builds", (c) => {
  return c.json(getBuilds());
});

/** PUT /api/builds/:characterId — upsert a build profile */
app.put("/builds/:characterId", async (c) => {
  let body: Omit<BuildProfile, "updatedAt">;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const characterId = c.req.param("characterId");
  if (!body.role || !body.classPath) {
    return c.json({ error: "role and classPath are required" }, 400);
  }
  const saved = upsertBuild({ ...body, characterId, updatedAt: new Date().toISOString() });
  return c.json(saved);
});

/** GET /api/builds/:characterId/advice — compute build advice for a character */
app.get("/builds/:characterId/advice", async (c) => {
  const characterId = c.req.param("characterId");
  const profile = getBuild(characterId);
  if (!profile) {
    return c.json({ error: "No build profile found for this character" }, 404);
  }

  const savePath = c.req.query("save");
  const partyData = await parseSave(savePath);
  if (!partyData) {
    return c.json({ error: "No save found or parse failed" }, 404);
  }

  const char = partyData.characters.find((ch) => ch.uniqueId === characterId);
  if (!char) {
    return c.json({ error: "Character not found in current save" }, 404);
  }

  const advice = adviseBuild(profile, char);
  return c.json(advice);
});

/** GET /api/build-guide — curated issues, synergies, per-character recommendations */
app.get("/build-guide", async (c) => {
  const savePath = c.req.query("save");
  const data = await parseSave(savePath);
  if (!data) return c.json({ error: "No save found or parse failed" }, 404);
  return c.json(getBuildGuide(data));
});

/** GET /api/party-builder — role composition analysis */
app.get("/party-builder", async (c) => {
  const savePath = c.req.query("save");
  const data = await parseSave(savePath);
  if (!data) return c.json({ error: "No save found or parse failed" }, 404);
  const profiles = getBuilds();
  const composition = analyzeComposition(data, profiles);
  return c.json(composition);
});

/** POST /api/bubbles/regroup — reclassify all existing B2TL buffs into correct Quick/Important/Long groups */
app.post("/bubbles/regroup", async (c) => {
  const savePath  = c.req.query("save");
  const partyData = await parseSave(savePath);
  if (!partyData) return c.json({ error: "No save found" }, 404);

  const saves  = listSaves();
  const target = savePath ?? saves[0]?.path;
  if (!target) return c.json({ error: "No save found" }, 404);

  const { unzipSync } = await import("fflate");
  const fs = await import("fs");
  const zipData = fs.readFileSync(target);
  const files   = unzipSync(zipData);
  const headerEntry = Object.entries(files).find(([k]) => {
    const base = k.split(/[\/\\]/).pop() ?? k;
    return base === "header.json";
  });
  if (!headerEntry) return c.json({ error: "header.json not found in save" }, 500);
  const header = JSON.parse(new TextDecoder().decode(headerEntry[1]));
  const gameId: string = header.GameId ?? "";
  if (!gameId) return c.json({ error: "GameId missing from save header" }, 500);

  // Same heuristic used for missing-buff suggestions
  const isB2TL = true;
  const G_QUICK     = "Quick";
  const G_IMPORTANT = "Important";
  const G_LONG      = "Long";

  const BB_GROUP: Record<string, string> = {
    haste: G_QUICK, prayer: G_QUICK,
    bless: G_IMPORTANT, protection: G_IMPORTANT, communal: G_IMPORTANT,
    guidance: G_IMPORTANT, resistance: G_IMPORTANT, virtue: G_IMPORTANT,
    unbreakableheart: G_IMPORTANT, aid: G_IMPORTANT, divinefavor: G_IMPORTANT, magicfang: G_IMPORTANT,
    goodhope: G_LONG, heroism: G_LONG, magicweapon: G_LONG, magearmor: G_LONG, divinepower: G_LONG,
    blur: G_LONG, mirrorimage: G_LONG, displacement: G_LONG, stoneskin: G_LONG, barkskin: G_LONG,
    bull: G_LONG, bear: G_LONG, cat: G_LONG, eagle: G_LONG, fox: G_LONG, owl: G_LONG,
    removefear: G_LONG, freedom: G_LONG, longstrider: G_LONG, feather: G_LONG,
  };

  function heuristic(clean: string): string {
    for (const [k, v] of Object.entries(BB_GROUP)) {
      if (clean.includes(k)) return v;
    }
    return G_IMPORTANT; // default: Important
  }

  const groupMap: Record<string, number> = { Normal: 0, Quick: 1, Important: 2, Long: 3 };

  const result = regroupBuffs(gameId, partyData.meta.mods, groupMap, heuristic);
  return c.json(result);
});

/** POST /api/bubbles/add — write a new buff entry to the active buff mod config */
app.post("/bubbles/add", async (c) => {
  let body: { spellGuid: string; groupName?: string; wantedIds: string[]; casterId: string; spellbookId: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (!body.spellGuid) return c.json({ error: "spellGuid required" }, 400);

  const savePath = c.req.query("save");
  const partyData = await parseSave(savePath);
  if (!partyData) return c.json({ error: "No save found" }, 404);

  const saves = listSaves();
  const target = savePath ?? saves[0]?.path;
  if (!target) return c.json({ error: "No save found" }, 404);

  const { unzipSync } = await import("fflate");
  const fs = await import("fs");
  const zipData = fs.readFileSync(target);
  const files = unzipSync(zipData);
  const headerEntry = Object.entries(files).find(([k]) => {
    const base = k.split(/[\/\\]/).pop() ?? k;
    return base === "header.json";
  });
  if (!headerEntry) return c.json({ error: "Could not read save header" }, 500);
  const header = JSON.parse(new TextDecoder().decode(headerEntry[1]));
  const gameId: string = header.GameId ?? "";
  if (!gameId) return c.json({ error: "GameId not found in save" }, 500);

  const mod = detectBuffMod(partyData.meta.mods);
  const result = addBbBuff(gameId, {
    spellGuid:  body.spellGuid,
    groupName:  body.groupName ?? (mod === "BuffIt2TheLimit" ? "Important" : "Normal"),
    wantedIds:  body.wantedIds ?? [],
    casterId:   body.casterId ?? "",
    spellbookId: body.spellbookId ?? "",
    mod,
  });
  if (!result.ok) return c.json({ error: result.error }, 500);
  return c.json({ ok: true });
});

/** GET /events — SSE stream for save file changes */
app.get("/events", (c) => {
  return createSseResponse();
});

export default app;
