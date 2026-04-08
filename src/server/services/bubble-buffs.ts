/**
 * Buff mod integration — supports both Buff It 2 the Limit (B2TL) and legacy BubbleBuffs.
 * Detects which mod is active from the save's mod list and reads the correct config file.
 *
 * B2TL:        Mods/BuffIt2TheLimit/UserSettings/bi2tl-{GameId}.json
 *              Groups stored as InGroups: string[] ("Quick", "Important", "Long")
 * BubbleBuffs: Mods/BubbleBuffs/UserSettings/bubblebuff-{GameId}.json
 *              Groups stored as InGroup: number (1=Short, 2=Normal, 3=Long)
 */

import fs from "fs";
import path from "path";
import { lookupBlueprintsMany } from "./blueprint-db.ts";

const GAME_DIR =
  process.env.WOTR_GAME_DIR ??
  "A:\\SteamGames\\steamapps\\common\\Pathfinder Second Adventure";

// ─── Mod detection ──────────────────────────────────────────────────────────────────────

type BuffMod = "BuffIt2TheLimit" | "BubbleBuffs";

/** Determine which buff mod is active from the save's mod list array. */
export function detectBuffMod(modList: { id: string }[]): BuffMod {
  const ids = modList.map(m => m.id);
  if (ids.includes("BuffIt2TheLimit")) return "BuffIt2TheLimit";
  return "BubbleBuffs";
}

