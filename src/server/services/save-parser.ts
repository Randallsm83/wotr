import { unzipSync } from "fflate";
import fs from "fs";
import path from "path";
import { lookupBlueprintsMany } from "./blueprint-db.ts";
import type {
  PartyData, SaveMeta, CharacterData, ClassInfo,
  SpellbookData, SpellEntry, PreparedLevel, PreparedSlot, SlotInfo,
  CharacterStats, FeatEntry, TraitEntry, EquipmentItem, InventoryItem,
} from "../models/types.ts";

const SAVES_DIR =
  process.env.WOTR_SAVES_DIR ??
  path.join(
    process.env.USERPROFILE ?? "C:\\Users\\Default",
    "AppData\\LocalLow\\Owlcat Games\\Pathfinder Wrath Of The Righteous\\Saved Games"
  );

// ─── Mythic path detection ──────────────────────────────────────────────────────────

const MYTHIC_CLASS_MAP: Record<string, string> = {
  AeonMythicClass:         "Aeon",
  AngelMythicClass:        "Angel",
  AzataMythicClass:        "Azata",
  DemonMythicClass:        "Demon",
  DevilMythicClass:        "Devil",
  GoldenDragonClass:       "Gold Dragon",
  LegendClass:             "Legend",
  FakeLegendClass:         "Legend",
  LichMythicClass:         "Lich",
  SwarmThatWalksClass:     "Swarm-That-Walks",
  TricksterMythicClass:    "Trickster",
  MythicStartingClass:     "Mythic Hero",
  MythicCompanionClass:    "Mythic Companion",
  MonsterMythicClass:      "Monster",
};

// ─── Public API ───────────────────────────────────────────────────────────────────────

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
  const player  = readJson("player.json");
  if (!header || !party) return null;

  // PartyCharacters is the authoritative list of the 6 currently-active party members
  const activePartyIds = new Set<string>(
    Array.isArray(player?.PartyCharacters) ? player.PartyCharacters : []
  );

  const meta = parseMeta(header, modList);
  const characters = await parseParty(party, header, activePartyIds);
  return { meta, characters };
}

// ─── Meta ─────────────────────────────────────────────────────────────────────────────────

/** Extract a human-readable area name from the WotR save name.
 *  Save names look like: "Crusader's Camp -19 Neth (XI) 4715 -00:07:09"
 *  We take everything before the first " -\d" (the in-game date). */
function parseAreaName(saveName: string): string {
  const m = saveName.match(/^(.+?)\s+-\d/);
  return (m ? m[1] : saveName.split(" -")[0]).trim();
}

/** Heuristic act estimate based on known area fragments and average party level. */
function inferActLabel(areaName: string): string {
  const a = areaName.toLowerCase();
  if (/kenabres|grey garrison|blackwater|market|museum|tavern|shield maze/.test(a)) return "Act 1";
  if (/crusader|drezen|leper|greengates|alushinyrra|arendae|colyphyr|blackrock|chasm|valley|fortress|lost.?chapel/.test(a)) return "Act 2";
  if (/midnight fane|ivory|sanctum|abyssal|threshold|wintersun|riftgate/.test(a)) return "Act 3–5";
  if (/worldwound|currantglen|camp/.test(a)) return "Act 2"; // most common mid-game areas
  return "Unknown act";
}

