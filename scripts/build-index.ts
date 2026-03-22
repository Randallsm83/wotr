#!/usr/bin/env bun
/**
 * One-time blueprint indexer.
 * Streams blueprints.zip (252K .jbp files) and mod .jbp files,
 * extracts AssetId / type / name metadata, writes to data/blueprints.db.
 *
 * Run: bun run index
 */

import { Database } from "bun:sqlite";
import { unzipSync } from "fflate";
import path from "path";
import fs from "fs";

// ─── Paths ────────────────────────────────────────────────────────────────────

const GAME_DIR =
  process.env.WOTR_GAME_DIR ??
  "A:\\SteamGames\\steamapps\\common\\Pathfinder Second Adventure";
const BLUEPRINTS_ZIP = path.join(GAME_DIR, "blueprints.zip");
const MODS_DIR = path.join(GAME_DIR, "Mods");
const DB_PATH = path.join(import.meta.dir, "../data/blueprints.db");

// ─── Blueprint type helpers ───────────────────────────────────────────────────

// Known type-string fragments → short name
const TYPE_MAP: Record<string, string> = {
  BlueprintAbility:           "BlueprintAbility",
  BlueprintBuff:              "BlueprintBuff",
  BlueprintCharacterClass:    "BlueprintCharacterClass",
  BlueprintArchetype:         "BlueprintArchetype",
  BlueprintSpellbook:         "BlueprintSpellbook",
  BlueprintSpellList:         "BlueprintSpellList",
  BlueprintFeature:           "BlueprintFeature",
  BlueprintRace:              "BlueprintRace",
  BlueprintItem:              "BlueprintItem",
  BlueprintEquipment:         "BlueprintEquipment",
  BlueprintUnit:              "BlueprintUnit",
  BlueprintFact:              "BlueprintFact",
};

function resolveType(raw: string): string {
  for (const [key, val] of Object.entries(TYPE_MAP)) {
    if (raw.includes(key)) return val;
  }
  // Extract the class name after the last comma/space
  const m = raw.match(/,\s*(\w+)\s*$/);
  return m ? m[1] : raw;
}

// Spell levels 0 = cantrip/orison
const CANTRIP_TYPE_HINTS = ["Cantrip", "Orison", "DivineZap", "UnholyZap", "MageLight"];
const BUFF_TYPE_NAMES = ["BlueprintBuff"];
const SPELL_TYPE_NAMES = ["BlueprintAbility"];

// Names that indicate a spell is a buff when combined with ability type
const BUFF_ABILITY_KEYWORDS = [
  "Bless", "Bane", "Haste", "Slow", "Prayer", "Heroism", "Inspire",
  "Shield", "Mage Armor", "MageArmor", "Protection", "Resist", "Resistance",
  "Aid", "Blur", "Mirror Image", "MirrorImage", "Displacement", "Stoneskin",
  "Bull", "Bear", "Cat", "Eagle", "Fox", "Owl",
  "Freedom", "Haste", "Barkskin", "Magic Weapon", "MagicWeapon",
  "Divine Favor", "DivineFavor", "Divine Power", "DivinePower",
  "Holy Aura", "HolyAura", "Guidance", "Virtue", "Bless",
  "Remove Fear", "RemoveFear", "Unbreakable Heart", "UnbreakableHeart",
  "Good Hope", "GoodHope", "Heroism", "Communal",
];

function isBuff(name: string, type: string): boolean {
  if (BUFF_TYPE_NAMES.includes(type)) return true;
  if (type === "BlueprintAbility") {
    const n = name.toLowerCase();
    return BUFF_ABILITY_KEYWORDS.some((k) => n.includes(k.toLowerCase()));
  }
  return false;
}

function isSpell(type: string): boolean {
  return SPELL_TYPE_NAMES.includes(type);
}