/** Resolve the settings dir and file prefix for the active mod. */
function modPaths(mod: BuffMod): { dir: string; prefix: string } {
  if (mod === "BuffIt2TheLimit") {
    return {
      dir:    path.join(GAME_DIR, "Mods", "BuffIt2TheLimit", "UserSettings"),
      prefix: "bi2tl-",
    };
  }
  return {
    dir:    path.join(GAME_DIR, "Mods", "BubbleBuffs", "UserSettings"),
    prefix: "bubblebuff-",
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────────────────────

export interface BbConfiguredBuff {
  spellGuid:  string;  // normalized (no dashes) GUID
  spellName:  string;  // resolved from blueprint DB
  groupName:  string;  // group label as used in the mod ("Quick"/"Important"/"Long" or "Short"/"Normal"/"Long")
  blacklisted: boolean;
  wanted:     string[]; // character UniqueIds that should receive the buff
  casterIds:  string[]; // character UniqueIds that cast it
}

export interface BbConfig {
  gameId: string;
  mod: BuffMod;
  buffs: BbConfiguredBuff[];
  verboseCasting: boolean;
  allowInCombat: boolean;
  raw: any;
}

export interface BbAnalysis {
  configured: BbConfiguredBuff[];           // buffs already in BubbleBuffs
  notConfigured: { guid: string; name: string }[]; // available buffs not yet added
  blacklisted: BbConfiguredBuff[];
}

// ─── Reader ───────────────────────────────────────────────────────────────────

/** Normalize UUID-with-dashes → 32-char hex */
function normalizeGuid(g: string): string {
  return g.replace(/-/g, "").toLowerCase();
}

/** Read buff mod config for a given GameId. Detects mod from the provided mod list. */
export async function readBbConfig(
  gameId: string,
  modList?: { id: string }[]
): Promise<BbConfig | null> {
  const mod = modList ? detectBuffMod(modList) : "BubbleBuffs";
  const { dir, prefix } = modPaths(mod);
  const filePath = path.join(dir, `${prefix}${gameId}.json`);
  if (!fs.existsSync(filePath)) return null;

  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }

  const guidList: string[] = (raw.Buffs ?? []).map((b: any) =>
    normalizeGuid(b.Key?.Guid ?? "")
  );
  const blueprintMap = lookupBlueprintsMany(guidList.filter(Boolean));

  // B2TL uses InGroup (number): 0=Normal, 1=Quick, 2=Important, 3=Long
  // InGroups (string array) is a cached label written by older app versions — NOT read by the game.
  // BubbleBuffs uses InGroup: 1=Short, 2=Normal, 3=Long
  function resolveGroup(b: any): string {
    const n: number = b.Value?.InGroup ?? 0;
    if (mod === "BuffIt2TheLimit") {
      return n === 1 ? "Quick" : n === 2 ? "Important" : n === 3 ? "Long" : "Normal";
    }
    // BubbleBuffs: 1=Short, 2=Normal, 3=Long
    return n === 1 ? "Short" : n === 3 ? "Long" : "Normal";
  }

  const buffs: BbConfiguredBuff[] = (raw.Buffs ?? []).map((b: any) => {
    const guid = normalizeGuid(b.Key?.Guid ?? "");
    const bp   = blueprintMap.get(guid);
    return {
      spellGuid:  guid,
      spellName:  bp?.name ?? guid.slice(0, 8),
      groupName:  resolveGroup(b),
      blacklisted: b.Value?.Blacklisted ?? false,
      wanted:     b.Value?.Wanted ?? [],
      casterIds:  (b.Value?.Casters ?? []).map((c: any) => c.Key?.Name ?? ""),
    };
  });

  return { gameId, mod, buffs, verboseCasting: raw.VerboseCasting ?? false, allowInCombat: raw.AllowInCombat ?? false, raw };
}

/**
 * Given a list of available buff GUIDs (from party analysis) and the
 * BubbleBuffs config, return what's configured, what's missing, what's blacklisted.
 */
export function analyzeBbCoverage(
  availableBuffGuids: string[],
  config: BbConfig | null
): BbAnalysis {
  if (!config) {
    return {
      configured: [],
      notConfigured: availableBuffGuids.map((g) => ({ guid: g, name: g.slice(0, 8) })),
      blacklisted: [],
    };
  }

  const configuredGuids = new Set(config.buffs.map((b) => b.spellGuid));

  const configured = config.buffs.filter(
    (b) => !b.blacklisted && availableBuffGuids.includes(b.spellGuid)
  );
  const blacklisted = config.buffs.filter((b) => b.blacklisted);
  const notConfigured = availableBuffGuids
    .filter((g) => !configuredGuids.has(g))
    .map((g) => {
      const bp = null; // resolved by caller
      return { guid: g, name: g };
    });

  return { configured, notConfigured, blacklisted };
}

// ─── Writer ──────────────────────────────────────────────────────────────────

/** Convert a 32-char hex GUID (no dashes) to UUID format with dashes */
function formatGuid(hex: string): string {
  const h = hex.replace(/-/g, "").toLowerCase();
  if (h.length !== 32) return hex; // already formatted or invalid
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export interface AddBbBuffEntry {
  spellGuid:   string;  // 32-char hex (no dashes) blueprint ID
  groupName:   string;  // group name: "Quick"/"Important"/"Long" (B2TL) or "Short"/"Normal"/"Long" (BubbleBuffs)
  wantedIds:   string[]; // character UniqueIds to buff
  casterId:    string;  // casting character UniqueId
  spellbookId: string;  // spellbook blueprint GUID
  mod?:        BuffMod; // which mod to write to (auto-detected if omitted)
}

/** Append a new buff entry to the active buff mod config. */
export function addBbBuff(
  gameId: string,
  entry: AddBbBuffEntry
): { ok: true } | { ok: false; error: string } {
  const mod = entry.mod ?? "BubbleBuffs";
  const { dir, prefix } = modPaths(mod);
  const filePath = path.join(dir, `${prefix}${gameId}.json`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `Buff mod config not found: ${filePath}` };
  }

  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e: any) {
    return { ok: false, error: `Failed to parse config: ${e.message}` };
  }

  const buffs: any[] = raw.Buffs ?? [];
  const normalizedGuid = normalizeGuid(entry.spellGuid);

  // De-duplicate — don’t add if already present
  const alreadyExists = buffs.some(
    (b: any) => normalizeGuid(b?.Key?.Guid ?? "") === normalizedGuid
  );
  if (alreadyExists) return { ok: true }; // idempotent

  const casterEntry = entry.casterId ? [{
    Key: { Name: entry.casterId, Spellbook: formatGuid(entry.spellbookId) },
    Value: { Banned: false, Cap: -1, ShareTransmutation: false, PowerfulChange: false, ReservoirCLBuff: false, UseAzataZippyMagic: false },
  }] : [];

  if (mod === "BuffIt2TheLimit") {
    // B2TL numeric mapping: 0=Normal, 1=Quick, 2=Important, 3=Long
    const b2tlGroup: Record<string, number> = { Normal: 0, Quick: 1, Important: 2, Long: 3 };
    const inGroupNum = b2tlGroup[entry.groupName] ?? 0;
    buffs.push({
      Key:   { Guid: formatGuid(normalizedGuid), MetamagicMask: 0, Archmage: false },
      Value: {
        InGroup:    inGroupNum,
        InGroups:   [entry.groupName],  // keep for reference/compatibility
        Blacklisted: false,
        IgnoreForOverwriteCheck: null,
        Wanted:     entry.wantedIds,
        CasterPriority: null,
        Casters:    casterEntry,
        BaseSpell:  "00000000-0000-0000-0000-000000000000",
        SourcePriorityOverride: -1,
        UseSpells: true, UseScrolls: true, UsePotions: true, UseEquipment: true, UseExtendRod: false,
      },
    });
  } else {
    // BubbleBuffs legacy format
    const groupNum = entry.groupName === "Short" ? 1 : entry.groupName === "Long" ? 3 : 2;
    buffs.push({
      Key:   { Guid: formatGuid(normalizedGuid), MetamagicMask: 0, Archmage: false },
      Value: {
        InGroup:    groupNum,
        Blacklisted: false,
        IgnoreForOverwriteCheck: null,
        Wanted:     entry.wantedIds,
        CasterPriority: null,
        Casters:    casterEntry,
        BaseSpell:  "00000000-0000-0000-0000-000000000000",
      },
    });
  }

  raw.Buffs = buffs;

  try {
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf8");
  } catch (e: any) {
    return { ok: false, error: `Failed to write config: ${e.message}` };
  }

  return { ok: true };
}

