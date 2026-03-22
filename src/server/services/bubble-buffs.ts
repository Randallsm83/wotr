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

/** Group name for display */
export function groupLabel(inGroup: number): string {
  switch (inGroup) {
    case 1: return "Short";
    case 2: return "Normal";
    case 3: return "Long";
    default: return `Group ${inGroup}`;
  }
}
