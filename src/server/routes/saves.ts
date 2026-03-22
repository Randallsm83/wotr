import { Hono } from "hono";
import { parseSave, listSaves } from "../services/save-parser.ts";
import { analyzeParty } from "../services/party-analyzer.ts";
import { isIndexed, getStats, searchBlueprintsByName, lookupBlueprintsMany } from "../services/blueprint-db.ts";
import { createSseResponse } from "../services/file-watcher.ts";
import { readBbConfig, groupLabel } from "../services/bubble-buffs.ts";

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
    return gameId ? await readBbConfig(gameId) : null;
  })();

  if (!bbConfig) {
    return c.json({ configured: false, message: "BubbleBuffs config not found for this game" });
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

  // BubbleBuffs group: 1=Short (rounds), 2=Important (always-on), 3=Normal (situational)
  const BB_GROUP: Record<string, 1|2|3> = {
    // Short — apply right before combat
    haste: 1, prayer: 1,
    // Important — always cast, every encounter
    bless: 2, protection: 2, communal: 2, guidance: 2, resistance: 2, virtue: 2,
    unbreakableheart: 2, aid: 2, divinefavor: 2,
    // Normal — situational / nice to have
    goodhope: 3, heroism: 3, magicweapon: 3, magearmor: 3, divinepower: 3,
    blur: 3, mirrorimage: 3, displacement: 3, stoneskin: 3, barkskin: 3,
    bull: 3, bear: 3, cat: 3, eagle: 3, fox: 3, owl: 3,
    removefear: 3, freedom: 3,
  };

  // Who to target in BubbleBuffs
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

  // BubbleBuffs groups: 1=Short, 2=Important (always-cast), 3=Normal (nice-to-have)
  const GROUP_LABEL: Record<1|2|3, string> = { 1: "Short", 2: "Important", 3: "Normal" };
  const GROUP_TIP: Record<1|2|3, string> = {
    1: "rounds/level — Short group, apply immediately before combat",
    2: "always-cast buff — Important group (same as your cantrips)",
    3: "1+ min/level, situational — Normal group",
  };

  function bbGroup(name: string): 1|2|3 {
    const n = name.toLowerCase().replace(/[^a-z]/g, "");
    for (const [k, v] of Object.entries(BB_GROUP)) {
      if (n.includes(k)) return v;
    }
    return 2;
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
  const spellToCaster: Record<string, string> = {};
  const idToName: Record<string, string> = {};
  for (const ch of party.characters) {
    idToName[ch.uniqueId] = cleanName(ch.name);
    if (!ch.spellbook) continue;
    for (const lvlSpells of ch.spellbook.knownSpells) {
      for (const s of lvlSpells) {
        if (!spellToCaster[s.blueprintId]) spellToCaster[s.blueprintId] = cleanName(ch.name);
      }
    }
  }

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
        guid: s.blueprintId,
        name: s.name,
        level: s.spellLevel,
        priority: priority(s.name),
        isCantrip: s.isCantrip,
        group: grp,
        groupLabel: GROUP_LABEL[grp],
        groupTip: GROUP_TIP[grp],
        target: bbTarget(s.name),
        caster: spellToCaster[s.blueprintId] ?? "Unknown",
        effect: effect(s.name),
      };
    });

  // Advice on each existing configured buff
  const existingAdvice: Record<string, string> = {};
  for (const b of bbConfig.buffs) {
    const n = b.spellName.toLowerCase();
    if (n.includes("guidance") || n.includes("resistance") || n.includes("virtue")) {
      existingAdvice[b.spellGuid] = "Cantrip — free and unlimited. Good on Important.";
    } else if (n.includes("magelight") || n.includes("light")) {
      const targets = b.wanted.length;
      if (targets <= 1) existingAdvice[b.spellGuid] = "⚠️ Only targeting 1 person — consider targeting all or removing (it\'s just a light source).";
      else existingAdvice[b.spellGuid] = "Utility (light) — free cantrip, OK to keep.";
    } else if (n.includes("bless")) {
      existingAdvice[b.spellGuid] = "Perfect. Bless on Important, targeting all party members.";
    }
  }

  return c.json({
    configured: true,
    gameId: bbConfig.gameId,
    verboseCasting: bbConfig.verboseCasting,
    allowInCombat: bbConfig.allowInCombat,
    buffs: bbConfig.buffs.map((b) => ({
      ...b,
      groupLabel: groupLabel(b.inGroup),
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

/** GET /events — SSE stream for save file changes */
app.get("/events", (c) => {
  return createSseResponse();
});

export default app;