/** Curated prep tips keyed by known area fragments. Returns generic tips as fallback. */
function areaPrep(areaName: string): string[] {
  const a = areaName.toLowerCase();

  if (/kenabres|grey garrison|shield maze/.test(a)) return [
    "Act 1: demons have DR/chaos. Law-aligned spells (Protection from Chaos) bypass it early.",
    "Grey Garrison boss Staunton Vhane hits hard — stack AC and use Ember Slumber to control adds.",
  ];
  if (/crusader|camp/.test(a)) return [
    "Act 2 hub: stock up on scrolls and potions at Defender's Heart merchants before each dungeon.",
    "Your mythic path choice is coming at the Crusade Council — Angel is the best fit for Kaede's Demonslayer build.",
    "Crusade management: rank up buildings periodically — the Recruiter and Trainer are the highest priority.",
  ];
  if (/lost.?chapel/.test(a)) return [
    "Lost Chapel: corrupted crusaders, undead, and demons — Seelah's Smite Evil and Holy weapon effects are highly effective here.",
    "Pre-buff before every room: Bless + Prayer + Resist Energy (Fire). The dungeon is linear with back-to-back encounters — stay topped up.",
    "Camellia handles traps (Thievery 20). Send her ahead of the party when moving through narrow corridors.",
  ];
  if (/currantglen|greengates|leper/.test(a)) return [
    "Act 2 open world: enemies here have DR/cold iron. Finnean (magic) bypasses it.",
    "Resist Energy (Fire) on Kaede and Sly before every demon fight — demons spam fire AoEs.",
    "Camellia: cast Barkskin on Kaede and Sly pre-combat. It's a 1-min duration; recast after each rest.",
  ];
  if (/drezen/.test(a)) return [
    "Drezen assault: Sosiel's Prayer + Bless + Divine Favor on frontliners before breaching walls.",
    "The Drezen commander has SR and immunities — Nenio's Haste and Glitterdust (reduces AC) are key.",
    "After clearing Drezen, the city becomes your base — visit the artifact crafter early.",
  ];

  // Generic Act 2+ tips
  return [
    "Act 2+: enemies have DR/cold iron and SR 12–18. Spell Penetration and magic weapons are essential.",
    "Nenio: cast Haste every single combat. It's the highest-value buff in the game.",
    "Camellia: Barkskin on Kaede + Sly before each fight. StinkingCloud on packs of enemies.",
    "Daeran: use swift-action Channel (Combat Healer revelation) to triage frontliners without pausing offense.",
  ];
}

function parseMeta(header: any, modList: any): SaveMeta {
  const saveName  = header.Name ?? "";
  const areaName  = parseAreaName(saveName);
  return {
    name: saveName,
    area: header.Area ?? "",
    playerCharacterName: header.PlayerCharacterName ?? "",
    saveTime: header.SystemSaveTime ?? "",
    gameTotalTime: header.GameTotalTime ?? "",
    mods: Array.isArray(modList)
      ? modList.map((m: any) => ({ id: m.Id, version: m.Version, modType: m.modType }))
      : [],
    areaName,
    actLabel: inferActLabel(areaName),
    areaTips: areaPrep(areaName),
  };
}

// ─── Party ────────────────────────────────────────────────────────────────────

async function parseParty(party: any, header: any, activePartyIds: Set<string>): Promise<CharacterData[]> {
  const rawEntities: any[] = party.m_EntityData ?? [];
  const pcName: string = header.PlayerCharacterName ?? "";

  // Build a single $id→object map from the ENTIRE party JSON so that
  // cross-entity $refs (e.g. companion weapon items defined outside the
  // companion entity subtree) resolve correctly.
  const globalIdMap = buildIdMap(party);
  const entities = rawEntities.map((e) =>
    e.Descriptor ? resolveRefsWithMap(e, globalIdMap) : e
  );

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
    // For archetype resolution for all classes (including multiclass)
    for (const cls of (prog?.Classes ?? [])) {
      if (cls.Archetypes) {
        for (const a of cls.Archetypes) if (a) allGuids.add(a);
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
  // Item blueprints — items live in Facts/inventory, not directly in Body slots
    collectEntityItemGuids(entity, allGuids);
    // Feat selection GUIDs — values may be a string or array of strings
    for (const sel of (desc.Progression?.m_Selections ?? [])) {
      const byLevel = sel.Value?.m_SelectionsByLevel ?? {};
      for (const guidOrArr of Object.values(byLevel)) {
        const guids = Array.isArray(guidOrArr) ? guidOrArr : [guidOrArr];
        for (const guid of guids) {
          if (typeof guid === "string" && guid) allGuids.add(guid);
        }
      }
    }
  }

  const blueprintMap = lookupBlueprintsMany([...allGuids]);

  return entities
    .filter((e) => e.Descriptor)
    .map((entity) => parseEntity(entity, pcName, blueprintMap, activePartyIds, globalIdMap));
}

// ─── JSON.NET $ref resolution ────────────────────────────────────────────────

/**
 * Walk any JSON tree collecting all objects that carry a "$id" property.
 * Call once on the full party JSON to get a global map, then pass it to
 * resolveRefsWithMap so cross-entity back-references resolve correctly.
 */
function buildIdMap(root: any): Map<string, any> {
  const map = new Map<string, any>();
  function collect(obj: any): void {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(collect); return; }
    if (obj["$id"]) map.set(obj["$id"], obj);
    for (const v of Object.values(obj)) collect(v);
  }
  collect(root);
  return map;
}