/** groupLabel is no longer needed — group name is now read directly from the config.
 *  Kept as a no-op export to avoid breaking any stale imports. */
export function groupLabel(inGroup: number): string {
  return inGroup === 1 ? "Short" : inGroup === 3 ? "Long" : "Normal";
}

// ─── Batch regroup ───────────────────────────────────────────────────────────

/**
 * Reclassify all existing B2TL buffs from InGroup=0 (Normal) into the correct
 * Quick / Important / Long group based on spell name heuristics.
 * Writes the updated config back to disk.
 * Returns the number of buffs updated.
 */
export function regroupBuffs(
  gameId: string,
  modList: { id: string }[],
  /** groupName → InGroup number, e.g. {Quick:1, Important:2, Long:3, Normal:0} */
  groupMap: Record<string, number>,
  /** spell name (lowercase, letters only) → target group name */
  heuristic: (spellNameClean: string) => string
): { ok: true; updated: number; skipped: number } | { ok: false; error: string } {
  const mod = detectBuffMod(modList);
  if (mod !== "BuffIt2TheLimit") {
    return { ok: false, error: "regroupBuffs only supports Buff It 2 The Limit" };
  }

  const { dir, prefix } = modPaths(mod);
  const filePath = path.join(dir, `${prefix}${gameId}.json`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `B2TL config not found: ${filePath}` };
  }

  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e: any) {
    return { ok: false, error: `Failed to parse config: ${e.message}` };
  }

  const guidList: string[] = (raw.Buffs ?? []).map((b: any) =>
    normalizeGuid(b.Key?.Guid ?? "")
  );
  const blueprintMap = lookupBlueprintsMany(guidList.filter(Boolean));

  let updated = 0;
  let skipped = 0;

  for (const b of (raw.Buffs ?? []) as any[]) {
    const guid      = normalizeGuid(b.Key?.Guid ?? "");
    const bp        = blueprintMap.get(guid);
    const spellName = bp?.name ?? "";
    const clean     = spellName.toLowerCase().replace(/[^a-z]/g, "");
    const groupName = heuristic(clean);
    const inGroupNum = groupMap[groupName] ?? 0;

    if (b.Value?.InGroup !== inGroupNum) {
      b.Value.InGroup  = inGroupNum;
      b.Value.InGroups = [groupName];
      updated++;
    } else {
      skipped++;
    }
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf8");
  } catch (e: any) {
    return { ok: false, error: `Failed to write config: ${e.message}` };
  }

  return { ok: true, updated, skipped };
}