function isCantrip(name: string, level: number): boolean {
  if (level === 0) return true;
  return CANTRIP_TYPE_HINTS.some((h) => name.includes(h));
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

function openDb(): Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA synchronous=NORMAL");
  db.run(`
    CREATE TABLE IF NOT EXISTS blueprints (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      spell_level  INTEGER NOT NULL DEFAULT -1,
      is_spell     INTEGER NOT NULL DEFAULT 0,
      is_buff      INTEGER NOT NULL DEFAULT 0,
      is_cantrip   INTEGER NOT NULL DEFAULT 0,
      source       TEXT NOT NULL DEFAULT 'base',
      mod_id       TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_name ON blueprints(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_type ON blueprints(type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_is_spell ON blueprints(is_spell)`);
  return db;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

interface ParsedEntry {
  id: string;
  name: string;
  type: string;
  spellLevel: number;
  source: "base" | "mod";
  modId?: string;
}

function parseJbp(content: string, fileName: string): ParsedEntry | null {
  // Fast path: find AssetId and $type without full JSON parse
  const idMatch = content.match(/"AssetId"\s*:\s*"([a-f0-9]{32})"/);
  if (!idMatch) return null;

  const typeMatch = content.match(/"[$]type"\s*:\s*"([^"]+)"/);
  const rawType = typeMatch ? typeMatch[1] : "";
  const type = resolveType(rawType);

  // Spell level: look for SpellLevel field
  const levelMatch = content.match(/"SpellLevel"\s*:\s*(\d+)/);
  const spellLevel = levelMatch ? parseInt(levelMatch[1]) : -1;

  const name = fileName.replace(/\.jbp$/i, "");

  return {
    id: idMatch[1],
    name,
    type,
    spellLevel,
    source: "base",
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("WotR Blueprint Indexer");
  console.log("======================");

  if (!fs.existsSync(BLUEPRINTS_ZIP)) {
    console.error(`blueprints.zip not found at: ${BLUEPRINTS_ZIP}`);
    process.exit(1);
  }

  const db = openDb();

  // Wipe existing data for a clean re-index
  db.run("DELETE FROM blueprints");

  const insert = db.prepare(`
    INSERT OR REPLACE INTO blueprints
      (id, name, type, display_name, spell_level, is_spell, is_buff, is_cantrip, source, mod_id)
    VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?)
  `);

  // ─── Phase 1: blueprints.zip ───────────────────────────────────────────────
  console.log(`\nPhase 1: Reading ${BLUEPRINTS_ZIP}...`);
  const zipData = fs.readFileSync(BLUEPRINTS_ZIP);
  console.log(`  Loaded ${(zipData.length / 1024 / 1024).toFixed(1)} MB`);

  console.log("  Decompressing... (this takes ~30s)");
  const files = unzipSync(zipData);
  const entries = Object.entries(files);
  console.log(`  Got ${entries.length} entries`);

  let inserted = 0;
  let skipped = 0;

  const insertMany = db.transaction((batch: ParsedEntry[]) => {
    for (const e of batch) {
      const spell = isSpell(e.type) ? 1 : 0;
      const buff  = isBuff(e.name, e.type) ? 1 : 0;
      const cantrip = isCantrip(e.name, e.spellLevel) ? 1 : 0;
      insert.run(e.id, e.name, e.type, e.spellLevel, spell, buff, cantrip, e.source, e.modId ?? null);
    }
  });

  const BATCH = 5000;
  let batch: ParsedEntry[] = [];

  for (const [fileName, data] of entries) {
    if (!fileName.endsWith(".jbp")) { skipped++; continue; }
    const content = new TextDecoder().decode(data);
    const parsed = parseJbp(content, path.basename(fileName));
    if (!parsed) { skipped++; continue; }
    batch.push(parsed);
    if (batch.length >= BATCH) {
      insertMany(batch);
      inserted += batch.length;
      batch = [];
      process.stdout.write(`\r  Indexed ${inserted.toLocaleString()} / ${entries.length.toLocaleString()}...`);
    }
  }
  if (batch.length > 0) {
    insertMany(batch);
    inserted += batch.length;
  }
  console.log(`\n  Base game: ${inserted.toLocaleString()} blueprints indexed, ${skipped} skipped`);

  // ─── Phase 2: Mod blueprints ───────────────────────────────────────────────
  if (fs.existsSync(MODS_DIR)) {
    console.log(`\nPhase 2: Scanning mods at ${MODS_DIR}...`);
    const modDirs = fs.readdirSync(MODS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    let modTotal = 0;
    for (const modId of modDirs) {
      const modPath = path.join(MODS_DIR, modId);
      const jbpFiles = findJbpFiles(modPath);
      if (jbpFiles.length === 0) continue;

      const modBatch: ParsedEntry[] = [];
      for (const filePath of jbpFiles) {
        const content = fs.readFileSync(filePath, "utf8");
        const parsed = parseJbp(content, path.basename(filePath));
        if (!parsed) continue;
        parsed.source = "mod";
        parsed.modId = modId;
        modBatch.push(parsed);
      }
      if (modBatch.length > 0) {
        insertMany(modBatch);
        modTotal += modBatch.length;
        console.log(`  ${modId}: ${modBatch.length} blueprints`);
      }
    }
    console.log(`  Mods total: ${modTotal} blueprints`);
  } else {
    console.log("\nPhase 2: Mods directory not found, skipping");
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  const stats = db
    .query(`SELECT COUNT(*) as total, SUM(is_spell) as spells, SUM(is_buff) as buffs FROM blueprints`)
    .get() as { total: number; spells: number; buffs: number };

  console.log("\n✓ Index complete");
  console.log(`  Total:  ${stats.total.toLocaleString()}`);
  console.log(`  Spells: ${stats.spells?.toLocaleString() ?? 0}`);
  console.log(`  Buffs:  ${stats.buffs?.toLocaleString() ?? 0}`);
  console.log(`  DB:     ${DB_PATH}`);

  db.close();
}

function findJbpFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findJbpFiles(full));
      else if (entry.name.endsWith(".jbp")) results.push(full);
    }
  } catch { /* skip unreadable */ }
  return results;
}

main().catch(console.error);