/**
 * Resolve every pure { "$ref": "N" } node in `root` using the provided
 * id→object map.  Returns a structurally-new tree (shallow-copy of each
 * non-ref object) with refs replaced by their originals.
 */
function resolveRefsWithMap(root: any, idMap: Map<string, any>): any {
  function resolve(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(resolve);
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === "$ref") {
      return idMap.get(obj["$ref"]) ?? obj;
    }
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = resolve(v);
    }
    return out;
  }
  return resolve(root);
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
  blueprintMap: Map<string, any>,
  activePartyIds: Set<string>,
  idMap: Map<string, any>
): CharacterData {
  const desc = entity.Descriptor;
  const blueprint: string = desc.Blueprint ?? "";
  const customName: string = desc.CustomName ?? "";
  const uniqueId: string = entity.UniqueId ?? "";

  // Resolve display name — strip internal suffixes from companion names
  const blueprintInfo = blueprintMap.get(blueprint);
  const rawName = customName || blueprintInfo?.name || blueprint.slice(0, 8);
  const name = cleanCharName(rawName);
  const isPC = !!customName || name === pcName;

  // Class info — separate mythic path entries from regular classes
  const prog = desc.Progression;
  let classInfo: ClassInfo | undefined;
  let allClasses: ClassInfo[] = [];
  let mythicPath: string | undefined;
  let mythicLevel: number | undefined;
  if (prog?.Classes) {
    for (const cls of (prog.Classes as any[])) {
      const classId: string = cls.CharacterClass ?? "";
      if (!classId) continue;
      const bpName: string = blueprintMap.get(classId)?.name ?? "";
      // Check for mythic path class
      const mythicName = MYTHIC_CLASS_MAP[bpName];
      if (mythicName) {
        mythicPath = mythicName;
        mythicLevel = cls.Level ?? 1;
        continue;
      }
      // Regular class — strip internal "Class"/"Archetype" suffixes
      const archetypeId = cls.Archetypes?.[0] ?? "";
      const rawArchName = archetypeId ? (blueprintMap.get(archetypeId)?.name ?? "") : "";
      allClasses.push({
        classId,
        className: cleanClassName(bpName) || classId.slice(0, 8),
        archetypeId: archetypeId || undefined,
        archetypeName: archetypeId ? (cleanClassName(rawArchName) || archetypeId.slice(0, 8)) : undefined,
        level: cls.Level ?? 1,
      });
    }
    // Primary class = highest level among regular classes
    classInfo = allClasses.sort((a, b) => b.level - a.level)[0];
  }

  // Identity
  const gender: string = desc.CustomGender ?? "";
  const raceId: string = desc.Progression?.m_Race ?? "";
  const race = raceId ? (blueprintMap.get(raceId)?.name?.replace(/Race$/, "") ?? "") : "";
  const alignment = parseAlignment(desc.Alignment);

  // Stats
  const stats = parseStats(desc.Stats, desc.m_Damage ?? 0, idMap);

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

  // Equipment from Body slots — resolve item refs from entity-wide item map
  const itemRefMap = buildItemRefMap(entity);
  const equipment = parseEquipment(desc.Body, blueprintMap, itemRefMap);

  // Empty key slots (so the UI can flag missing items)
  const equippedSlotSet = new Set(equipment.map(e => e.slot));
  const emptySlots = KEY_EQUIPMENT_SLOTS.filter(s => !equippedSlotSet.has(s));

  // Character's unequipped inventory
  const inventory = parseInventory(desc.Body, blueprintMap, itemRefMap);

  const inParty = activePartyIds.size === 0 || activePartyIds.has(uniqueId);

  return { uniqueId, name, blueprint, isPlayerCharacter: isPC, inParty, gender, race, alignment, background, deity,
    class: classInfo, allClasses, mythicPath, mythicLevel,
    stats, feats, traits, equipment, emptySlots, inventory, spellbook };
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
            spellName: bp?.displayName || humanize(bp?.name ?? "") || "Unknown Spell",
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

// Key slots every character should ideally have filled (in priority order)
const KEY_EQUIPMENT_SLOTS = ["Neck", "Ring 1", "Ring 2", "Shoulders", "Belt", "Gloves", "Head", "Wrist", "Armor", "Main Hand"];

// Blueprint type prefixes that represent real carry-able items
const ITEM_BLUEPRINT_TYPES = new Set([
  "BlueprintItemWeapon", "BlueprintItemArmor", "BlueprintItemEquipment",
  "BlueprintItemShield", "BlueprintItemUsable", "BlueprintItem",
]);

function bpIsItem(bpType: string): boolean {
  return [...ITEM_BLUEPRINT_TYPES].some(t => bpType.startsWith(t));
}

// ─── Equipment ───────────────────────────────────────────────────────────────────────────────────────

// The Body descriptor has named slot fields.
// Equipped slots have an item object (with m_Blueprint); empty slots have only $id.
// Weapons are in m_HandsEquipmentSets[currentIndex].PrimaryHand / SecondaryHand.

const BODY_SLOTS: Record<string, string> = {
  Armor: "Armor", Belt: "Belt", Head: "Head", Feet: "Feet",
  Gloves: "Gloves", Neck: "Neck", Ring1: "Ring 1", Ring2: "Ring 2",
  Wrist: "Wrist", Shoulders: "Shoulders", Shirt: "Shirt", Glasses: "Glasses",
};

/**
 * Walk the entire entity tree collecting all item objects.
 * Items are stored in Facts/inventory, not directly in Body slots.
 * Builds two maps:
 *   uniqueIdToBlueprint:  item UniqueId  → m_Blueprint GUID
 *   uniqueIdToMeta:       item UniqueId  → { identified, type }
 */
function buildItemRefMap(entity: any): Map<string, { blueprint: string; identified: boolean; type: string }> {
  const map = new Map<string, { blueprint: string; identified: boolean; type: string }>();
  function walk(obj: any): void {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    // An item entity has UniqueId + m_Blueprint
    if (obj.UniqueId && obj.m_Blueprint) {
      const rawType: string = obj["$type"] ?? "";
      let itemType = "Equipment";
      if (rawType.includes("Weapon"))    itemType = "Weapon";
      else if (rawType.includes("Shield"))    itemType = "Shield";
      else if (rawType.includes("Armor"))     itemType = "Armor";
      else if (rawType.includes("Usable"))    itemType = "Consumable";
      else if (rawType.includes("Simple"))    itemType = "Equipment"; // accessories/misc
      map.set(obj.UniqueId, {
        blueprint: obj.m_Blueprint,
        identified: obj.IsIdentified !== false,
        type: itemType,
      });
    }
    for (const v of Object.values(obj)) walk(v);
  }
  walk(entity);
  return map;
}

/** Collect all item blueprint GUIDs from an entire entity for DB prefetch */
function collectEntityItemGuids(entity: any, out: Set<string>): void {
  function walk(obj: any): void {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    if (obj.UniqueId && obj.m_Blueprint) out.add(obj.m_Blueprint);
    for (const v of Object.values(obj)) walk(v);
  }
  walk(entity);
}

/**
 * Resolve a Body slot object to its item info.
 * Slots are HandSlot/ItemSlot objects with m_ItemRef (a UniqueId string).
 * Falls back to checking m_Blueprint directly on the slot for simple cases.
 */
function resolveSlot(
  slot: any,
  itemRefMap: Map<string, { blueprint: string; identified: boolean; type: string }>
): { blueprint: string; identified: boolean; type: string } | null {
  if (!slot || typeof slot !== "object") return null;
  // Slot object may carry m_ItemRef (a UniqueId pointing to the actual item)
  if (slot.m_ItemRef) {
    const entry = itemRefMap.get(slot.m_ItemRef);
    if (entry) return entry;
  }
  // Fallback: direct m_Blueprint on the slot (some simple slots work this way)
  if (slot.m_Blueprint) {
    const rawType: string = slot["$type"] ?? "";
    let itemType = "Equipment";
    if (rawType.includes("Weapon")) itemType = "Weapon";
    else if (rawType.includes("Shield")) itemType = "Shield";
    else if (rawType.includes("Armor")) itemType = "Armor";
    return { blueprint: slot.m_Blueprint, identified: slot.IsIdentified !== false, type: itemType };
  }
  return null;
}

/** Collect UniqueIds referenced in Body slots (= currently equipped) */
function equippedUniqueIds(body: any): Set<string> {
  const ids = new Set<string>();
  if (!body) return ids;
  for (const key of Object.keys(BODY_SLOTS)) {
    const ref = body[key]?.m_ItemRef;
    if (ref) ids.add(ref);
  }
  const setIdx = body.m_CurrentHandsEquipmentSetIndex ?? 0;
  const activeSet = (body.m_HandsEquipmentSets ?? [])[setIdx];
  if (activeSet?.PrimaryHand?.m_ItemRef)   ids.add(activeSet.PrimaryHand.m_ItemRef);
  if (activeSet?.SecondaryHand?.m_ItemRef) ids.add(activeSet.SecondaryHand.m_ItemRef);
  return ids;
}

/**
 * Items in the entity that are NOT currently equipped.
 * We restrict to Consumables only (BlueprintItemUsable) because the entity tree
 * includes references to the shared party stash, making a full inventory count
 * unreliable and noisy. Consumables are the most actionable bag items.
 */
function parseInventory(
  body: any,
  blueprintMap: Map<string, any>,
  itemRefMap: Map<string, { blueprint: string; identified: boolean; type: string }>
): InventoryItem[] {
  const equipped = equippedUniqueIds(body);
  const items: InventoryItem[] = [];
  const seen = new Set<string>();
  for (const [uniqueId, { blueprint, identified, type }] of itemRefMap) {
    if (equipped.has(uniqueId)) continue;
    if (seen.has(blueprint)) continue;
    const bp = blueprintMap.get(blueprint);
    if (!bp?.name || !bp?.type) continue;
    // Only consumables (potions, scrolls, wands) — filter by itemRefMap type, not blueprint DB type
    if (type !== "Consumable") continue;
    seen.add(blueprint);
    items.push({
      blueprintId: blueprint,
      name: humanizeItem(bp.name),
      itemType: "Consumable",
      isIdentified: identified,
    });
  }
  return items;
}

function parseEquipment(
  body: any,
  blueprintMap: Map<string, any>,
  itemRefMap: Map<string, { blueprint: string; identified: boolean; type: string }>
): EquipmentItem[] {
  if (!body) return [];
  const items: EquipmentItem[] = [];

  function addItem(slotName: string, slotObj: any) {
    const resolved = resolveSlot(slotObj, itemRefMap);
    if (!resolved) return;
    const bp = blueprintMap.get(resolved.blueprint);
    const name = bp?.name ?? resolved.blueprint.slice(0, 8);
    if (!bp) return; // skip if blueprint not in DB
    items.push({
      slot: slotName,
      blueprintId: resolved.blueprint,
      name: humanizeItem(name),
      itemType: resolved.type,
      isIdentified: resolved.identified,
    });
  }

  // Named armor/accessory slots
  for (const [key, label] of Object.entries(BODY_SLOTS)) {
    addItem(label, body[key]);
  }

  // Weapon sets — use active hand set
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

function parseStats(s: any, damage: number, idMap?: Map<string, any>): CharacterStats | undefined {
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

  // AC: PermanentValue is always base 10; compute total from PersistentModifierList.
  // This captures DEX, Size, Armor bonuses. Natural armor / deflection from items
  // are applied via Facts components and are not in PersistentModifierList, so AC
  // will be a partial undercount — but correct enough to differentiate characters.
  const acObj = s.AC;
  const acTotal = (() => {
    if (!acObj || acObj["$ref"]) return typeMap["AC"] ?? 0;
    const base: number = acObj.m_BaseValue ?? 10;
    const mods: any[] = acObj.PersistentModifierList ?? [];
  return base + mods.reduce((sum: number, m: any) => {
      const resolved = (m && m["$ref"] && idMap) ? (idMap.get(m["$ref"]) ?? m) : m;
      if (!resolved || resolved["$ref"]) return sum;
      return sum + (resolved.ModValue ?? 0);
    }, 0);
  })();
  typeMap["AC"] = acTotal;

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
    .replace(/Feature$/, "").replace(/Progression$/, "").replace(/Cast$/, "")
    .replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/** Strip save-file internal suffixes from character/class/archetype names. */
function cleanCharName(name: string): string {
  return name.replace(/_Companion$/i, "").trim();
}

function cleanClassName(name: string): string {
  return name.replace(/Class$/, "").replace(/Archetype$/, "").trim();
}

/**
 * Equipment-specific display cleaner:
 *   "HeadbandOfCharisma2"      → "Headband of Charisma +2"
 *   "CryptRaidersArmorItem"    → "Crypt Raiders Armor"
 *   "FinneanScimitarStage1"    → "Finnean Scimitar +1"
 */
function humanizeItem(name: string): string {
  return humanize(name)
    .replace(/\s+Item$/i, "")                             // strip trailing "Item"
    .replace(/\s+Stage\s*(\d+)$/i, " +$1")               // "Stage1" → "+1"
    .replace(/\s+(\d+)$/, " +$1");                        // trailing digit → "+N"
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
    // Skip archetype permission flags — internal markers like "Fire Domain Allowed Separatist"
    if (/Allowed\s+\w+$/.test(name)) continue;

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
    for (const [lvl, guidOrArr] of Object.entries(byLevel)) {
      // m_SelectionsByLevel values may be a string or an array of strings
      const guids = Array.isArray(guidOrArr) ? guidOrArr : [guidOrArr];
      for (const guid of guids) {
        if (typeof guid === "string" && guid && !featGuids.has(guid)) {
          featGuids.set(guid, parseInt(lvl));
        }
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

    feats.push({ guid, name: humanize(name), level });
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
  const displayName = bp?.displayName || humanize(bp?.name ?? "") || "Unknown Spell";
  return {
    blueprintId: bpId,
    name: bp?.name ?? "unknown",
    displayName,
    spellLevel: bp?.spellLevel ?? lvlIdx,
    isSpell: bp?.isSpell ?? true,
    isBuff: bp?.isBuff ?? false,
    isCantrip: bp?.isCantrip ?? lvlIdx === 0,
  };
}
