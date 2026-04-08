import type {
  CharacterData, PartyData, BuildProfile,
  RoleScores, CharacterRoleProfile, PartyComposition,
} from "../models/types.ts";

// ─── Class → baseline role scores ─────────────────────────────────────────────
// Matched case-insensitively against className (blueprint name).

interface ClassBaseline {
  keywords: string[];
  scores: Partial<RoleScores>;
}

const CLASS_BASELINES: ClassBaseline[] = [
  { keywords: ["fighter"],                          scores: { frontline: 5, damage: 4, buffer: 1 } },
  { keywords: ["barbarian", "bloodrager"],          scores: { frontline: 4, damage: 5, healer: 0 } },
  { keywords: ["cavalier", "herald"],               scores: { frontline: 4, damage: 3, buffer: 3 } },
  { keywords: ["paladin"],                          scores: { frontline: 4, damage: 3, healer: 3, buffer: 2 } },
  { keywords: ["ranger"],                           scores: { damage: 4, frontline: 2, utility: 3 } },
  { keywords: ["slayer", "hunter"],                 scores: { damage: 4, frontline: 2, utility: 3 } },
  { keywords: ["rogue", "vivisectionist"],          scores: { damage: 4, utility: 4 } },
  { keywords: ["magus", "eldritch"],                scores: { damage: 5, frontline: 2, utility: 2 } },
  { keywords: ["cleric"],                           scores: { healer: 4, buffer: 4, control: 1, damage: 1 } },
  { keywords: ["oracle"],                           scores: { healer: 3, buffer: 4, control: 1, utility: 2 } },
  { keywords: ["shaman"],                           scores: { healer: 3, buffer: 3, control: 3, utility: 3 } },
  { keywords: ["druid"],                            scores: { healer: 2, buffer: 2, control: 3, utility: 4 } },
  { keywords: ["monk", "scaled fist"],              scores: { frontline: 3, utility: 2, damage: 2 } },
  { keywords: ["bard", "skald"],                    scores: { buffer: 5, utility: 3, healer: 2, control: 2 } },
  { keywords: ["inquisitor"],                       scores: { damage: 3, utility: 4, buffer: 2, frontline: 2 } },
  { keywords: ["wizard", "sorcerer", "arcanist"],   scores: { control: 4, damage: 3, utility: 3, buffer: 2 } },
  { keywords: ["witch"],                            scores: { control: 5, utility: 3, damage: 1, buffer: 2 } },
  { keywords: ["alchemist"],                        scores: { damage: 3, utility: 4, healer: 2, buffer: 2 } },
  { keywords: ["summoner"],                         scores: { utility: 5, control: 2, buffer: 2 } },
  { keywords: ["kineticist"],                       scores: { damage: 5, utility: 2, frontline: 2 } },
];

const DEFAULT_SCORES: RoleScores = { frontline: 1, damage: 2, healer: 0, buffer: 1, control: 1, utility: 2 };

function baselineFromClass(className: string): RoleScores {
  const cn = className.toLowerCase();
  for (const { keywords, scores } of CLASS_BASELINES) {
    if (keywords.some((k) => cn.includes(k))) {
      return { ...DEFAULT_SCORES, ...scores };
    }
  }
  return { ...DEFAULT_SCORES };
}

// ─── Signal helpers ───────────────────────────────────────────────────────────

function norm(s: string): string { return s.toLowerCase().replace(/[^a-z]/g, ""); }

function hasFeatKeyword(char: CharacterData, kw: string): boolean {
  return (char.feats ?? []).some((f) => norm(f.name).includes(norm(kw)));
}

function hasSpellKeyword(char: CharacterData, kw: string): boolean {
  const flat = char.spellbook?.knownSpells.flat() ?? [];
  return flat.some((s) => norm(s.name).includes(norm(kw)));
}

function hasEquipWeapon(char: CharacterData): boolean {
  return (char.equipment ?? []).some((e) => e.slot === "Main Hand" && e.itemType === "Weapon");
}

function mainHandName(char: CharacterData): string {
  return (char.equipment ?? []).find((e) => e.slot === "Main Hand")?.name?.toLowerCase() ?? "";
}

