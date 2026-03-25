/**
 * BubbleBuffs mod integration.
 * Reads the per-game settings file at:
 *   {GAME_DIR}/Mods/BubbleBuffs/UserSettings/bubblebuff-{GameId}.json
 *
 * The GameId comes from header.json in the save file.
 */

import fs from "fs";
import path from "path";
import { lookupBlueprintsMany } from "./blueprint-db.ts";

const GAME_DIR =
  process.env.WOTR_GAME_DIR ??
  "A:\\SteamGames\\steamapps\\common\\Pathfinder Second Adventure";

const BB_SETTINGS_DIR = path.join(
  GAME_DIR,
  "Mods",
  "BubbleBuffs",
  "UserSettings"
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BbConfiguredBuff {
  spellGuid: string;       // normalized (no dashes) GUID
  spellName: string;       // resolved from blueprint DB
  inGroup: number;         // which buff group (1=short, 2=normal, 3=long typically)
  blacklisted: boolean;
  wanted: string[];        // character UniqueIds that should receive the buff
  casterIds: string[];     // character UniqueIds that cast it
}

export interface BbConfig {
  gameId: string;
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

/** Read BubbleBuffs config for a given GameId */
export async function readBbConfig(gameId: string): Promise<BbConfig | null> {
  const filePath = path.join(BB_SETTINGS_DIR, `bubblebuff-${gameId}.json`);
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

  const buffs: BbConfiguredBuff[] = (raw.Buffs ?? []).map((b: any) => {
    const guid = normalizeGuid(b.Key?.Guid ?? "");
    const bp = blueprintMap.get(guid);
    return {
      spellGuid: guid,
      spellName: bp?.name ?? guid.slice(0, 8),
      inGroup: b.Value?.InGroup ?? 0,
      blacklisted: b.Value?.Blacklisted ?? false,
      wanted: b.Value?.Wanted ?? [],
      casterIds: (b.Value?.Casters ?? []).map((c: any) => c.Key?.Name ?? ""),
    };
  });

  return {
    gameId,
    buffs,
    verboseCasting: raw.VerboseCasting ?? false,
    allowInCombat: raw.AllowInCombat ?? false,
    raw,
  };
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
  inGroup:     number;  // 1=Short, 2=Important, 3=Normal
  wantedIds:   string[]; // character UniqueIds to buff
  casterId:    string;  // casting character UniqueId (Name field in BubbleBuffs)
  spellbookId: string;  // spellbook blueprint GUID (with or without dashes)
}

/**
 * Append a new buff entry to the BubbleBuffs per-game config.
 * The game must NOT be running when this is called; BubbleBuffs will re-read
 * the file the next time it performs a buff pass.
 */
export function addBbBuff(
  gameId: string,
  entry: AddBbBuffEntry
): { ok: true } | { ok: false; error: string } {
  const filePath = `${BB_SETTINGS_DIR}\\bubblebuff-${gameId}.json`;
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `BubbleBuffs config not found: ${filePath}` };
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

  buffs.push({
    Key:   { Guid: formatGuid(normalizedGuid), MetamagicMask: 0, Archmage: false },
    Value: {
      InGroup:               entry.inGroup,
      Blacklisted:           false,
      IgnoreForOverwriteCheck: null,
      Wanted:                entry.wantedIds,
      CasterPriority:        null,
      Casters:               casterEntry,
      BaseSpell:             "00000000-0000-0000-0000-000000000000",
    },
  });

  raw.Buffs = buffs;

  try {
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf8");
  } catch (e: any) {
    return { ok: false, error: `Failed to write config: ${e.message}` };
  }

  return { ok: true };
}

/** Group name for display */
export function groupLabel(inGroup: number): string {
  switch (inGroup) {
    case 1: return "Short";
    case 2: return "Normal";
    case 3: return "Long";
    default: return `Group ${inGroup}`;
  }
}
