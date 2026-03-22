import { unzipSync } from "fflate";
import fs from "fs";
import path from "path";
import { lookupBlueprintsMany } from "./blueprint-db.ts";
import type {
  PartyData, SaveMeta, CharacterData, ClassInfo,
  SpellbookData, SpellEntry, PreparedLevel, PreparedSlot, SlotInfo,
  CharacterStats, FeatEntry, TraitEntry, EquipmentItem,
} from "../models/types.ts";

const SAVES_DIR =
  process.env.WOTR_SAVES_DIR ??
  path.join(
    process.env.USERPROFILE ?? "C:\\Users\\Default",
    "AppData\\LocalLow\\Owlcat Games\\Pathfinder Wrath Of The Righteous\\Saved Games"
  );

// ─── Public API ───────────────────────────────────────────────────────────────

export function getSavesDir(): string {
  return SAVES_DIR;
}

/** Return all .zks save files sorted newest first */
export function listSaves(): { name: string; path: string; mtime: Date }[] {
  if (!fs.existsSync(SAVES_DIR)) return [];
  return fs
    .readdirSync(SAVES_DIR)
    .filter((f) => f.endsWith(".zks"))
    .map((f) => {
      const p = path.join(SAVES_DIR, f);
      return { name: f, path: p, mtime: fs.statSync(p).mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

/** Parse the most recent save (or a specific path) */
export async function parseSave(savePath?: string): Promise<PartyData | null> {
  const target = savePath ?? listSaves()[0]?.path;
  if (!target || !fs.existsSync(target)) return null;

  const zipData = fs.readFileSync(target);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipData);
  } catch (e) {
    console.error("Failed to unzip save:", e);
    return null;
  }

  const readJson = (name: string) => {
    const entry = Object.entries(files).find(([k]) => path.basename(k) === name);
    if (!entry) return null;
    try { return JSON.parse(new TextDecoder().decode(entry[1])); }
    catch { return null; }
  };

  const header  = readJson("header.json");
  const party   = readJson("party.json");
  const modList = readJson("header.json.ModList.json");
  if (!header || !party) return null;

  const meta = parseMeta(header, modList);
  const characters = await parseParty(party, header);
  return { meta, characters };
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

function parseMeta(header: any, modList: any): SaveMeta {
  return {
    name: header.Name ?? "",
    area: header.Area ?? "",
    playerCharacterName: header.PlayerCharacterName ?? "",
    saveTime: header.SystemSaveTime ?? "",
    gameTotalTime: header.GameTotalTime ?? "",
    mods: Array.isArray(modList)
      ? modList.map((m: any) => ({ id: m.Id, version: m.Version, modType: m.modType }))
      : [],
  };
}

// ─── Party ────────────────────────────────────────────────────────────────────

async function parseParty(party: any, header: any): Promise<CharacterData[]> {
  const entities: any[] = party.m_EntityData ?? [];
  const pcName: string = header.PlayerCharacterName ?? "";

  // Collect all blueprint GUIDs we'll need
  const allGuids = new Set<string>();
  for (const entity of entities) {
    const desc = entity.Descriptor;
    if (!desc) continue;
    if (desc.Blueprint) allGuids.add(desc.Blueprint);
    const prog = desc.Progression;
    if (prog?.Classes) {
      for (const cls of prog.Classes) {
        if (cls.CharacterClass) allGuids.add(cls.CharacterClass);
        if (cls.Archetypes?.[0]) allGuids.add(cls.Archetypes[0]);
      }
    }
    for (const sbEntry of (desc.m_Spellbooks ?? [])) {
      const sb = sbEntry.Value;
      if (!sb) continue;
      collectSpellGuids(sb, allGuids);
    }
    // Race GUID
    if (desc.Progression?.m_Race) allGuids.add(desc.Progression.m_Race);
    // Facts — racial/class traits
    for (const fact of (entity.Facts?.m_Facts ?? [])) {
      if (fact?.Blueprint && fact?.["$type"]?.includes("Feature")) allGuids.add(fact.Blueprint);
    }
    // Item blueprints from Body slots
    collectBodyItemGuids(desc.Body, allGuids);
    // Feat selection GUIDs
    for (const sel of (desc.Progression?.m_Selections ?? [])) {
      const byLevel = sel.Value?.m_SelectionsByLevel ?? {};
      for (const guid of Object.values(byLevel)) {
        if (typeof guid === "string" && guid) allGuids.add(guid);
      }
    }
  }

  const blueprintMap = lookupBlueprintsMany([...allGuids]);

  return entities
    .filter((e) => e.Descriptor)
    .map((entity) => parseEntity(entity, pcName, blueprintMap));
}

function collectSpellGuids(sb: any, out: Set<string>) {
  // Known spells (array of arrays)
  const known: any[][] = sb.m_KnownSpells ?? [];
  for (const lvl of known) {
    if (!Array.isArray(lvl)) continue;
    for (const s of lvl) {
      if (s?.Blueprint) out.add(s.Blueprint);
    }
  }
  // Memorized spells
  const memo: any[][] = sb.m_MemorizedSpells ?? [];
  for (const lvl of memo) {
    if (!Array.isArray(lvl)) continue;
    for (const slot of lvl) {
      if (slot?.Spell?.Blueprint) out.add(slot.Spell.Blueprint);
    }
  }
}

function parseEntity(
  entity: any,
  pcName: string,
  blueprintMap: Map<string, any>
): CharacterData {
  const desc = entity.Descriptor;
  const blueprint: string = desc.Blueprint ?? "";
  const customName: string = desc.CustomName ?? "";
  const uniqueId: string = entity.UniqueId ?? "";

  // Resolve display name
  const blueprintInfo = blueprintMap.get(blueprint);
  const name = customName || blueprintInfo?.name || blueprint.slice(0, 8);
  const isPC = !!customName || name === pcName;

  // Class info
  const prog = desc.Progression;
  let classInfo: ClassInfo | undefined;
  if (prog?.Classes) {
    const cls = prog.Classes[0] ?? prog.Classes;
    if (cls) {
      const classId = cls.CharacterClass ?? "";
      const archetypeId = cls.Archetypes?.[0] ?? "";
      classInfo = {
        classId,
        className: blueprintMap.get(classId)?.name ?? classId.slice(0, 8),
        archetypeId: archetypeId || undefined,
        archetypeName: archetypeId ? (blueprintMap.get(archetypeId)?.name ?? archetypeId.slice(0, 8)) : undefined,
        level: cls.Level ?? 1,
      };
    }
  }

  // Identity
  const gender: string = desc.CustomGender ?? "";
  const raceId: string = desc.Progression?.m_Race ?? "";
  const race = raceId ? (blueprintMap.get(raceId)?.name?.replace(/Race$/, "") ?? "") : "";
  const alignment = parseAlignment(desc.Alignment);

  // Stats
  const stats = parseStats(desc.Stats, desc.m_Damage ?? 0);

  // Feats + extract background/deity from selections
  const { feats, background, deity } = parseFeatsAndIdentity(
    desc.Progression?.m_Selections ?? [],
    blueprintMap
  );

  // Traits from Facts (racial traits, class features, background traits)
  const traits = parseTraits(
    entity.Facts?.m_Facts ?? [],
    blueprintMap,
    { raceName: race, className: classInfo?.className, archetypeName: classInfo?.archetypeName }
  );

  // Spellbook
  const sbEntries: any[] = desc.m_Spellbooks ?? [];
  let spellbook: SpellbookData | undefined;
  if (sbEntries.length > 0) {
    spellbook = parseSpellbook(sbEntries[0].Value, blueprintMap);
  }

  // Equipment from Body slots
  const equipment = parseEquipment(desc.Body, entity.Facts, blueprintMap);

  return { uniqueId, name, blueprint, isPlayerCharacter: isPC, gender, race, alignment, background, deity, class: classInfo, stats, feats, traits, equipment, spellbook };
}

// ─── Spellbook ────────────────────────────────────────────────────────────────

function parseSpellbook(sb: any, blueprintMap: Map<string, any>): SpellbookData {
  const blueprintId: string = sb.Blueprint ?? "";
  const type: string = sb.m_Type ?? "Normal";
  const casterLevel: number = (sb.m_BaseLevelInternal ?? 0) + (sb.m_MythicLevelInternal ?? 0);

  // Known spells (all levels the character can prepare or knows)
  const knownRaw: any[][] = sb.m_KnownSpells ?? [];
  const knownSpells: SpellEntry[][] = knownRaw.map((lvlArr, lvlIdx) => {
    if (!Array.isArray(lvlArr)) return [];
    const seen = new Set<string>();
    const entries: SpellEntry[] = [];
    for (const s of lvlArr) {
      const bpId: string = s?.Blueprint ?? "";
      if (!bpId || seen.has(bpId)) continue;
      seen.add(bpId);
      entries.push(resolveSpellEntry(bpId, lvlIdx, blueprintMap));
    }
    return entries;
  });

  // Memorized spells (prepared for today)
  const memoRaw: any[][] = sb.m_MemorizedSpells ?? [];
  const preparedSpells: PreparedLevel[] = memoRaw
    .map((lvlArr, lvlIdx): PreparedLevel => {
      if (!Array.isArray(lvlArr)) return { level: lvlIdx, slots: [] };
      const slots: PreparedSlot[] = lvlArr
        .filter((slot) => slot?.Spell?.Blueprint)
        .map((slot): PreparedSlot => {
          const bpId: string = slot.Spell.Blueprint;
          const bp = blueprintMap.get(bpId);
          return {
            spellBlueprintId: bpId,
            spellName: bp?.name ?? bpId.slice(0, 8),
            available: slot.Available === true,
          };
        });
      return { level: lvlIdx, slots };
    })
    .filter((l) => l.slots.length > 0);

  // Slot info — derive from memorized slots count
  const slots: SlotInfo[] = memoRaw
    .map((lvlArr, lvlIdx): SlotInfo => {
      if (!Array.isArray(lvlArr) || lvlArr.length === 0) return { level: lvlIdx, total: 0, used: 0, remaining: 0 };
      const filled = lvlArr.filter((s) => s?.Spell?.Blueprint).length;
      const available = lvlArr.filter((s) => s?.Available === true).length;
      return {
        level: lvlIdx,
        total: filled,
        used: filled - available,
        remaining: available,
      };
    })
    .filter((s) => s.total > 0);

  return { blueprintId, type, casterLevel, knownSpells, preparedSpells, slots };
}

// ─── Equipment ───────────────────────────────────────────────────────────────────────────

// The Body descriptor has named slot fields.
// Equipped slots have an item object (with m_Blueprint); empty slots have only $id.
// Weapons are in m_HandsEquipmentSets[currentIndex].PrimaryHand / SecondaryHand.

const BODY_SLOTS: Record<string, string> = {
  Armor: "Armor", Belt: "Belt", Head: "Head", Feet: "Feet",
  Gloves: "Gloves", Neck: "Neck", Ring1: "Ring 1", Ring2: "Ring 2",
  Wrist: "Wrist", Shoulders: "Shoulders", Shirt: "Shirt", Glasses: "Glasses",
};

function getItemBlueprint(slot: any): string | null {
  if (!slot || slot["$ref"]) return null; // $ref = slot is populated but we need to resolve
  return slot.m_Blueprint ?? null;
}

// Collect blueprints from Body for prefetch — walk the Body object for m_Blueprint fields
function collectBodyItemGuids(body: any, out: Set<string>) {
  if (!body || typeof body !== "object") return;
  // Recurse into all values
  function walk(obj: any) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    if (obj["$ref"]) return; // don't recurse into refs
    if (obj.m_Blueprint) out.add(obj.m_Blueprint);
    for (const v of Object.values(obj)) walk(v);
  }
  walk(body);
}

function resolveSlotItem(slot: any): { blueprint: string; identified: boolean; type: string } | null {
  if (!slot || typeof slot !== "object") return null;
  // $ref means the slot points to an item defined elsewhere — we can't resolve it easily
  // but the item should also have appeared as a direct child in the Body tree already
  if (slot["$ref"]) return null; // will be handled via Facts/m_HandsEquipmentSets
  if (!slot.m_Blueprint) return null;
  const rawType: string = slot["$type"] ?? "";
  let itemType = "Equipment";
  if (rawType.includes("Weapon")) itemType = "Weapon";
  else if (rawType.includes("Shield")) itemType = "Shield";
  else if (rawType.includes("Armor")) itemType = "Armor";
  return { blueprint: slot.m_Blueprint, identified: slot.IsIdentified !== false, type: itemType };
}

function parseEquipment(
  body: any,
  facts: any, // not used currently, reserved
  blueprintMap: Map<string, any>
): EquipmentItem[] {
  if (!body) return [];
  const items: EquipmentItem[] = [];

  function addItem(slot: string, obj: any) {
    const resolved = resolveSlotItem(obj);
    if (!resolved) return;
    const bp = blueprintMap.get(resolved.blueprint);
    const name = bp?.name ?? resolved.blueprint.slice(0, 8);
    if (name === resolved.blueprint.slice(0, 8) && !bp) return; // skip unresolved
    items.push({
      slot,
      blueprintId: resolved.blueprint,
      name: humanize(name),
      itemType: resolved.type,
      isIdentified: resolved.identified,
    });
  }

  // Named armor/accessory slots
  for (const [key, label] of Object.entries(BODY_SLOTS)) {
    addItem(label, body[key]);
  }

  // Weapon sets
  const setIdx: number = body.m_CurrentHandsEquipmentSetIndex ?? 0;
  const sets: any[] = body.m_HandsEquipmentSets ?? [];
  const activeSet = sets[setIdx];
  if (activeSet) {
    addItem("Main Hand", activeSet.PrimaryHand);
    addItem("Off Hand", activeSet.SecondaryHand);
  }

  return items;
}

// ─── Stats ──────────────────────────────────────────────────────────────────────────────

const SKILL_LABEL: Record<string, string> = {
  SkillMobility: "Mobility",       SkillAthletics: "Athletics",
  SkillPerception: "Perception",   SkillThievery: "Thievery",
  SkillPersuasion: "Persuasion",   SkillStealth: "Stealth",
  SkillUseMagicDevice: "Use Magic Device",
  SkillKnowledgeArcana: "Knowledge (Arcana)",
  SkillKnowledgeWorld: "Knowledge (World)",
  SkillLoreNature: "Lore (Nature)",
  SkillLoreReligion: "Lore (Religion)",
  CheckBluff: "Bluff", CheckDiplomacy: "Diplomacy", CheckIntimidate: "Intimidate",
};

function parseStats(s: any, damage: number): CharacterStats | undefined {
  if (!s) return undefined;

  // Stats.SkillXxx fields are JSON.NET $ref back-references — not directly readable.
  // The real data lives in each ability score's m_Dependents array.
  // Build a Type -> PermanentValue map by traversing all dependents.
  const typeMap: Record<string, number> = {};

  function scanDependents(deps: any[]) {
    if (!Array.isArray(deps)) return;
    for (const dep of deps) {
      if (!dep || typeof dep !== "object" || dep["$ref"]) continue;
      if (dep.Type && dep.PermanentValue !== undefined) {
        typeMap[dep.Type] = dep.PermanentValue;
      }
      // Recurse for nested dependents (e.g. Persuasion has sub-checks)
      if (dep.m_Dependents) scanDependents(dep.m_Dependents);
    }
  }

  const ABILITY_KEYS = ["Strength","Dexterity","Constitution","Intelligence","Wisdom","Charisma"];
  const scores: Record<string, number> = {};
  for (const key of ABILITY_KEYS) {
    const stat = s[key];
    if (!stat || stat["$ref"]) continue;
    scores[key] = stat.PermanentValue ?? stat.m_BaseValue ?? 10;
    scanDependents(stat.m_Dependents ?? []);
  }

  // Inline stats (not $refs): BAB, Speed, BonusCasterLevel, etc.
  for (const key of Object.keys(s)) {
    const stat = s[key];
    if (!stat || typeof stat !== "object" || stat["$ref"]) continue;
    if (stat.Type && stat.PermanentValue !== undefined && !typeMap[stat.Type]) {
      typeMap[stat.Type] = stat.PermanentValue;
    }
  }

  const strScore = scores["Strength"] ?? 10;
  const dexScore = scores["Dexterity"] ?? 10;
  const strMod = Math.floor((strScore - 10) / 2);
  const dexMod = Math.floor((dexScore - 10) / 2);
  const hpMax = typeMap["HitPoints"] ?? 0;
  const bab   = typeMap["BaseAttackBonus"] ?? 0;

  const skills: Record<string, number> = {};
  for (const [type, label] of Object.entries(SKILL_LABEL)) {
    if (typeMap[type] !== undefined) skills[label] = typeMap[type];
  }

  return {
    str: strScore, dex: dexScore,
    con: scores["Constitution"] ?? 10,
    int: scores["Intelligence"] ?? 10,
    wis: scores["Wisdom"] ?? 10,
    cha: scores["Charisma"] ?? 10,
    hpMax,
    hp: hpMax - (damage ?? 0),
    ac: typeMap["AC"] ?? 0,
    bab,
    initiative: typeMap["Initiative"] ?? dexMod,
    speed: typeMap["Speed"] ?? 30,
    fortSave: typeMap["SaveFortitude"] ?? 0,
    reflexSave: typeMap["SaveReflex"] ?? 0,
    willSave: typeMap["SaveWill"] ?? 0,
    cmb: bab + strMod,
    cmd: 10 + bab + strMod + dexMod,
    skills,
  };
}

// ─── Traits (Facts) ─────────────────────────────────────────────────────────────────────

// Noise to skip — internal/mechanical/system features
const TRAIT_NOISE = [
  "Mechanics","Calculate","HiddenFeature","Progression","Impatience","StormBuff",
  "Baphomet","InspiredRage","Difficulty","FightDefensively","SkillAbilities",
  "TouchCalculate","RayCalculate","AngelMinor","BasicFeat","BackgroundsBase",
  "DeitySelection","Selection",
];

function humanize(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/Feature$/, "").replace(/Progression$/, "")
    .replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function parseTraits(
  facts: any[],
  blueprintMap: Map<string, any>,
  ctx: { raceName?: string; className?: string; archetypeName?: string }
): TraitEntry[] {
  const seen = new Set<string>();
  const results: TraitEntry[] = [];

  for (const fact of facts) {
    if (!fact?.["$type"]?.includes("Feature")) continue;
    const guid: string = fact.Blueprint ?? "";
    if (!guid || seen.has(guid)) continue;
    seen.add(guid);

    const bp = blueprintMap.get(guid);
    if (!bp?.name) continue;
    const name: string = bp.name;

    // Skip noise
    if (TRAIT_NOISE.some((n) => name.includes(n))) continue;
    if (bp.type !== "BlueprintFeature") continue;

    // Categorize by name patterns
    let category: TraitEntry["category"] = "class";
    const raceName = ctx.raceName ?? "";
    if (raceName && name.toLowerCase().includes(raceName.toLowerCase())) {
      category = "racial";
    } else if (/background|acolyte|outlander|noble|scholar|criminal|sage/i.test(name)) {
      category = "background";
    } else if (ctx.archetypeName && name.toLowerCase().includes(
      ctx.archetypeName.replace(/\s/g, "").toLowerCase().slice(0, 8)
    )) {
      category = "class";
    }

    results.push({ guid, name, displayName: humanize(name), category });
  }

  return results.sort((a, b) => {
    const order = { racial: 0, background: 1, class: 2, other: 3 };
    return (order[a.category] - order[b.category]) || a.displayName.localeCompare(b.displayName);
  });
}

// ─── Alignment ────────────────────────────────────────────────────────────────────────────

function parseAlignment(a: any): string {
  if (!a?.m_Vector) return "";
  const [xStr, yStr] = String(a.m_Vector).split("|");
  const x = parseInt(xStr), y = parseInt(yStr);
  const law  = x <= -17 ? "Lawful" : x >= 17 ? "Chaotic" : "Neutral";
  const good = y >=  17 ? "Good"   : y <= -17 ? "Evil"    : "Neutral";
  return law === "Neutral" && good === "Neutral" ? "True Neutral" : `${law} ${good}`.trim();
}

// ─── Feats + Identity ───────────────────────────────────────────────────────────────────

// Blueprint name patterns that identify background or deity selections
const BG_PATTERN = /Background/i;
const DEITY_PATTERN = /Feature$|Deity/i;
const DEITY_NAMES = ["Erastil","Iomedae","Desna","Sarenrae","Abadar","Shelyn","Irori",
  "Torag","Gorum","Asmodeus","Lamashtu","Zon-Kuthon","Rovagug","Urgathoa",
  "Norgorber","Pharasma","Nethys","Cayden","Calistria","Gozreh","Milani","Kyonin"];

// Known noise to skip from feat list
const SKIP_PATTERNS = /^(BasicFeatSelection|Backgrounds|SpellSpecialization|SelectionEntry|FeatureList)/;

function parseFeatsAndIdentity(
  selections: any[],
  blueprintMap: Map<string, any>
): { feats: FeatEntry[]; background?: string; deity?: string } {
  const featGuids = new Map<string, number>();
  for (const sel of selections) {
    const byLevel = sel.Value?.m_SelectionsByLevel ?? {};
    for (const [lvl, guid] of Object.entries(byLevel)) {
      if (typeof guid === "string" && guid && !featGuids.has(guid)) {
        featGuids.set(guid, parseInt(lvl));
      }
    }
  }

  const feats: FeatEntry[] = [];
  let background: string | undefined;
  let deity: string | undefined;

  for (const [guid, level] of featGuids) {
    const bp = blueprintMap.get(guid);
    if (!bp?.name) continue;
    const name: string = bp.name;

    // Extract background
    if (BG_PATTERN.test(name) && !name.includes("Selection")) {
      background = name.replace(/^Background/, "").replace(/([A-Z])/g, " $1").trim();
      continue;
    }
    // Extract deity
    if (DEITY_NAMES.some((d) => name.includes(d))) {
      deity = DEITY_NAMES.find((d) => name.includes(d));
      continue;
    }
    // Skip UI/internal selection containers
    if (SKIP_PATTERNS.test(name)) continue;
    // Skip non-feature types
    if (bp.type && !bp.type.includes("Feature") && !bp.type.includes("Ability")) continue;

    feats.push({ guid, name, level });
  }

  return {
    feats: feats.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    background,
    deity,
  };
}

// ─── Spell resolution ──────────────────────────────────────────────────────────────────

function resolveSpellEntry(
  bpId: string,
  lvlIdx: number,
  blueprintMap: Map<string, any>
): SpellEntry {
  const bp = blueprintMap.get(bpId);
  return {
    blueprintId: bpId,
    name: bp?.name ?? bpId.slice(0, 8),
    displayName: bp?.displayName ?? "",
    spellLevel: bp?.spellLevel ?? lvlIdx,
    isSpell: bp?.isSpell ?? true,
    isBuff: bp?.isBuff ?? false,
    isCantrip: bp?.isCantrip ?? lvlIdx === 0,
  };
}
