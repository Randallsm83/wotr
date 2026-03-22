import { Database } from "bun:sqlite";
import path from "path";
import type { Blueprint } from "../models/types.ts";

const DB_PATH = path.join(import.meta.dir, "../../../data/blueprints.db");

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
    _db.run("PRAGMA journal_mode=WAL");
    _db.run("PRAGMA cache_size=-32000"); // 32MB cache
  }
  return _db;
}

export function isIndexed(): boolean {
  try {
    const db = getDb();
    const row = db.query("SELECT COUNT(*) as c FROM blueprints").get() as { c: number };
    return row.c > 0;
  } catch {
    return false;
  }
}

export function lookupBlueprint(id: string): Blueprint | null {
  try {
    const db = getDb();
    const row = db
      .query(
        `SELECT id, name, type, display_name, spell_level, is_spell, is_buff, is_cantrip, source, mod_id
         FROM blueprints WHERE id = ?`
      )
      .get(id) as RawRow | null;
    return row ? rowToBlueprint(row) : null;
  } catch {
    return null;
  }
}

export function lookupBlueprintsMany(ids: string[]): Map<string, Blueprint> {
  if (ids.length === 0) return new Map();
  try {
    const db = getDb();
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .query(
        `SELECT id, name, type, display_name, spell_level, is_spell, is_buff, is_cantrip, source, mod_id
         FROM blueprints WHERE id IN (${placeholders})`
      )
      .all(...ids) as RawRow[];
    return new Map(rows.map((r) => [r.id, rowToBlueprint(r)]));
  } catch {
    return new Map();
  }
}

export function searchBlueprintsByName(query: string, limit = 20): Blueprint[] {
  try {
    const db = getDb();
    const rows = db
      .query(
        `SELECT id, name, type, display_name, spell_level, is_spell, is_buff, is_cantrip, source, mod_id
         FROM blueprints WHERE name LIKE ? OR display_name LIKE ? LIMIT ?`
      )
      .all(`%${query}%`, `%${query}%`, limit) as RawRow[];
    return rows.map(rowToBlueprint);
  } catch {
    return [];
  }
}

export function getStats(): { total: number; spells: number; buffs: number } {
  try {
    const db = getDb();
    const row = db
      .query(
        `SELECT COUNT(*) as total,
                SUM(is_spell) as spells,
                SUM(is_buff) as buffs
         FROM blueprints`
      )
      .get() as { total: number; spells: number; buffs: number };
    return row;
  } catch {
    return { total: 0, spells: 0, buffs: 0 };
  }
}

// ─── internals ────────────────────────────────────────────────────────────────

interface RawRow {
  id: string;
  name: string;
  type: string;
  display_name: string;
  spell_level: number;
  is_spell: number;
  is_buff: number;
  is_cantrip: number;
  source: string;
  mod_id: string | null;
}

function rowToBlueprint(r: RawRow): Blueprint {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    displayName: r.display_name,
    spellLevel: r.spell_level,
    isSpell: r.is_spell === 1,
    isBuff: r.is_buff === 1,
    isCantrip: r.is_cantrip === 1,
    source: r.source as "base" | "mod",
    modId: r.mod_id ?? undefined,
  };
}