function isCasterClass(className: string): boolean {
  return /witch|wizard|sorcerer|oracle|shaman|druid|cleric|bard|arcanist/.test(className.toLowerCase());
}

function isRangedStyle(char: CharacterData): boolean {
  const weapon = mainHandName(char);
  return hasFeatKeyword(char, "pointblankshot")
    || hasFeatKeyword(char, "preciseshot")
    || hasFeatKeyword(char, "clusteredshots")
    || hasFeatKeyword(char, "deadlyaim")
    || /bow|crossbow|longbow|shortbow/.test(weapon);
}

function bounded(n: number, min = 0, max = 5): number {
  return Math.min(max, Math.max(min, n));
}

function roundScores(scores: RoleScores): RoleScores {
  return Object.fromEntries(
    (Object.entries(scores) as [keyof RoleScores, number][]).map(([k, v]) => [k, clamp(v)])
  ) as unknown as RoleScores;
}

function nudgeScore(scores: RoleScores, key: keyof RoleScores, amount: number, cap = 5) {
  scores[key] = bounded(scores[key] + amount, 0, cap);
}

function buildProfileWeight(char: CharacterData, role: BuildProfile["role"]): number {
  const cn = char.class?.className ?? "";
  if (role === "tank" && isRangedStyle(char)) return 0.35;
  if (role === "melee-dps" && isCasterClass(cn)) return 0.35;
  if ((role === "healer" || role === "divine-caster") && !/oracle|cleric|shaman|druid|paladin/.test(cn.toLowerCase())) return 0.4;
  if (role === "arcane-caster" && !/wizard|sorcerer|arcanist|witch|magus/.test(cn.toLowerCase())) return 0.45;
  return 0.5;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function clamp(n: number): number { return Math.min(5, Math.max(0, Math.round(n))); }

function adjustScores(base: RoleScores, char: CharacterData, buildProfile?: BuildProfile): RoleScores {
  const s = { ...base };
  const cn = (char.class?.className ?? "").toLowerCase();
  const casterClass = isCasterClass(cn);
  const rangedStyle = isRangedStyle(char);

  // ── Feat adjustments ──────────────────────────────────────────────────────
  if (hasFeatKeyword(char, "powerattack"))     { nudgeScore(s, "damage", 0.75); nudgeScore(s, "frontline", 0.5, 4.5); }
  if (hasFeatKeyword(char, "selectivechannel"))  nudgeScore(s, "healer", 0.75);
  if (hasFeatKeyword(char, "extrachannel"))      nudgeScore(s, "healer", 0.75);
  if (hasFeatKeyword(char, "spellfocus"))      { nudgeScore(s, "control", 0.75); nudgeScore(s, "damage", 0.25, 4.5); }
  if (hasFeatKeyword(char, "augmentsummoning")) nudgeScore(s, "utility", 0.75, 4.5);
  if (hasFeatKeyword(char, "extendspell"))       nudgeScore(s, "buffer", 0.75);
  if (hasFeatKeyword(char, "toughness"))         nudgeScore(s, "frontline", 0.75, 4.5);
  if (hasFeatKeyword(char, "pointblankshot"))    nudgeScore(s, "damage", 0.5, 4.5);

  // ── Spell adjustments ─────────────────────────────────────────────────────
  if (hasSpellKeyword(char, "haste"))          nudgeScore(s, "buffer", 0.75);
  if (hasSpellKeyword(char, "bless"))          nudgeScore(s, "buffer", 0.75);
  if (hasSpellKeyword(char, "heal"))           nudgeScore(s, "healer", 0.75, 4.5);
  if (hasSpellKeyword(char, "masscure"))       nudgeScore(s, "healer", 1.25);
  if (hasSpellKeyword(char, "web")
    || hasSpellKeyword(char, "hold")
    || hasSpellKeyword(char, "slow"))          nudgeScore(s, "control", 0.75);
  if (hasSpellKeyword(char, "summon"))         nudgeScore(s, "utility", 0.5, 4);
  if (hasSpellKeyword(char, "fireball")
    || hasSpellKeyword(char, "lightningbolt")) nudgeScore(s, "damage", 0.75, 4.5);

  // ── Equipment ─────────────────────────────────────────────────────────────────────────────────
  // Only boost damage from weapon for martial classes — casters use crossbows as backup,
  // not as their primary damage source; boosting their damage score from a crossbow
  // causes misclassification (e.g. Witch → "Damage").
  if (hasEquipWeapon(char) && !casterClass) nudgeScore(s, "damage", 0.5, 4.5);
  const hasArmor = (char.equipment ?? []).some((e) => e.slot === "Armor");
  if (hasArmor)                              nudgeScore(s, "frontline", 0.5, 4.5);

  // ── Style corrections ────────────────────────────────────────────────────
  if (rangedStyle) {
    s.frontline = bounded(Math.min(s.frontline, 2.5));
    s.damage = bounded(Math.max(s.damage, 3.5));
  }
  if (casterClass) {
    s.frontline = bounded(Math.min(s.frontline, 2));
  }

  // ── Build profile (strongest signal) ─────────────────────────────────────
  if (buildProfile) {
    const ROLE_TARGETS: Record<string, Partial<RoleScores>> = {
      "tank":          { frontline: 5 },
      "melee-dps":     { damage: 5, frontline: 3 },
      "ranged-dps":    { damage: 5 },
      "arcane-caster": { control: 5, damage: 4 },
      "divine-caster": { buffer: 5, healer: 3 },
      "healer":        { healer: 5, buffer: 3 },
      "buffer":        { buffer: 5, utility: 3 },
      "controller":    { control: 5, utility: 3 },
      "summoner":      { utility: 5, control: 2 },
      "support":       { utility: 4, buffer: 3 },
    };
    const targets = ROLE_TARGETS[buildProfile.role];
    const weight = buildProfileWeight(char, buildProfile.role);
    if (targets) {
      for (const [k, v] of Object.entries(targets) as [keyof RoleScores, number][]) {
        s[k] = bounded(s[k] + ((v - s[k]) * weight));
      }
    }
  }

  return roundScores(s);
}

// ─── Role label ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<keyof RoleScores, string> = {
  frontline: "Frontline",
  damage:    "Damage",
  healer:    "Healer",
  buffer:    "Buffer",
  control:   "Control",
  utility:   "Utility",
};

