import type {
  BuildProfile, BuildRole, BuildAdvice, FeatGap,
  CharacterData,
} from "../models/types.ts";

type StatKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

// ─── Role configuration ───────────────────────────────────────────────────────────

interface RoleConfig {
  /** Primary ability score key and minimum ideal value */
  primaryStat: { key: StatKey; label: string; ideal: number };
  /** Secondary stat check (optional) */
  secondaryStat?: { key: StatKey; label: string; min: number };
  /** Expected feats: [normalized keyword, human name, reason, ideal level?] */
  expectedFeats: [string, string, string, number?][];
  /** Priority spell keywords to look for in known/prepared spells */
  prioritySpells: string[];
  /** Equipment slot checks: [slot, description, required] */
  equipmentChecks: { slot: string; description: string; required: boolean }[];
  /** Generic next-level tips */
  levelTips: string[];
}

const ROLE_CONFIG: Record<BuildRole, RoleConfig> = {
  "tank": {
    primaryStat: { key: "str", label: "STR", ideal: 16 },
    secondaryStat: { key: "con", label: "CON", min: 14 },
    expectedFeats: [
      ["combatexpertise",  "Combat Expertise",   "Unlocks defensive maneuver feats and Improved Disarm/Trip", 1],
      ["dodge",           "Dodge",               "+1 AC and prerequisite for many defensive feats", 1],
      ["shieldfocus",     "Shield Focus",        "+1 AC when using a shield", 1],
      ["toughness",       "Toughness",           "+1 HP per level — crucial for a tank", 3],
      ["combatreflexes",  "Combat Reflexes",     "Generates more attacks of opportunity to punish enemies", 5],
      ["improvedcritical","Improved Critical",   "Doubles threat range with your main weapon", 9],
    ],
    prioritySpells: [],
    equipmentChecks: [
      { slot: "Armor",     description: "No armor equipped — tanks should wear the best available armor", required: true },
      { slot: "Off Hand",  description: "Consider a shield in the Off Hand for +AC unless using two-handed weapons", required: false },
    ],
    levelTips: [
      "Prioritize CON and STR on every level-up. Aim for at least 200 HP by level 15.",
      "Stack AC from multiple sources: armor + shield + natural armor + dodge + deflection.",
      "In WotR, Mythic Vital Strike synergizes extremely well with two-handed tank builds.",
    ],
  },

  "melee-dps": {
    primaryStat: { key: "str", label: "STR", ideal: 18 },
    secondaryStat: { key: "con", label: "CON", min: 12 },
    expectedFeats: [
      ["powerattack",     "Power Attack",        "Core DPS feat — trades accuracy for massive damage", 1],
      ["furiousfocus",    "Furious Focus",       "Removes Power Attack's attack penalty on first attack", 3],
      ["weaponfocus",     "Weapon Focus",        "+1 attack with your weapon type", 1],
      ["weaponspecialization","Weapon Specialization","+2 damage with your weapon type", 5],
      ["improvedcritical","Improved Critical",   "Doubles threat range — huge DPS increase at high levels", 9],
      ["cornugonsmash",   "Cornugon Smash",      "Free Intimidate on Power Attack hit — enables shaken debuff chain", 5],
    ],
    prioritySpells: [],
    equipmentChecks: [
      { slot: "Main Hand", description: "No main-hand weapon equipped — equip your best weapon", required: true },
    ],
    levelTips: [
      "Power Attack + Furious Focus is your core damage combo — take both before level 3.",
      "Two-handed weapons (greatsword, falchion) generally outdamage one-handed in WotR due to 1.5× STR on damage.",
      "Cornugon Smash → Dazzling Display → Shatter Defenses chain enables permanent shaken on enemies.",
    ],
  },

  "ranged-dps": {
    primaryStat: { key: "dex", label: "DEX", ideal: 18 },
    secondaryStat: { key: "str", label: "STR", min: 10 },
    expectedFeats: [
      ["pointblankshot",  "Point-Blank Shot",    "Prerequisite for nearly all ranged feats, +1 attack/damage at 30ft", 1],
      ["preciseshot",     "Precise Shot",        "Removes -4 penalty for shooting into melee", 1],
      ["rapidshot",       "Rapid Shot",          "Extra attack per round at -2 penalty", 3],
      ["manyshot",        "Manyshot",            "Two arrows on first attack — massive opening burst", 6],
      ["deadlyaim",       "Deadly Aim",          "Ranged equivalent of Power Attack", 3],
      ["improvedprecise", "Improved Precise Shot","Ignore cover and concealment from range", 11],
    ],
    prioritySpells: [],
    equipmentChecks: [
      { slot: "Main Hand", description: "Equip a bow or crossbow in the main-hand slot", required: true },
    ],
    levelTips: [
      "Point-Blank Shot → Precise Shot → Rapid Shot is the mandatory level 1-3 sequence.",
      "Arcane Archer or Eldritch Archer prestige dips add significant ranged burst.",
      "True Strike (from scrolls/wand) is worth using on opening shots in tough fights.",
    ],
  },

  "arcane-caster": {
    primaryStat: { key: "int", label: "INT", ideal: 18 },
    expectedFeats: [
      ["spellfocus",       "Spell Focus",         "DC +1 for your primary damage school — pick Evocation or Conjuration", 1],
      ["greaterspellfocus","Greater Spell Focus",  "DC +1 again for your school — stacks with Spell Focus", 5],
      ["spellpenetration", "Spell Penetration",    "Overcome enemy spell resistance", 3],
      ["greaterspellpen",  "Greater Spell Penetration","Further +2 to penetrate spell resistance", 7],
      ["empowerspell",     "Empower Spell",        "×1.5 on variable numeric effects — great for damage spells", 5],
      ["maximizespell",    "Maximize Spell",       "Max damage on all dice — expensive but game-changing at high levels", 9],
    ],
    prioritySpells: [
      "Haste", "Fireball", "Stinking Cloud", "Slow", "Disintegrate",
      "Chain Lightning", "Horrid Wilting", "Sirocco", "Shapechange",
    ],
    equipmentChecks: [],
    levelTips: [
      "INT is your primary stat — every 2 points above 10 gives +1 DC on all your spells.",
      "Pick one damage school (Evocation for blasting, Conjuration for battlefield control) and stack Spell Focus into it.",
      "Spell Penetration is mandatory in later acts where enemies have very high SR.",
      "Quicken Spell (mythic or regular) lets you cast a second full-action spell per round.",
    ],
  },

  "divine-caster": {
    primaryStat: { key: "wis", label: "WIS", ideal: 18 },
    expectedFeats: [
      ["spellfocus",       "Spell Focus",         "DC +1 for your primary damage/CC school", 1],
      ["extrachannel",     "Extra Channel",        "+2 channels per day — essential if you rely on channel energy", 1],
      ["selectivechannel", "Selective Channel",    "Exclude allies from negative channeling / enemies from positive", 3],
      ["spellpenetration", "Spell Penetration",    "Divine buffs and blasts still need to penetrate SR", 5],
      ["reachspell",       "Reach Spell",          "Cast touch spells at range — huge quality of life", 7],
      ["quickenspell",     "Quicken Spell",        "Cast two spells per round — divine casters can afford the slots", 9],
    ],
    prioritySpells: [
      "Bless", "Prayer", "Divine Favor", "Divine Power",
      "Holy Smite", "Harm", "Heal", "Protection from Evil",
      "Shield of Faith", "Aid",
    ],
    equipmentChecks: [],
    levelTips: [
      "WIS is everything — aim for 22+ with items. Every 2 WIS above 10 adds +1 DC and +1 spell/level.",
      "Selective Channel means you can freely channel in melee without healing enemies.",
      "At level 9+ Holy Smite + Divine Power + Quicken turns you into a martial/caster hybrid.",
    ],
  },

  "healer": {
    primaryStat: { key: "wis", label: "WIS", ideal: 18 },
    expectedFeats: [
      ["extrachannel",     "Extra Channel",        "More channels = more healing/turn", 1],
      ["selectivechannel", "Selective Channel",    "Don't accidentally heal undead enemies", 1],
      ["improvedchannel",  "Improved Channel",     "+2 to DCs on channel energy for turning/damaging", 3],
      ["channeldiscovery", "Channel Discovery",    "Cleric Discovery — grants oracle revelations including powerful heals", 5],
      ["quickenspell",     "Quicken Spell",        "Cast heals as bonus action in emergencies", 7],
    ],
    prioritySpells: [
      "Cure Critical Wounds", "Mass Cure Light Wounds", "Heal",
      "Breath of Life", "Death Ward", "Restoration",
      "Remove Curse", "Remove Disease", "Neutralize Poison",
    ],
    equipmentChecks: [],
    levelTips: [
      "Channel energy is more action-efficient than individual cure spells — stack Extra Channel early.",
      "Prepare a mix of Cure X Wounds at multiple levels so you have the right size for any situation.",
      "Death Ward is the most important buff in the game — prepare several copies for late acts.",
      "Keep at least two Restoration slots for ability damage recovery.",
    ],
  },

  "buffer": {
    primaryStat: { key: "wis", label: "WIS", ideal: 16 },
    expectedFeats: [
      ["extendspell",      "Extend Spell",         "Doubles duration of buff spells — critical for pre-combat buffs", 1],
      ["reachspell",       "Reach Spell",           "Cast touch buffs at range", 3],
      ["quickenspell",     "Quicken Spell",         "Apply one extra buff per round", 9],
      ["augmentsummoning", "Augment Summoning",     "If also summoning: +4 STR/CON to all summons", 5],
    ],
    prioritySpells: [
      "Bless", "Haste", "Prayer", "Good Hope", "Heroism", "Greater Heroism",
      "Communal Protection from Evil", "Aid", "Blur", "Mirror Image",
      "Displacement", "Stoneskin", "Freedom of Movement",
    ],
    equipmentChecks: [],
    levelTips: [
      "Extended Haste at level 5 is the single most impactful pre-combat buff in the game.",
      "Communal versions of Protection/Resist stack on individual castings — use both.",
      "Priority prep order: Haste > Prayer > Bless > Good Hope > individual stat buffs.",
      "At mythic tier, Ascendant Element and Abundant Casting multiply your buff throughput.",
    ],
  },

  "controller": {
    primaryStat: { key: "int", label: "INT", ideal: 18 },
    expectedFeats: [
      ["spellfocus",       "Spell Focus (Enchantment/Conjuration)", "CC spells need high DCs to land", 1],
      ["greaterspellfocus","Greater Spell Focus",  "+1 more DC — stacks with Spell Focus", 5],
      ["spellpenetration", "Spell Penetration",    "Many CC targets have SR in late game", 5],
      ["persistentspell",  "Persistent Spell",     "Forces two saves instead of one on every CC spell", 7],
      ["extendspell",      "Extend Spell",         "Doubles duration on battlefield control spells", 3],
    ],
    prioritySpells: [
      "Web", "Stinking Cloud", "Slow", "Hold Person", "Hold Monster",
      "Dominate Person", "Confusion", "Sirocco", "Chains of Light",
      "Euphoric Tranquility", "Feeblemind",
    ],
    equipmentChecks: [],
    levelTips: [
      "Spell DC is everything for a controller — pick one school and maximize its DC.",
      "Web and Stinking Cloud are the best early battlefield control spells in WotR — get them at level 3.",
      "Persistent Spell + high-DC CC means enemies must roll two saves or become useless.",
      "Mythic Spell Focus gives another +2 DC — it's a top mythic feat priority.",
    ],
  },

  "summoner": {
    primaryStat: { key: "cha", label: "CHA", ideal: 16 },
    expectedFeats: [
      ["augmentsummoning", "Augment Summoning",    "+4 STR and CON to all summoned creatures", 1],
      ["spellpenetration", "Spell Penetration",    "Summon spells target SR on some enemies", 5],
      ["superiorsummoning","Superior Summoning",   "+1 creature on summon spells that bring 1d4+1 creatures", 9],
      ["persistentspell",  "Persistent Spell",     "Makes your summon spells last twice as long", 7],
    ],
    prioritySpells: [
      "Summon Monster III", "Summon Monster IV", "Summon Monster V",
      "Summon Monster VI", "Summon Monster VII", "Summon Monster VIII", "Summon Monster IX",
      "Animate Dead", "Create Undead",
    ],
    equipmentChecks: [],
    levelTips: [
      "Augment Summoning is your mandatory first feat — your summons live and die by their HP/attack stats.",
      "Greater Elemental summons (Earth) are among the best tanks in the game.",
      "Fiendish summons benefit from Augment Summoning and have their own attacks/abilities.",
      "Gate at level 17 brings the strongest summon in the game — plan for that capstone.",
    ],
  },

  "support": {
    primaryStat: { key: "cha", label: "CHA", ideal: 14 },
    expectedFeats: [
      ["persuasion",       "Persuasion / Skill Focus (Persuasion)", "Intimidate-based debuff chains", 1],
      ["cornugonsmash",    "Cornugon Smash",       "Free shaken on Power Attack hits", 5],
      ["dazzlingdisplay",  "Dazzling Display",     "Shaken all visible enemies as a full-round action", 7],
      ["shatterdefenses",  "Shatter Defenses",     "Shaken/frightened enemies become flat-footed against you", 9],
    ],
    prioritySpells: [
      "Bless", "Aid", "Guidance", "Resistance", "Faerie Fire",
      "Glitterdust", "Grease",
    ],
    equipmentChecks: [],
    levelTips: [
      "Cornugon Smash → Dazzling Display → Shatter Defenses makes enemies flat-footed — valuable for sneak attackers.",
      "Even a non-caster support can provide meaningful utility via Intimidate debuff chain.",
      "Buff cantrips (Guidance, Resistance) are free every fight — use them obsessively.",
    ],
  },
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function hasFeat(char: CharacterData, keyword: string): boolean {
  const kw = normalize(keyword);
  return (char.feats ?? []).some((f) => normalize(f.name).includes(kw));
}

function hasSpell(char: CharacterData, keyword: string): boolean {
  const kw = normalize(keyword);
  const all = char.spellbook?.knownSpells.flat() ?? [];
  return all.some((s) => normalize(s.name).includes(kw));
}

function hasPreparedSpell(char: CharacterData, keyword: string): boolean {
  const kw = normalize(keyword);
  const prepared = char.spellbook?.preparedSpells.flatMap((l) => l.slots.map((s) => s.spellName)) ?? [];
  return prepared.some((name) => normalize(name).includes(kw));
}

function hasEquipmentInSlot(char: CharacterData, slot: string): boolean {
  return (char.equipment ?? []).some((e) => e.slot === slot);
}

function getStatValue(char: CharacterData, key: string): number {
  const s = char.stats;
  if (!s) return 10;
  return (s as any)[key] ?? 10;
}

// ─── Scorer ───────────────────────────────────────────────────────────────────

export function adviseBuild(profile: BuildProfile, char: CharacterData): BuildAdvice {
  const cfg = ROLE_CONFIG[profile.role];
  const level = char.class?.level ?? 1;

  // ── Stats (30 points) ─────────────────────────────────────────────────────

  const statWarnings: string[] = [];
  const primaryVal = getStatValue(char, cfg.primaryStat.key);
  let statScore = 0;

  if (primaryVal >= cfg.primaryStat.ideal) {
    statScore = 30;
  } else if (primaryVal >= cfg.primaryStat.ideal - 2) {
    statScore = 20;
    statWarnings.push(
      `${cfg.primaryStat.label} is ${primaryVal} — aim for ${cfg.primaryStat.ideal}+ with enhancement items or ability score increases.`
    );
  } else if (primaryVal >= cfg.primaryStat.ideal - 4) {
    statScore = 10;
    statWarnings.push(
      `${cfg.primaryStat.label} is ${primaryVal} — this is below the ${cfg.primaryStat.ideal} ideal for a ${profile.role} build. Prioritize headpiece/belt slot items.`
    );
  } else {
    statScore = 0;
    statWarnings.push(
      `${cfg.primaryStat.label} is only ${primaryVal} — a ${profile.role} build needs at least ${cfg.primaryStat.ideal}. This significantly limits your effectiveness.`
    );
  }

  if (cfg.secondaryStat) {
    const secVal = getStatValue(char, cfg.secondaryStat.key);
    if (secVal < cfg.secondaryStat.min) {
      statWarnings.push(
        `${cfg.secondaryStat.label} is ${secVal} — should be at least ${cfg.secondaryStat.min} to survive as a ${profile.role}.`
      );
    }
  }

  // ── Feats (40 points) ─────────────────────────────────────────────────────

  const featGaps: FeatGap[] = [];
  let featsHave = 0;
  // Only check feats that should be available at this level
  const relevantFeats = cfg.expectedFeats.filter(([, , , byLvl]) => !byLvl || byLvl <= level + 1);

  for (const [keyword, name, reason, byLevel] of relevantFeats) {
    if (!hasFeat(char, keyword)) {
      featGaps.push({ featName: name, reason, byLevel });
    } else {
      featsHave++;
    }
  }

  const featScore = relevantFeats.length > 0
    ? Math.round((featsHave / relevantFeats.length) * 40)
    : 40;

  // ── Spells (20 points) ───────────────────────────────────────────────────

  const spellPriorities: string[] = [];
  let spellScore = 20; // non-casters get full spell score
  const hasCaster = !!char.spellbook;

  if (hasCaster && cfg.prioritySpells.length > 0) {
    const known: string[] = [];
    const unknown: string[] = [];

    for (const spell of cfg.prioritySpells) {
      if (hasSpell(char, normalize(spell.split(" ")[0]))) {
        // Has it, check if prepared
        if (!hasPreparedSpell(char, normalize(spell.split(" ")[0]))) {
          spellPriorities.push(`${spell} — known but not prepared today`);
        } else {
          known.push(spell);
        }
      } else {
        // Only suggest spells accessible at this level (rough: spell level ≤ level/2+1)
        unknown.push(spell);
      }
    }

    // Score based on proportion of priority spells prepared
    const prepared = cfg.prioritySpells.filter((s) =>
      hasPreparedSpell(char, normalize(s.split(" ")[0]))
    ).length;
    spellScore = cfg.prioritySpells.length > 0
      ? Math.round((prepared / Math.min(cfg.prioritySpells.length, 5)) * 20)
      : 20;
    spellScore = Math.min(20, spellScore);

    // Add top unknown spells as priorities to pursue
    if (unknown.length > 0) {
      spellPriorities.push(...unknown.slice(0, 4).map((s) => `${s} — not yet in spellbook, add when available`));
    }
  }

  // ── Equipment (10 points) ────────────────────────────────────────────────

  const equipmentNotes: string[] = [];
  let equipScore = 10;

  for (const check of cfg.equipmentChecks) {
    if (!hasEquipmentInSlot(char, check.slot)) {
      equipmentNotes.push(check.description);
      if (check.required) equipScore -= 5;
    }
  }
  equipScore = Math.max(0, equipScore);

  // ── Total score ────────────────────────────────────────────────────────────

  const alignmentScore = Math.min(100, statScore + featScore + spellScore + equipScore);

  // ── Next-level tips ────────────────────────────────────────────────────────

  const nextLevelTips: string[] = [];

  // Top feat gap at current level
  const immediateGap = featGaps.find((f) => !f.byLevel || f.byLevel <= level + 1);
  if (immediateGap) {
    nextLevelTips.push(`Take ${immediateGap.featName} at next level-up — ${immediateGap.reason}`);
  }

  // Stat advice for next level
  if (level % 4 === 3) {
    // Ability score improvement incoming at level 4, 8, 12, 16, 20
    nextLevelTips.push(
      `Next level grants an ability score point — put it in ${cfg.primaryStat.label} for maximum impact as a ${profile.role}.`
    );
  }

  // Add role tips
  nextLevelTips.push(...cfg.levelTips.slice(0, 2));

  return {
    profile,
    alignmentScore,
    statWarnings,
    featGaps,
    spellPriorities,
    equipmentNotes,
    nextLevelTips,
  };
}
