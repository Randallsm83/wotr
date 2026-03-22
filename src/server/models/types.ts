// ─── Blueprint ───────────────────────────────────────────────────────────────

export interface Blueprint {
  id: string;
  name: string;           // file name e.g. "BlessCast"
  type: string;           // e.g. "BlueprintAbility", "BlueprintBuff", "BlueprintCharacterClass"
  displayName: string;    // localised name if resolved, else ""
  spellLevel: number;     // -1 if not a spell
  isSpell: boolean;
  isBuff: boolean;
  isCantrip: boolean;
  source: "base" | "mod"; // base game or a mod
  modId?: string;
}

// ─── Save / Party ─────────────────────────────────────────────────────────────

export interface SaveMeta {
  name: string;
  area: string;
  playerCharacterName: string;
  saveTime: string;
  gameTotalTime: string;
  mods: ModEntry[];
}

export interface ModEntry {
  id: string;
  version: string;
  modType: string;
}

export interface PartyData {
  meta: SaveMeta;
  characters: CharacterData[];
}

export interface CharacterData {
  uniqueId: string;
  name: string;
  blueprint: string;
  isPlayerCharacter: boolean;
  gender?: string;
  race?: string;
  alignment?: string;
  background?: string;
  deity?: string;
  class?: ClassInfo;
  stats?: CharacterStats;
  feats?: FeatEntry[];
  traits?: TraitEntry[];
  equipment?: EquipmentItem[];
  spellbook?: SpellbookData;
}

export interface CharacterStats {
  // Ability scores (raw values, e.g. 17)
  str: number; dex: number; con: number;
  int: number; wis: number; cha: number;
  // Derived (already computed modifiers)
  hp: number; hpMax: number;
  ac: number;
  bab: number;
  initiative: number;
  speed: number;
  fortSave: number; reflexSave: number; willSave: number;
  cmb: number; cmd: number;
  skills: Record<string, number>; // skill name -> total modifier
}

export interface FeatEntry {
  guid: string;
  name: string;
  level: number; // level at which it was selected
}

export interface EquipmentItem {
  slot: string;          // "MainHand", "Armor", "Ring1", etc.
  blueprintId: string;
  name: string;          // resolved blueprint name
  itemType: string;      // "Weapon", "Armor", "Shield", "Equipment"
  isIdentified: boolean;
}

export interface TraitEntry {
  guid: string;
  name: string;          // blueprint name
  displayName: string;   // cleaned for display
  category: "racial" | "class" | "background" | "other";
}

export interface ClassInfo {
  classId: string;
  className: string;
  archetypeId?: string;
  archetypeName?: string;
  level: number;
}

export interface SpellbookData {
  blueprintId: string;
  type: "Normal" | "Spontaneous" | string;
  casterLevel: number;
  knownSpells: SpellsByLevel;     // all spells the character can prepare/knows
  preparedSpells: PreparedLevel[]; // what's memorized today
  slots: SlotInfo[];              // slot counts per level
}

export type SpellsByLevel = SpellEntry[][];  // index = spell level 0-10

export interface SpellEntry {
  blueprintId: string;
  name: string;
  displayName: string;
  spellLevel: number;
  isSpell: boolean;
  isBuff: boolean;
  isCantrip: boolean;
}

export interface PreparedLevel {
  level: number;
  slots: PreparedSlot[];
}

export interface PreparedSlot {
  spellBlueprintId: string;
  spellName: string;
  available: boolean;
}

export interface SlotInfo {
  level: number;
  total: number;
  used: number;
  remaining: number;
}

// ─── Party Analysis ───────────────────────────────────────────────────────────

export interface PartyAnalysis {
  characters: CharacterAnalysis[];
  party: PartyInsights;
}

export interface CharacterAnalysis {
  characterId: string;
  characterName: string;
  availableBuffs: SpellEntry[];
  availableHeals: SpellEntry[];
  availableCC: SpellEntry[];
  availableDamage: SpellEntry[];
  notPreparedBuffs: SpellEntry[];  // known but not prepared
  slotsRemaining: SlotInfo[];
  prepSuggestions: string[];
}

export interface PartyInsights {
  hasAoeBuff: boolean;
  hasProtectionFromEvil: boolean;
  hasMagicWeapon: boolean;
  hasGroupHeal: boolean;
  hasCC: boolean;
  hasSummon: boolean;
  missingCoverage: string[];
  tips: string[];
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  partyContext?: PartyData;
}
