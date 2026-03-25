import fs from "fs";
import path from "path";
import type { BuildProfile } from "../models/types.ts";

const STORE_PATH = path.join(import.meta.dir, "../../../data/builds.json");

type BuildMap = Record<string, BuildProfile>;

// ─── In-memory cache ──────────────────────────────────────────────────────────

let _cache: BuildMap | null = null;

function load(): BuildMap {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(STORE_PATH)) {
      _cache = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    } else {
      _cache = {};
    }
  } catch {
    _cache = {};
  }
  return _cache!;
}

function save(map: BuildMap) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(map, null, 2), "utf8");
  _cache = map;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getBuilds(): BuildProfile[] {
  return Object.values(load());
}

export function getBuild(characterId: string): BuildProfile | null {
  return load()[characterId] ?? null;
}

export function upsertBuild(profile: BuildProfile): BuildProfile {
  const map = load();
  map[profile.characterId] = { ...profile, updatedAt: new Date().toISOString() };
  save(map);
  return map[profile.characterId];
}

export function deleteBuild(characterId: string): boolean {
  const map = load();
  if (!map[characterId]) return false;
  delete map[characterId];
  save(map);
  return true;
}