function topTwoRoles(scores: RoleScores): [string, string] {
  const sorted = (Object.entries(scores) as [keyof RoleScores, number][])
    .sort((a, b) => b[1] - a[1]);
  return [
    ROLE_LABELS[sorted[0][0]] ?? "Unknown",
    ROLE_LABELS[sorted[1][0]] ?? "Unknown",
  ];
}

// ─── Per-character notes ──────────────────────────────────────────────────────

function gatherNotes(char: CharacterData, scores: RoleScores, bp?: BuildProfile): string[] {
  const notes: string[] = [];
  const className = char.class?.className ?? "";
  if (!char.spellbook && scores.healer >= 3)
    notes.push("No spellbook detected — divine healing not available");
  if (scores.damage >= 4 && !hasEquipWeapon(char) && !isRangedStyle(char) && !/monk/i.test(className))
    notes.push("No weapon in main-hand — equip your best weapon");
  if (bp && scores[roleKey(bp.role)] < 3)
    notes.push(`Build profile says "${bp.role}" but stats suggest otherwise`);
  if (hasFeatKeyword(char, "powerattack") && !hasFeatKeyword(char, "furiousfocus"))
    notes.push("Has Power Attack but not Furious Focus — consider taking it");
  if (hasSpellKeyword(char, "bless") && scores.buffer < 3)
    notes.push("Knows Bless — excellent AoE pre-combat buff");
  return notes;
}

function roleKey(role: string): keyof RoleScores {
  const map: Record<string, keyof RoleScores> = {
    "tank": "frontline", "melee-dps": "damage", "ranged-dps": "damage",
    "arcane-caster": "control", "divine-caster": "buffer",
    "healer": "healer", "buffer": "buffer", "controller": "control",
    "summoner": "utility", "support": "utility",
  };
  return map[role] ?? "utility";
}

// ─── Party-level ──────────────────────────────────────────────────────────────

