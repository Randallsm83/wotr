import type {
  PartyData, PartyAnalysis, CharacterAnalysis, PartyInsights, SpellEntry,
} from "../models/types.ts";

// ─── Spell classification keywords ───────────────────────────────────────────

const BUFF_KEYWORDS = [
  "bless", "haste", "heroism", "prayer", "inspire", "shield", "magearmor",
  "protection", "resist", "resistance", "aid", "blur", "mirrorimage", "displacement",
  "stoneskin", "bull", "bear", "cat", "eagle", "fox", "owl", "freedom",
  "magicweapon", "divinefavor", "divinepower", "holyaura", "guidance", "virtue",
  "removefear", "unbreakableheart", "goodhope", "communal", "barkskin",
];

const HEAL_KEYWORDS = [
  "cure", "heal", "healingword", "channelpositive", "restorative", "stabilize",
  "layonhands", "treataffliction",
];

const CC_KEYWORDS = [
  "sleep", "hold", "entangle", "web", "grease", "hideous", "slow", "fear",
  "causefear", "dominate", "charm", "confusion", "stun", "paralyze",
  "daze", "hazeofdreams", "strandofthetangledknot",
];

const DAMAGE_KEYWORDS = [
  "fireball", "burninghands", "scorching", "lightning", "chain",
  "inflict", "harm", "slay", "destruction", "disintegrate",
  "divinetap", "divinezap", "unholyzap", "magicmissile",
];

const AOE_BUFF_KEYWORDS = ["bless", "prayer", "goodhope", "inspire", "communal", "haste"];
const SUMMON_KEYWORDS = ["summon", "animate"];

function matchesAny(name: string, keywords: string[]): boolean {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  return keywords.some((k) => n.includes(k.replace(/[^a-z]/g, "")));
}

function classifySpell(s: SpellEntry): "buff" | "heal" | "cc" | "damage" | "utility" {
  const n = s.name;
  if (s.isBuff || matchesAny(n, BUFF_KEYWORDS)) return "buff";
  if (matchesAny(n, HEAL_KEYWORDS)) return "heal";
  if (matchesAny(n, CC_KEYWORDS)) return "cc";
  if (matchesAny(n, DAMAGE_KEYWORDS)) return "damage";
  return "utility";
}

// ─── Analyzer ─────────────────────────────────────────────────────────────────

export function analyzeParty(data: PartyData): PartyAnalysis {
  const characters: CharacterAnalysis[] = data.characters
    .filter((c) => c.spellbook)
    .map((c) => analyzeCharacter(c.uniqueId, c.name, c.spellbook!));

  const party = buildPartyInsights(data, characters);
  return { characters, party };
}

function analyzeCharacter(
  id: string,
  name: string,
  sb: NonNullable<import("../models/types.ts").CharacterData["spellbook"]>
): CharacterAnalysis {
  // Flatten all known spells
  const allKnown: SpellEntry[] = sb.knownSpells.flat();
  const uniqueKnown = dedup(allKnown);

  // Prepared spell IDs
  const preparedIds = new Set(
    sb.preparedSpells.flatMap((l) => l.slots.map((s) => s.spellBlueprintId))
  );
  const preparedSlotNames = new Set(
    sb.preparedSpells.flatMap((l) => l.slots.map((s) => s.spellName))
  );

  const availableBuffs  = uniqueKnown.filter((s) => classifySpell(s) === "buff"    && (s.isCantrip || preparedIds.has(s.blueprintId)));
  const availableHeals  = uniqueKnown.filter((s) => classifySpell(s) === "heal"    && (s.isCantrip || preparedIds.has(s.blueprintId)));
  const availableCC     = uniqueKnown.filter((s) => classifySpell(s) === "cc"      && (s.isCantrip || preparedIds.has(s.blueprintId)));
  const availableDamage = uniqueKnown.filter((s) => classifySpell(s) === "damage"  && (s.isCantrip || preparedIds.has(s.blueprintId)));

  // Buffs that are known but not prepared today
  const notPreparedBuffs = uniqueKnown.filter(
    (s) => classifySpell(s) === "buff" && !s.isCantrip && !preparedIds.has(s.blueprintId)
  );

  // Prep suggestions
  const prepSuggestions: string[] = [];
  if (notPreparedBuffs.length > 0) {
    const topMissing = notPreparedBuffs
      .filter((s) => matchesAny(s.name, [...BUFF_KEYWORDS, "bless", "magicweapon", "protection"]))
      .slice(0, 3)
      .map((s) => s.name);
    if (topMissing.length > 0) {
      prepSuggestions.push(`Consider preparing: ${topMissing.join(", ")}`);
    }
  }

  if (availableHeals.length === 0 && availableBuffs.length === 0) {
    prepSuggestions.push("No healing or buff spells prepared — consider resting");
  }

  return {
    characterId: id,
    characterName: name,
    availableBuffs,
    availableHeals,
    availableCC,
    availableDamage,
    notPreparedBuffs,
    slotsRemaining: sb.slots,
    prepSuggestions,
  };
}

function buildPartyInsights(data: PartyData, analyses: CharacterAnalysis[]): PartyInsights {
  const allBuffs = analyses.flatMap((a) => a.availableBuffs);
  const allCC    = analyses.flatMap((a) => a.availableCC);

  const hasAoeBuff = allBuffs.some((s) => matchesAny(s.name, AOE_BUFF_KEYWORDS));
  const hasProt    = allBuffs.some((s) => matchesAny(s.name, ["protection"]));
  const hasMagicWep = allBuffs.some((s) => matchesAny(s.name, ["magicweapon"]));
  const hasGroupHeal = analyses.some((a) => a.availableHeals.some((s) => matchesAny(s.name, ["cure", "heal"])));
  const hasCC = allCC.length > 0;
  const hasSummon = data.characters.some((c) =>
    c.spellbook?.knownSpells.flat().some((s) => matchesAny(s.name, SUMMON_KEYWORDS))
  );

  const missingCoverage: string[] = [];
  const tips: string[] = [];

  if (!hasAoeBuff)  { missingCoverage.push("No AOE morale buff (Bless/Haste/Prayer)"); }
  if (!hasProt)     { missingCoverage.push("No Protection from Evil"); }
  if (!hasMagicWep) { missingCoverage.push("No Magic Weapon"); }
  if (!hasGroupHeal){ missingCoverage.push("No group healing available"); }
  if (!hasCC)       { missingCoverage.push("No crowd control"); }

  // General tips based on game state
  const level = Math.max(...data.characters.map((c) => c.class?.level ?? 1));
  if (level <= 3) {
    tips.push("Early game: Bless is your most efficient pre-combat buff — covers the whole party.");
    tips.push("Use cantrips (Guidance, Resistance) freely before every fight.");
    tips.push("Save level-1 slots for in-combat healing unless you can rest soon.");
  }
  if (!hasAoeBuff) {
    tips.push("Prepare Bless before tough encounters — +1 morale to all attacks adds up fast.");
  }

  return { hasAoeBuff, hasProtectionFromEvil: hasProt, hasMagicWeapon: hasMagicWep, hasGroupHeal, hasCC, hasSummon, missingCoverage, tips };
}

function dedup(spells: SpellEntry[]): SpellEntry[] {
  const seen = new Set<string>();
  return spells.filter((s) => {
    if (seen.has(s.blueprintId)) return false;
    seen.add(s.blueprintId);
    return true;
  });
}