function maxScores(profiles: CharacterRoleProfile[]): RoleScores {
  const out: RoleScores = { frontline: 0, damage: 0, healer: 0, buffer: 0, control: 0, utility: 0 };
  for (const p of profiles) {
    for (const k of Object.keys(out) as (keyof RoleScores)[]) {
      out[k] = Math.max(out[k], p.scores[k]);
    }
  }
  return out;
}

function buildSynergies(profiles: CharacterRoleProfile[]): string[] {
  const synergies: string[] = [];
  const hasHealer  = profiles.some((p) => p.scores.healer  >= 4);
  const hasBuffer  = profiles.some((p) => p.scores.buffer  >= 4);
  const hasFrontline = profiles.some((p) => p.scores.frontline >= 4);
  const hasDamage  = profiles.some((p) => p.scores.damage  >= 4);
  const hasControl = profiles.some((p) => p.scores.control >= 3);

  if (hasHealer && hasFrontline)
    synergies.push("Frontliner + dedicated healer — can sustain long fights without resting");
  if (hasBuffer && hasDamage)
    synergies.push("Buffer + DPS — party-wide Haste and Bless multiply frontline damage significantly");
  if (hasControl && hasDamage)
    synergies.push("CC + DPS — control locks enemies in place while damage dealers clean up");
  if (profiles.filter((p) => p.scores.buffer >= 3).length >= 2)
    synergies.push("Multiple buffers — stack morale/competence/insight bonuses without overlap");
  return synergies;
}

function buildAdvice(partyScores: RoleScores, profiles: CharacterRoleProfile[]): string[] {
  const advice: string[] = [];
  const maxLevel = Math.max(...profiles.map((p) => p.level));

  if (partyScores.frontline < 3)
    advice.push("Party lacks a durable frontliner — consider a Tank or Paladin to hold the line");
  if (partyScores.healer < 3)
    advice.push("No dedicated healer — rest frequently or stock up on scrolls/potions");
  if (partyScores.buffer < 3)
    advice.push("Weak buffing — a single Bless + Haste caster would significantly boost party efficiency");
  if (partyScores.control < 2)
    advice.push("No crowd control — tough fights with many enemies will be dangerous");
  if (partyScores.damage < 3)
    advice.push("Low damage output — encounters will take longer and consume more resources");
  if (partyScores.utility < 2)
    advice.push("Low utility — consider a character with skills (Perception, Mobility, UMD)");

  if (maxLevel >= 5 && partyScores.buffer >= 4 && partyScores.healer >= 4)
    advice.push("Strong buff + heal core — prioritise pre-combat buffing before every tough encounter");
  if (partyScores.frontline >= 4 && partyScores.damage >= 4)
    advice.push("Heavy physical party — stack STR/attack buffs and positioning flanks for maximum damage");

  return advice;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function analyzeComposition(
  party: PartyData,
  buildProfiles: BuildProfile[]
): PartyComposition {
  const profileMap = new Map(buildProfiles.map((b) => [b.characterId, b]));

  const characters: CharacterRoleProfile[] = party.characters.map((char) => {
    const className = char.class?.className ?? "Unknown";
    const level     = char.class?.level ?? 1;
    const bp        = profileMap.get(char.uniqueId);

    const base   = baselineFromClass(className);
    const scores = adjustScores(base, char, bp);
    const [primaryRole, secondaryRole] = topTwoRoles(scores);
    const notes  = gatherNotes(char, scores, bp);

    return {
      characterId:   char.uniqueId,
      characterName: char.name,
      className,
      level,
      scores,
      primaryRole,
      secondaryRole,
      notes,
    };
  });

  const partyScores = maxScores(characters);

  const gaps: string[] = [];
  const strengths: string[] = [];
  for (const [k, label] of Object.entries(ROLE_LABELS) as [keyof RoleScores, string][]) {
    if (partyScores[k] >= 4) strengths.push(label);
    else if (partyScores[k] <= 1) gaps.push(label);
  }

  return {
    characters,
    partyScores,
    gaps,
    strengths,
    synergies: buildSynergies(characters),
    advice:    buildAdvice(partyScores, characters),
  };
}
