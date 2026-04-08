/**
 * Curated build guide data — issues, synergies, per-character next-level
 * recommendations. Shared by both the HTML generator script and the live app.
 *
 * Update this file each session as the party progresses.
 */
import type { CharacterData, PartyData, RoleScores } from "../models/types.ts";
import { analyzeComposition } from "./party-builder.ts";
import { getBuilds } from "./build-store.ts";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface GuideIssue {
  sev: "crit" | "warn" | "info";
  char: string;
  msg: string;
}

export interface GuideSynergy {
  icon: string;
  title: string;
  body: string;
}

export interface GuideRecommendation {
  /** Bold header shown in the card (may be a feat, equipment note, or tactic) */
  feat: string;
  why: string;
  priority: "high" | "med" | "low";
  spell?: string;
}

export interface FeatNote { note: string; status: "good" | "warn" | "bad" | "info"; }

export interface CharacterTactics {
  combat?: string;
  spells?: string[];
  mythic?: string;
  attributes?: string[];
}

export interface CharacterShoppingTip {
  /** Slots that are empty and should be filled (with what to look for) */
  slotPriority: { slot: string; lookFor: string }[];
  /** Specific item recommendations to search for at vendors */
  itemPicks?: string[];
}

export interface PartySlotAdvice {
  name: string;
  role: string;
  why: string;
  priority: "core" | "recommended" | "situational";
}

export interface PartyAdvice {
  /** Ordered list of who should be in the active 6 and why */
  slots: PartySlotAdvice[];
  /** Who to bench and the reason */
  bench: { name: string; reason: string }[];
  /** Who to rotate in and when */
  rotationTips: string[];
  /** What roles the recommended composition covers */
  coverageNote: string;
}

export interface BuildGuideData {
  issues: GuideIssue[];
  synergies: GuideSynergy[];
  recommendations: Record<string, GuideRecommendation>;
  featNotes: Record<string, FeatNote>;
  tactics: Record<string, CharacterTactics>;
  restChecklist: string[];
  shoppingTips: Record<string, CharacterShoppingTip>;
  consumableTips: string[];
  partyAdvice: PartyAdvice;
  provenance?: Record<string, "save" | "reference" | "hybrid">;
}

// ─── Feat tooltip annotations ─────────────────────────────────────────────────

export const FEAT_ANALYSIS: Record<string, { note: string; status: "good" | "warn" | "bad" | "info" }> = {
  // ── Melee feats ──
  "Power Attack":             { note: "−1 hit / +2 dmg per 4 BAB",                              status: "good" },
  "Power Attack Mythic Feat": { note: "Mythic Power Attack: converts bonus damage to maximized", status: "good" },
  "Furious Focus":            { note: "Negates Power Attack penalty on first attack",            status: "good" },
  "Dazzling Display":         { note: "Full-round: Intimidate all enemies in 30ft → Shaken (−2 attacks/saves). Enables Shatter Defenses.", status: "good" },
  "Cleave":                   { note: "After hitting in melee, free attack on an adjacent enemy", status: "good" },
  "Outflank":                 { note: "+4 flanking bonus (vs +2). Critical hits trigger a free AoO from all allies with Outflank.", status: "good" },
  "Weapon Focus":             { note: "+1 attack with chosen weapon",                            status: "good" },
  "Weapon Specialization":    { note: "+2 damage with chosen weapon (Fighter 4 required)",       status: "good" },
  "Dodge":                    { note: "+1 Dodge AC — stacks with everything",                    status: "good" },
  "Shield Focus":             { note: "+1 Shield AC",                                            status: "good" },
  "Armor Focus Heavy":        { note: "+1 AC in heavy armor",                                    status: "good" },
  "Armor Focus Selection":    { note: "Armor Focus selection",                                   status: "info" },
  "Combat Reflexes":          { note: "Extra AoO per round equal to DEX bonus",                  status: "good" },
  "Furys Fall":               { note: "Add DEX to Trip CMB (stacks with STR)",                   status: "good" },
  // ── TWF ──
  "Two Weapon Fighting":      { note: "TWF core — requires dual one-handed weapons",              status: "good" },
  "Double Slice":             { note: "Full STR to off-hand attacks",                             status: "good" },
  "Finesse Training Dagger":  { note: "DEX to damage with daggers — off-hand only benefits when paired with a dagger", status: "good" },
  "Weakening Wound":          { note: "Inflict STR damage on sneak attacks",                     status: "good" },
  // ── Ranged feats ──
  "Point Blank Shot":         { note: "+1 attack/damage within 30ft",                            status: "good" },
  "Precise Shot":             { note: "No −4 penalty for shooting into melee",                   status: "good" },
  "Deadly Aim":               { note: "Ranged Power Attack: −1 hit / +2 dmg",                   status: "good" },
  "Point Blank Master":       { note: "No AoO from ranged attacks while threatened",             status: "good" },
  "Zen Archer Way Of The Bow Longbow Focus": { note: "Zen Archer: Weapon Focus with longbow (WIS-based hits)", status: "good" },
  "Ki True Strike":           { note: "Spend 1 Ki for True Strike (auto-hit on next attack)",    status: "good" },
  "Abundant Ki Pool":         { note: "+4 Ki points to pool",                                   status: "info" },
  "Improved Precise Shot":    { note: "No penalty shooting into melee; enemies lose soft cover bonuses", status: "good" },
  "Clustered Shots":          { note: "All arrows in a full attack count together for bypassing DR — essential vs DR/cold iron", status: "good" },
  "Ki Barskin":               { note: "Spend 1 Ki for Barkskin self-buff — cast before combat",  status: "info" },
  // ── Spellcaster feats ──
  "Spell Focus":              { note: "+1 DC to chosen school spells",                           status: "good" },
  "Spell Focus Greater":      { note: "+2 total DC to chosen school spells (stacks with Spell Focus)", status: "good" },
  "Spell Penetration":        { note: "+2 to CL checks vs SR — vital against demons",            status: "good" },
  "Abundant Casting":         { note: "+4 extra level 1 spell slots",                            status: "info" },
  "Greater Spell Penetration": { note: "+4 total to CL checks vs SR (stacks with Spell Penetration)", status: "good" },
  // ── Ranger ──
  "Favorite Terrain Abyss":   { note: "+2 Perception/Stealth/Initiative in Abyssal terrain",     status: "info" },
  "Ranger Style Menacing Selection2": { note: "Menacing style tier 2: Shaken lasts +2 extra rounds", status: "info" },
  "Ranger Style Menacing Selection6": { note: "Cornugon Smash (Menacing Lv 6): free Intimidate on Power Attack hit → target auto-Shaken", status: "good" },
  "Animal Companion Feature Leopard": { note: "Leopard companion — Sly",                        status: "info" },
  "Animal Companion Selection Ranger": { note: "Ranger animal companion progression",            status: "info" },
  "Companion Boon":           { note: "Boon Companion: removes −3 companion level penalty, Sly now scales at full Ranger level", status: "good" },
  // ── Paladin ──
  "Mercy Sickened":           { note: "Paladin Mercy: cures sickened on lay on hands",           status: "good" },
  "Mercy Diseased":           { note: "Paladin Mercy: cures disease on lay on hands",            status: "good" },
  "Great Fortitude":          { note: "+2 Fort save",                                            status: "info" },
  // ── Shaman / Witch ──
  "Weapon Finesse":           { note: "Use DEX for attack rolls with light/finesse weapons",      status: "good" },
  "Shaman Hex Iceplant":      { note: "Iceplant Hex: +2 Natural Armor AC",                       status: "good" },
  "Witch Hex Slumber":        { note: "Slumber hex: Will save or sleep (no save if not in combat)", status: "good" },
  "Witch Hex Vulnerability Curse": { note: "Vulnerability Curse: +1 dmg dice from one damage type", status: "good" },
  "Witch Hex Healing":        { note: "Healing hex: cure light wounds 1×/day per target — no daily limit per target after 24h", status: "good" },
  "Witch Hex Protective Luck": { note: "Target must reroll attacks once per round — defensive hex", status: "info" },
  // ── Oracle / Cleric ──
  "Selective Channel":        { note: "Channel energy without hitting allies — essential for combat channeling", status: "good" },
  "Channel Energy":           { note: "Channels positive energy (1d6 per 2 cleric levels) in 30ft burst", status: "good" },
  "Extra Channel":            { note: "+2 channel energy uses per day",                          status: "good" },
  "Extra Channel Oracle":     { note: "+2 channel energy uses per day (Oracle)",                 status: "good" },
  "Boundless Healing":        { note: "Cure spells work on any creature regardless of alignment", status: "good" },
  "Oracle Revelation Channel": { note: "Channels positive energy as a cleric of same Oracle level", status: "good" },
  "Oracle Revelation Safe Curing": { note: "Healing spells don't provoke attacks of opportunity", status: "good" },
  "Oracle Revelation Combat Healer": { note: "Channel energy as a swift action — heals without spending a standard action", status: "good" },
  "Oracle Life Mystery":      { note: "Life Mystery — access to cure spells + life revelations",  status: "info" },
  "Oracle Cure Spells":       { note: "Oracle knows all cure spells as bonus spells",             status: "info" },
  // ── Shifter ──
  "Master Shapeshifter":      { note: "Improves natural attack damage in shapeshift forms",       status: "good" },
  "Multiattack Shifter":      { note: "Reduces secondary natural attack penalty in shapeshift forms", status: "good" },
  // ── Ember ──
  "Ascendant Element Fire":   { note: "Fire damage bypasses fire immunity and resistance",        status: "good" },
  // ── Generic ──
  "Toughness":                { note: "+1 hp per character level — retroactive",                 status: "info" },
};

// ─── Dynamic issue generation (derived from save data, always current) ───────────────────────

function detectIssues(party: PartyData): GuideIssue[] {
  const issues: GuideIssue[] = [];
  const chars = party.characters;

  // Compute party average level (non-animal, non-summon classes only)
  const leveled = chars.filter(c => c.class?.level && c.class.level > 1);
  const maxLevel = Math.max(...leveled.map(c => c.class!.level));

  for (const char of chars) {
    const lv = char.class?.level ?? 0;

    // Dead characters
    if (char.stats && char.stats.hp <= 0) {
      issues.push({ sev: "crit", char: char.name,
        msg: `Currently dead (${char.stats.hp}/${char.stats.hpMax} HP). To revive: use a Scroll of Raise Dead (no extra components needed) or have Daeran/Sosiel prepare Raise Dead (L4 spell, requires a Diamond 5000gp). Resting does NOT auto-revive.` });
    }

    // Far behind on levels (more than 3 levels below max)
    if (lv > 0 && lv < maxLevel - 3) {
      issues.push({ sev: "crit", char: char.name,
        msg: `Level ${lv} while the party is level ${maxLevel} — ${maxLevel - lv} levels behind. Must be in every fight to close the XP gap.` });
    } else if (lv > 0 && lv < maxLevel - 1) {
      issues.push({ sev: "warn", char: char.name,
        msg: `Level ${lv} while the party is level ${maxLevel}. Rotate into active party for fights to catch up.` });
    }

    // Finesse Training Dagger but non-dagger in main hand
    const hasFinesseTraining = (char.feats ?? []).some(f => f.name === "Finesse Training Dagger");
    const mainHand = (char.equipment ?? []).find(e => e.slot === "Main Hand");
    if (hasFinesseTraining && mainHand && !/dagger/i.test(mainHand.name)) {
      issues.push({ sev: "crit", char: char.name,
        msg: `Finesse Training Dagger gives DEX to damage ONLY with daggers, but main-hand is "${mainHand.name}". Swap to any dagger — no level-up needed.` });
    }

    // Standard/Standart (typo in game) starting-tier gear on a leveled character
    if (lv >= 6) {
      const standardItems = (char.equipment ?? []).filter(e =>
        /^Standard\s|^Standart\s/i.test(e.name) && ["Armor", "Main Hand", "Off Hand"].includes(e.slot)
      );
      if (standardItems.length > 0) {
        issues.push({ sev: "warn", char: char.name,
          msg: `Still using starting-tier gear at level ${lv}: ${standardItems.map(e => `${e.slot} — ${e.name}`).join("; ")}. Upgrade these immediately.` });
      }
    }
  }

  // Always-on note about autoleveling
  issues.push({ sev: "info", char: "Note",
    msg: "Companion feats require disabling autoleveling. Equipment swaps, hex/spell usage, and tactics can all be changed without touching autoleveling." });

  // Sort: crit first, then warn, then info
  const order = { crit: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order[a.sev] - order[b.sev]);
}

// ─── Party synergies (update each session) ─────────────────────────────────────

export const SYNERGIES: GuideSynergy[] = [
  { icon: "🎯", title: "Outflank Chain — Kaede only (Sly needs INT 3)", body: "Kaede has Outflank. Sly has Weapon Focus but not yet Outflank (blocked by INT 2 — needs INT 3 to qualify). Still needed: Seelah, Woljif, Ulbrig, Sly. Sly fix: Headband of Vast Intellect +2 during level-up screen to take Outflank, then swap back." },
  { icon: "😵", title: "Cornugon Smash + Shatter Defenses — fully online", body: "Every Kaede Power Attack auto-Shakes the target for free (Cornugon Smash). Shaken targets hit by Kaede become flat-footed (Shatter Defenses). The full debuff chain runs automatically on single targets with no setup turn required." },
  { icon: "😴", title: "Ember Slumber → melee pile-on", body: "Ember Slumber hex: Will save or sleep (auto if not in combat). Sleeping = flat-footed = Woljif sneak attacks + Kaede Shatter Defenses + Coup de Grace. Highest-value control in the party. Vulnerability Curse follows for bonus damage." },
  { icon: "💉", title: "Deep healing bench — 4 sources, one now swift", body: "Seelah (Lay on Hands swift + channel), Daeran (Combat Healer swift channel + Cure spells), Sosiel (Cleric channel + Cure), Camellia (Cure spells). Daeran's Combat Healer revelation makes mid-combat triage nearly free — heals without spending a standard action." },
  { icon: "🏹", title: "Dual ranged — Lann at peak, Wenduag far behind", body: "Lann is fully online with Clustered Shots at Lv 7 — all arrows count together for DR bypass, critical vs Act 2+ DR/cold iron enemies. Wenduag is still Lv 2. She must be in every fight." },
  { icon: "⚡", title: "Woljif sneak attack — one swap from full power", body: "Finesse Training Dagger adds DEX to damage ONLY with daggers. Sickle of Falter in main hand wastes this entirely. Swap the Sickle to any dagger — no level-up required. Both attacks then apply full DEX-to-damage. Sources of flat-footed: Ember Slumber, Kaede Cornugon+Shatter, or flanking." },
];

// ─── Per-character next-level recommendations (update each session) ─────────────

export const LVL_RECS: Record<string, GuideRecommendation> = {
  // ── PC: full build control ────────────────────────────────────────────────
  "Kaede": {
    feat: "Furious Focus (Lv 9) + Mythic T2 done",
    why: "STR 20 ✓ and Boon Companion ✓ are done. Mythic T2 taken. Furious Focus was NOT taken at Lv 8 (got Favorite Terrain Forest instead). Take it at Lv 9 — negates Power Attack penalty on the first attack per round, which is the attack that triggers Cornugon Smash and Shatter Defenses.",
    priority: "high",
  },
  // ── Animal companion: user-controlled ────────────────────────────────────
  "Sly": {
    feat: "Outflank ✓ done — next ASI: STR +2",
    why: "Sly now has Outflank — crit-chain with Kaede is active. At the next stat increase (Lv 8 or 9), choose STR +2. DEX is already 22, diminishing returns.",
    priority: "low",
  },
  // ── Companions: autoleveling ON — equipment/tactics only ─────────────────
  "Seelah": {
    feat: "Autoleveling ON — Lv 8 Mythic T2",
    why: "Got Shield Focus Mythic Feat and Belt of CON +2. Good picks. Lay on Hands as a swift action every round; channel between waves. Smite Evil on the strongest demon at start of combat.",
    priority: "low",
  },
  "Camelia": {
    feat: "Autoleveling ON — Lv 8, Aura of Purity hex now active",
    why: "Aura of Purity at Lv 8 gives allies +2 resistance vs poisons/diseases/curses. Barkskin on Kaede and Sly pre-combat every fight. StinkingCloud on groups. Iceplant hex (passive +2 natural armor on herself) already active.",
    priority: "low",
    spell: "Barkskin (L2) on Kaede + Sly before every fight.",
  },
  "Lann": {
    feat: "Revive first — Autoleveling ON after",
    why: "Lann is currently dead. Revive him before any dungeon. Once alive: Zen Archer with Clustered Shots is fully online — no changes needed. Give him better rings and a belt if possible.",
    priority: "high",
  },
  "Wenduag": {
    feat: "Keep in party — far behind",
    why: "Still Lv 2 while the party is Lv 8. Six levels behind. Every fight she sits out deepens the gap. She must be active in every combat.",
    priority: "high",
  },
  "Woljif": {
    feat: "Swap main-hand to a dagger — still has Sickle",
    why: "Finesse Training Dagger gives DEX to damage only with daggers. The Sickle of Falter in main hand wastes this entirely. Swap immediately — no level-up needed.",
    priority: "high",
    spell: "Invisibility (L2) pre-combat for guaranteed flat-footed round 1.",
  },
  "Nenio": {
    feat: "Autoleveling ON — Lv 8, Expanded Arsenal",
    why: "Expanded Arsenal School expands her spell list significantly. Has Staff of Fireball now. Haste every single combat, no exceptions. Fireball on groups. Displacement on Kaede before tough fights.",
    priority: "low",
    spell: "Haste (L3) every combat. Fireball (L3) on packs. Displacement on Kaede.",
  },
  "Ulbrig": {
    feat: "Autoleveling ON — Lv 8, Power Attack Mythic",
    why: "Got Power Attack Mythic Feat at Lv 8 — doubles PA damage in shapeshift form. Position to always flank with Kaede.",
    priority: "low",
  },
  "Ember": {
    feat: "Autoleveling ON — Lv 8, Fortune + Spell Penetration",
    why: "Fortune hex (ally can reroll any roll) and Spell Penetration at Lv 8 are strong picks. Fortune on Kaede or Lann before tough fights. Slumber opening, Vulnerability Curse on priority target every fight.",
    priority: "low",
  },
  "Daeran": {
    feat: "Autoleveling ON — Lv 8, Mythic Channel",
    why: "Mythic Channel at Lv 8 significantly boosts channel healing output. Swift-action channel (Combat Healer) + boosted heal = best mid-combat healing in the party. Make sure to equip a Headband of CHA +2 if available — CHA 20 now, headband would push to 22.",
    priority: "low",
  },
  "SosielVaenic": {
    feat: "Equipment upgrade — still Standard gear at Lv 8",
    why: "Standard Scalemail and Standard Glaive at level 8. Buy +2 armor (he has Heavy Armor Proficiency) and a +1 polearm. Mythic Channel at Lv 8 means his channels are more powerful — he needs to survive to use them.",
    priority: "high",
  },
  "Regill": {
    feat: "Autoleveling ON — Lv 5, 3 levels behind",
    why: "Regill is Lv 5 while the party is Lv 8 — three levels behind now. Improved TWF taken. Keep him active. His Cold Iron Hooked Hammer and Adamantine Fullplate +2 make him a solid frontliner once caught up.",
    priority: "med",
  },
};

// ─── Per-character tactics (update each session) ────────────────────────────

export const TACTICS: Record<string, CharacterTactics> = {
  "Kaede": {
    combat: "Pre-combat: Lead Blades (L1). Round 1 single target: Power Attack → Cornugon Smash auto-Shakes → Shatter Defenses makes flat-footed, entire party benefits. Round 1 vs 3+ enemies: Dazzling Display (full round) to mass-Shake all nearby, then Power Attack next round. Round 2+: Power Attack every swing, Cleave on kills, keep Sly flanking for Outflank AoOs on crits.",
    spells: [
      "Lead Blades (L1) — Greatsword 2d6 → 3d6, cast before every fight",
      "Resist Energy Fire (L1) — demons spam fire, cast on Kaede + Sly every fight",
      "Longstrider (L1) — +10ft movement 1hr/level, recast after rest",
    ],
    mythic: "Currently Mythic Hero T1. Mythic Power Attack taken ✔ — correct. Path choice at Crusade Council: Angel is ideal for Demonslayer. At Angel Rank 2, Holy Sword adds Holy (+2d6 vs evil) + Bane: Demons to your weapon for free on every hit. Priority: Rank 1 → Angelic Aspect. Rank 2 → Holy Sword. Rank 3 → Mythic Weapon Focus.",
    attributes: ["STR (primary — 2H damage scales with PA)", "CON (HP + Fort save for frontliner)", "WIS (Will saves vs demon enchantments)"],
  },
  "Seelah": {
    combat: "Use Lay on Hands as a swift action (free triage without consuming a standard action). Channel Energy between combat waves — hit Selective Channel first. Smite Evil on the strongest demon at start of combat. Position on frontline with Kaede.",
    spells: [
      "Bless (L1) — cast at start of every dungeon level, covers the whole fight",
      "Divine Favor (L1) — +luck to attack/damage, cast before entering combat",
      "Protection from Evil (L1) — vs demon enchantments and summoning",
    ],
    mythic: "Mythic Companion. Autoleveling manages picks.",
  },
  "Camelia": {
    combat: "Open with Barkskin on Kaede and Sly pre-combat. In combat: Iceplant hex passively buffs her AC. Use StinkingCloud on grouped enemies, SickeningEntanglement for melee packs. Cure spells for healing when Daeran's channels are spent.",
    spells: [
      "Barkskin (L2) — cast on Kaede + Sly before every fight",
      "StinkingCloud (L3) — on groups of 3+ enemies",
      "SickeningEntanglement (L2) — roots and sickens melee packs",
      "DispelMagic (L3) — remove enemy buffs on priority targets",
    ],
  },
  "Lann": {
    combat: "Fire from a safe position — Point Blank Master prevents AoO. Use Ki True Strike on priority targets (touch attack auto-hit). Improved Precise Shot and Clustered Shots mean no penalties for firing into melee and all arrows count for DR bypass. Deadly Aim every attack — ranged Power Attack.",
    spells: [
      "Ki Barskin (Ki ability) — cast before each dungeon level if Ki available",
    ],
    attributes: ["WIS (primary — all attacks are WIS-based for Zen Archer)"],
  },
  "Woljif": {
    combat: "Setup flat-footed first: Ember Slumber, Kaede Cornugon+Shatter, or flanking. Then full-attack with both daggers (once main hand is swapped from Sickle). Invisibility pre-combat for guaranteed flat-footed on round 1. Weakening Wound on sneak attacks reduces enemy STR.",
    spells: [
      "Invisibility (L2) — cast pre-combat for flat-footed round 1",
      "Displacement (L3) — 50% miss chance, cast on Woljif before hard fights",
    ],
  },
  "Nenio": {
    combat: "Haste EVERY combat, no exceptions — it's the highest-value buff in the game (+1 attack to all frontliners). Glitterdust on fliers or clustered enemies (blinds + grounds). Displacement on Kaede before boss fights. Fireball for AoE damage on grouped enemies. Greater Spell Penetration ensures spells land on high-SR demons.",
    spells: [
      "Haste (L3) — EVERY combat, first priority",
      "Glitterdust (L2) — blind + ground fliers, disable groups",
      "Displacement (L3) — on Kaede before boss/hard encounters",
      "Fireball (L3) — AoE damage on packs",
      "Heroism (L3) — on frontliners for long dungeons",
    ],
  },
  "Ember": {
    combat: "Open with Slumber hex on the most dangerous enemy if not yet in combat (no save if surprise). Sleeping = flat-footed = sneak attacks + Coup de Grace available. Follow with Vulnerability Curse on the primary target. Use Precise Shot to support with crossbow while hexing.",
    spells: [
      "Slumber (hex) — most dangerous enemy, auto-success out of combat",
      "Vulnerability Curse (hex) — primary target for bonus damage dice",
      "Heroism (L3) — on frontliners between fights",
    ],
    mythic: "Mythic Companion. Ascendant Element Fire: Ember's fire spells bypass immunity and resistance — effective against fire-immune demons.",
  },
  "Daeran": {
    combat: "Use swift-action Channel Energy (Combat Healer revelation) to triage mid-combat without spending a standard action. Reserve standard-action Cure spells for critical healing. HoldPerson on priority enemy casters. Prayer (L3) before fights with many enemies.",
    spells: [
      "Prayer (L3) — +1 luck to all party rolls, -1 to all enemies",
      "Cure Serious Wounds (L3) — emergency healing",
      "HoldPerson (L2) — shut down enemy spellcasters",
      "Shield of Faith (L1) — +2 deflection AC on frontliners",
    ],
    mythic: "Mythic Companion T1. Combat Healer revelation (swift-action channel) taken ✔ — excellent. Azata Heritage: Emotion Aura gives minor party morale bonus passively.",
  },
  "SosielVaenic": {
    combat: "Cast Prayer (L3) every fight — it stacks with Bless and benefits the entire party. Prepare Divine Favor for frontliners. Cast ProtectionFromEnergy before major fights (fire resistance for the whole party). Use Glaive in melee only if there are no buffing actions left.",
    spells: [
      "Prayer (L3) — every fight, stacks with Bless",
      "Bless (L1) — same dungeon run as Prayer",
      "Divine Power (L4) — gives Sosiel full BAB if he needs to fight",
      "ProtectionFromEnergy (L3) — fire resistance on frontliners before boss fights",
      "Restoration (L4) — removes negative levels from demon drain abilities",
    ],
  },
  "Ulbrig": {
    combat: "Griffonheart Shifter: activate shapeshift form before combat. In shapeshift form natural attacks benefit from Master Shapeshifter damage bonus and Multiattack Shifter (reduced off-hand penalty). Position always flanking with Kaede — currently missing Outflank but flanking gives flat-footed to Woljif.",
    mythic: "Mythic Companion. Multiattack Shifter reduces multi-attack penalty in shapeshift — good pick.",
  },
  "Sly": {
    combat: "Always position flanking with Kaede. Sly's trip attempt on prone enemies makes them flat-footed. When Outflank is acquired, every Kaede crit triggers a free Sly AoO and vice versa.",
    attributes: [
      "STR — primary (Lv 7 pending: put +2 here, 12 → 14)",
      "INT — only enough to hit INT 3 (needed for Outflank)",
      "CON — secondary for HP and Fort save survivability",
    ],
  },
  "Regill": {
    combat: "DEX-based TWF with Fighters Finesse — attacks with the Gnome Hooked Hammer (double weapon). Cold Iron bypasses demon DR/cold iron. Position on frontline. Smite Chaos available as a Hellknight ability vs chaotic enemies.",
    spells: [],
    mythic: "Hellknight Order of the Godclaw. Adamantine Fullplate +2 provides DR 1/— from the adamantine property.",
  },
};

// ─── Party composition advice (update each session) ────────────────────────────

export const PARTY_ADVICE: PartyAdvice = {
  coverageNote: "Recommended 6: 2 frontliners, 2 arcane/divine casters, 1 ranged, 1 healer/utility. Covers Frontline ○○○○, Damage ○○○○, Healer ○○○○, Buffer ○○○, Control ○○○○, Utility ○○○.",
  slots: [
    {
      name: "Kaede",
      role: "PC — 2H Frontline / Debuffer",
      why: "Always in. Cornugon Smash + Shatter Defenses debuff chain benefits the entire party. Lead frontline with Sly.",
      priority: "core",
    },
    {
      name: "Nenio",
      role: "Arcane Caster — Haste / Control",
      why: "Currently benched but should be in every fight. Haste adds +1 attack to every frontliner per round — the highest-value single buff in the game. Fireball for AoE, Glitterdust for fliers.",
      priority: "core",
    },
    {
      name: "Daeran",
      role: "Healer / Oracle",
      why: "Swift-action channel via Combat Healer revelation lets him triage frontliners without pausing offense. Carry Cure Serious Wounds + Prayer. Hard to replace.",
      priority: "core",
    },
    {
      name: "Lann",
      role: "Ranged DPS — Zen Archer",
      why: "WIS-based Zen Archer with Clustered Shots and Improved Precise Shot. Fires safely from the back with no AoO. Top consistent ranged DPS in the party.",
      priority: "core",
    },
    {
      name: "Ember",
      role: "Control / Hex Debuffer",
      why: "Slumber hex shuts down dangerous enemies at the start of combat (auto-success if not yet in combat). Vulnerability Curse amplifies party damage. Hard to replicate elsewhere.",
      priority: "recommended",
    },
    {
      name: "Sosiel",
      role: "Divine Buffer / Backup Healer",
      why: "Prayer (L3) stacks with Bless and benefits the whole party every fight. Upgrade his gear first. Outperforms Camelia as a pure combat buffer.",
      priority: "recommended",
    },
  ],
  bench: [
    {
      name: "Seelah",
      reason: "Swap out for Sosiel — Sosiel's Prayer gives a stronger party-wide bonus. Seelah can come back in for long fights where her Lay on Hands burst healing is needed.",
    },
    {
      name: "Camelia",
      reason: "Camelia provides Barkskin and CC but overlaps with Sosiel (healer/buffer) and Ember (control). Rotate in when you need extra heal capacity or StinkingCloud for a specific dungeon.",
    },
    {
      name: "Ulbrig",
      reason: "Good frontliner but a 5th melee slot with no Outflank reduces synergy. Rotate in for fights that need extra frontline presence or to replace Kaede temporarily.",
    },
    {
      name: "Woljif",
      reason: "Strong sneak attacker but needs flat-footed setup. Rotate him in for dungeon exploration (Invisibility, Thievery, Stealth) and fights where Ember already provides flat-footed.",
    },
    {
      name: "Wenduag",
      reason: "Must be in every fight to close the XP gap (Lv 2 vs Lv 7). Once she reaches party level she becomes a strong second ranged DPS. Swap her in instead of Ulbrig or Woljif.",
    },
    {
      name: "Regill",
      reason: "Newly joined, 1 level behind. Keep him in for a few fights to catch up — then evaluate. His Cold Iron TWF is valuable but redundant with Kaede as primary frontliner.",
    },
  ],
  rotationTips: [
    "Wenduag MUST be in every combat until she reaches Lv 7. Swap out Ulbrig or Woljif to fit her in.",
    "Swap Camelia IN if Sosiel runs out of Prayer slots mid-dungeon — she has more heal spells.",
    "Swap Woljif IN for dungeon exploration: Thievery (traps/locks), Stealth (surprise rounds), and Invisibility sneak attack setup.",
    "Swap Seelah IN for boss fights: Smite Evil + Lay on Hands burst is strong when sustained healing matters less.",
    "Keep Regill active for 2–3 more areas to close the 1-level gap, then consider benching.",
  ],
};

// ─── Rest checklist (update each session) ─────────────────────────────────────

export const REST_CHECKLIST: string[] = [
  "Heal party to full: Daeran swift-channel (Combat Healer revelation) + Seelah Lay on Hands on injured frontliners. Channel after each short rest.",
  "Revive dead companions using camp rest or Scroll of Raise Dead before leaving.",
  "Memorize Kaede's L1 spells: Lead Blades x1 + Resist Energy Fire x2 (one for Kaede, one for Sly).",
  "Camellia spell prep: Barkskin (L2) x2 at minimum. StinkingCloud (L3) x1. SickeningEntanglement (L2) x1.",
  "Nenio spell prep: Haste (L3) x2. Glitterdust (L2) x2. Displacement (L3) x1. Fireball (L3) x1.",
  "Sosiel spell prep: Prayer (L3) x2. Bless (L1) x2. Divine Favor (L1) x2. ProtectionFromEnergy Fire (L3) x1 before demon fights.",
  "Daeran spell prep: Cure Serious Wounds (L3) x2. Prayer (L3) x1. ShieldOfFaith (L1) on frontliners.",
  "Assign camping roles: Kaede or Ulbrig on watch (high Perception). Woljif as scout if available.",
  "Check that Woljif has Invisibility (L2) memorized for pre-combat flat-footed setup.",
];

// ─── Shopping tips per character (Act 2 priorities) ────────────────────────────

export const SHOPPING_TIPS: Record<string, CharacterShoppingTip> = {
  "Kaede": {
    slotPriority: [
      { slot: "Head", lookFor: "Hat or Helm with skill bonus or INT/WIS — any +competence bonus helps" },
      { slot: "Feet", lookFor: "Boots of Elvenkind (+5 Stealth) or Boots of Speed (+30ft movement)" },
    ],
    itemPicks: ["Belt of Giant Strength +4 (Act 2 vendors — jump STR to 21+)", "Cold Iron Greatsword as backup if Finnean needs repair"],
  },
  "Seelah": {
    slotPriority: [
      { slot: "Belt", lookFor: "Belt of CON +2 or STR +2 for frontline survivability" },
      { slot: "Gloves", lookFor: "Gauntlets of Piercing (spell penetration) or STR bonus gloves" },
      { slot: "Wrist", lookFor: "Bracers of Deflection +1 or utility bracers" },
    ],
    itemPicks: ["Holy weapon or Holy enchant scroll for Smite Evil combo"],
  },
  "Lann": {
    slotPriority: [
      { slot: "Armor", lookFor: "Bracers of Armor +2 or +3 (monks can't wear regular armor — use bracers)" },
      { slot: "Belt", lookFor: "Belt of DEX +2 — WIS already high; DEX adds attack and AC" },
      { slot: "Ring 1", lookFor: "Ring of Protection +1 or +2 (deflection AC)" },
      { slot: "Ring 2", lookFor: "Ring of Protection +1 or utility ring" },
      { slot: "Neck", lookFor: "Amulet of Natural Armor +1 or +2" },
      { slot: "Head", lookFor: "Headband of WIS +2 if not already maxed; otherwise skill bonus headband" },
    ],
    itemPicks: ["Composite Longbow +1 or better with flaming/shock enchant for fire DR bypass"],
  },
  "Woljif": {
    slotPriority: [
      { slot: "Head", lookFor: "Hat of Heartening Song (+1 morale attack/saves) or INT headband" },
      { slot: "Neck", lookFor: "Amulet of Natural Armor +1 or DEX/utility amulet" },
      { slot: "Ring 1", lookFor: "Ring of Protection +1 or +2" },
      { slot: "Ring 2", lookFor: "Ring of Protection +1 or ability ring" },
      { slot: "Belt", lookFor: "Belt of DEX +2 (+1 attack and damage on all finesse attacks)" },
      { slot: "Gloves", lookFor: "Gloves of Dueling (+2 weapon training) or STR/DEX gloves" },
      { slot: "Armor", lookFor: "Leather Armor +2 or Mage Armor (he wears light/no armor)" },
    ],
    itemPicks: ["Main-hand dagger: Dagger of Life +1 or any Cold Iron dagger to bypass DR", "Swap Sickle of Falter to any +1 dagger to enable Finesse Training DEX-to-damage"],
  },
  "Nenio": {
    slotPriority: [
      { slot: "Ring 1", lookFor: "Ring of Protection +1 or +2 (AC keeps her alive longer)" },
      { slot: "Ring 2", lookFor: "Ring of Wizardry (extra spell slots) or protection ring" },
      { slot: "Belt", lookFor: "Belt of CON +2 — she needs HP, INT already 19 from headband" },
      { slot: "Wrist", lookFor: "Bracers of Deflection or utility bracers" },
      { slot: "Gloves", lookFor: "Gloves of Lore (+2 knowledge checks) or arcane focus gloves" },
    ],
    itemPicks: ["Robe of Arcane Heritage or Robe of the Archmagi if available in Act 2 shops"],
  },
  "Ember": {
    slotPriority: [
      { slot: "Armor", lookFor: "Robe +1 or +2 (Accursed Witch can wear robes — gives AC/saves bonus)" },
      { slot: "Ring 1", lookFor: "Ring of Protection +1 or +2" },
      { slot: "Ring 2", lookFor: "Ring of Protection or utility ring" },
      { slot: "Belt", lookFor: "Belt of CHA +2 (her CHA is 18 — +2 raises hex DCs and spell power)" },
      { slot: "Gloves", lookFor: "Any bonus gloves (skill, saves, or stat)" },
      { slot: "Wrist", lookFor: "Bracers of Deflection +1" },
    ],
    itemPicks: ["Belt of CHA +2 is her highest-value purchase — raises all hex and spell DCs"],
  },
  "Daeran": {
    slotPriority: [
      { slot: "Head", lookFor: "Headband of CHA +2 (he's CHA 19 — going to 21 gives +1 to all Oracle spell DCs and channel)" },
      { slot: "Ring 1", lookFor: "Ring of Protection +1 or +2" },
      { slot: "Ring 2", lookFor: "Ring of Protection or utility ring" },
      { slot: "Gloves", lookFor: "Gloves of Healing (+1 to healing spell output) or saves gloves" },
    ],
    itemPicks: ["Headband of CHA +2 is his best purchase — shop for it at Crusader's Camp vendors"],
  },
  "SosielVaenic": {
    slotPriority: [
      { slot: "Head", lookFor: "Headband of WIS +2 (his WIS is 19 — going to 21 raises all Cleric spell DCs by 1)" },
      { slot: "Neck", lookFor: "Amulet of Natural Armor +1 or +2" },
      { slot: "Ring 1", lookFor: "Ring of Protection +1 or +2" },
      { slot: "Ring 2", lookFor: "Ring of Protection +1" },
      { slot: "Belt", lookFor: "Belt of CON +2 or WIS +2 depending on headband choice" },
      { slot: "Gloves", lookFor: "Gloves of Lore or any utility gloves" },
      { slot: "Wrist", lookFor: "Bracers of Deflection or saves bracers" },
    ],
    itemPicks: [
      "Buy a +2 Glaive or Spear for him — his Standard Glaive is vendor trash",
      "Buy +2 Breastplate or Chainmail for him — Standard Scalemail has no enchantment",
    ],
  },
  "Ulbrig": {
    slotPriority: [
      { slot: "Head", lookFor: "Helm with STR/CON bonus, or Hat of Heartening Song" },
      { slot: "Belt", lookFor: "Belt of CON +2 or STR +2 (natural attacks scale with STR in shapeshift)" },
      { slot: "Ring 2", lookFor: "Ring of Protection +1" },
      { slot: "Wrist", lookFor: "Bracers of Deflection or saves bracers (Shifters can use in shapeshift form)" },
    ],
    itemPicks: ["Amulet of Mighty Fists +2 when available — stacks with Ulbrig's natural attacks"],
  },
  "Camelia": {
    slotPriority: [
      { slot: "Ring 1", lookFor: "Ring of Protection +1 or +2" },
      { slot: "Ring 2", lookFor: "Ring of Protection or utility ring" },
      { slot: "Gloves", lookFor: "Gloves of DEX +2 or skill bonus gloves" },
      { slot: "Wrist", lookFor: "Bracers of Deflection or saves bracers" },
    ],
  },
  "Regill": {
    slotPriority: [
      { slot: "Belt", lookFor: "Belt of STR +2 or DEX +2 (TWF with Fighters Finesse benefits from either)" },
      { slot: "Head", lookFor: "Helm with saves bonus or Hellknight-themed item" },
      { slot: "Ring 2", lookFor: "Ring of Protection +1" },
      { slot: "Wrist", lookFor: "Bracers of Deflection or saves bracers" },
      { slot: "Gloves", lookFor: "Gloves of Dueling (+2 weapon training bonus) or STR gloves" },
      { slot: "Shoulders", lookFor: "Cloak of Resistance +2 (his saves are bare)" },
    ],
  },
  "Wenduag": {
    slotPriority: [
      { slot: "Armor", lookFor: "Leather Armor +1 or +2 (she's a light armor archer)" },
      { slot: "Neck",  lookFor: "Amulet of Natural Armor +1" },
      { slot: "Ring 1", lookFor: "Ring of Protection +1" },
      { slot: "Ring 2", lookFor: "Ring of Protection +1" },
      { slot: "Belt", lookFor: "Belt of DEX +2 (+1 attack on all ranged attacks)" },
      { slot: "Head", lookFor: "Hat or headband with skill/stat bonus" },
      { slot: "Shoulders", lookFor: "Cloak of Resistance +1" },
    ],
    itemPicks: ["Standard Longbow should be replaced: buy a +1 Composite Longbow (STR-rated) or Cold Iron bow"],
  },
};

// ─── Consumable / supply priorities ───────────────────────────────────────

export const CONSUMABLE_TIPS: string[] = [
  "Potions of Cure Moderate Wounds — carry 6–8; use mid-combat when channels are spent",
  "Scrolls of Raise Dead — carry 2–3; essential for reviving party members without camping",
  "Potions of Resist Energy (Fire) — carry 4+; cast on Kaede and Sly before every demon encounter where party buffs are unavailable",
  "Potions of Invisibility — carry 2–3 for Woljif; pre-combat flat-footed setup for full sneak attack round 1",
  "Scrolls of Restoration — carry 2; removes negative levels (from undead drain/wraith touch, very common in Act 2 dungeons)",
  "Alchemist's Fire / Acid Flask — carry 4–6 each; useful vs swarms that are immune to weapons",
  "Camping Rations — keep 10+ in stash; required to rest in the field without a base camp",
  "Scrolls of Protection from Energy (communal) — fire resistance for the whole party before entering fire-heavy areas",
  "Wand of Cure Light Wounds — cheap healing tool; buy one and assign to a character with Use Magic Device",
];

// ─── Save-driven guide generation ────────────────────────────────────────────

function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function hasFeat(char: CharacterData, query: string): boolean {
  return (char.feats ?? []).some((f) => norm(f.name).includes(norm(query)));
}

function hasKnownSpell(char: CharacterData, query: string): boolean {
  return (char.spellbook?.knownSpells.flat() ?? []).some((s) => norm(s.name).includes(norm(query)));
}

function hasPreparedSpell(char: CharacterData, query: string): boolean {
  return (char.spellbook?.preparedSpells.flatMap((l) => l.slots) ?? []).some((s) => norm(s.spellName).includes(norm(query)));
}

function spellDisplay(char: CharacterData, query: string): string | undefined {
  return (char.spellbook?.knownSpells.flat() ?? []).find((s) => norm(s.name).includes(norm(query)))?.displayName;
}

function getEquipment(char: CharacterData, slot: string) {
  return (char.equipment ?? []).find((e) => e.slot === slot);
}

function getMainHand(char: CharacterData) {
  return getEquipment(char, "Main Hand");
}

function getArmor(char: CharacterData) {
  return getEquipment(char, "Armor");
}

function hasEmptySlot(char: CharacterData, slot: string): boolean {
  return (char.emptySlots ?? []).includes(slot);
}

function isDead(char: CharacterData): boolean {
  return (char.stats?.hp ?? 1) <= 0;
}

function isUnderleveled(char: CharacterData, maxLevel: number): number {
  const lv = char.class?.level ?? 0;
  return Math.max(0, maxLevel - lv);
}

function className(char: CharacterData): string {
  return char.class?.className ?? "";
}

function isMelee(char: CharacterData): boolean {
  const cls = norm(className(char));
  const mh = norm(getMainHand(char)?.name);
  if (/monk|fighter|paladin|barbarian|bloodrager|cavalier|slayer|rogue|shifter|hellknight|ranger/.test(cls) && !/bow|crossbow/.test(mh)) return true;
  return hasFeat(char, "Power Attack") || hasFeat(char, "Outflank") || hasFeat(char, "Two Weapon Fighting");
}

function isRanged(char: CharacterData): boolean {
  const cls = norm(className(char));
  const mh = norm(getMainHand(char)?.name);
  return /zenarcher|archer|ranger/.test(cls) || /bow|crossbow/.test(mh) || hasFeat(char, "Point Blank Shot") || hasFeat(char, "Deadly Aim");
}

function isArcaneCaster(char: CharacterData): boolean {
  return /wizard|sorcerer|arcanist|witch|magus/.test(norm(className(char)));
}

function isDivineCaster(char: CharacterData): boolean {
  return /cleric|oracle|shaman|paladin|druid|ranger/.test(norm(className(char)));
}

function isSupportCaster(char: CharacterData): boolean {
  return isArcaneCaster(char) || isDivineCaster(char);
}

function primaryStatSuggestions(char: CharacterData): string[] {
  const cls = norm(className(char));
  if (/zenarcher|monk/.test(cls)) return ["WIS", "DEX", "CON"];
  if (/wizard|arcanist/.test(cls)) return ["INT", "DEX", "CON"];
  if (/witch|shaman|cleric|druid/.test(cls)) return ["WIS", "CON", "DEX"];
  if (/oracle|paladin|sorcerer|bard/.test(cls)) return ["CHA", "CON", "DEX"];
  if (isRanged(char)) return ["DEX", "CON", "WIS"];
  return ["STR", "CON", "WIS"];
}

function roleScoreDots(n: number): string {
  return "○".repeat(Math.max(0, Math.min(5, Math.round(n))));
}

function importantSpells(char: CharacterData): string[] {
  const priorities = ["Haste", "Prayer", "Barkskin", "Displacement", "Glitterdust", "Fireball", "Bless", "Heroism", "Invisibility", "Protection From Energy", "Resist Energy", "Cure Serious Wounds", "Restoration"];
  const known = char.spellbook?.knownSpells.flat() ?? [];
  const out: string[] = [];
  for (const wanted of priorities) {
    const spell = known.find((s) => norm(s.name).includes(norm(wanted)));
    if (spell) out.push(spell.displayName || spell.name);
  }
  return dedupe(out).slice(0, 5);
}

function bestHealer(chars: CharacterData[]): CharacterData | undefined {
  const healingWeight = (char: CharacterData): number => {
    let score = 0;
    if (hasFeat(char, "Channel Energy")) score += 4;
    score += (char.spellbook?.knownSpells.flat() ?? []).filter((s) => /cure/i.test(s.name)).length;
    if (/cleric|oracle|paladin|shaman|druid/.test(norm(className(char)))) score += 2;
    return score;
  };
  return [...chars].sort((a, b) => healingWeight(b) - healingWeight(a))[0];
}

function synergyCards(party: PartyData): GuideSynergy[] {
  const chars = party.characters.filter((c) => c.inParty);
  const synergies: GuideSynergy[] = [];

  const outflankers = chars.filter((c) => hasFeat(c, "Outflank"));
  if (outflankers.length >= 2) {
    synergies.push({
      icon: "🎯",
      title: "Outflank chain online",
      body: `${outflankers.map((c) => c.name).join(", ")} can share flank pressure and generate extra attacks of opportunity on crits. Keep your melee core flanking the same target.`,
    });
  }

  const intimidators = chars.filter((c) => hasFeat(c, "Cornugon Smash") || hasFeat(c, "Shatter Defenses"));
  if (intimidators.length > 0) {
    synergies.push({
      icon: "😵",
      title: "Shaken → flat-footed pressure",
      body: `${intimidators.map((c) => c.name).join(", ")} can pressure priority targets by stacking shaken and flat-footed effects. Focus fire one dangerous enemy instead of splitting damage.`,
    });
  }

  const slumberCaster = chars.find((c) => hasFeat(c, "Slumber") || hasKnownSpell(c, "Slumber"));
  const opportunists = chars.filter((c) => c !== slumberCaster && (hasFeat(c, "Finesse Training Dagger") || hasFeat(c, "Shatter Defenses") || hasFeat(c, "Outflank")));
  if (slumberCaster && opportunists.length > 0) {
    const opportunistText = opportunists.length === 1
      ? `${opportunists[0].name} is`
      : `${opportunists.map((c) => c.name).join(", ")} are`;
    synergies.push({
      icon: "😴",
      title: "Control opens burst windows",
      body: `${slumberCaster.name} can create easy focus targets, and ${opportunistText} best positioned to punish disabled or flat-footed enemies immediately.`,
    });
  }

  const hasteCaster = chars.find((c) => hasKnownSpell(c, "Haste"));
  const martialCount = chars.filter((c) => isMelee(c) || isRanged(c)).length;
  if (hasteCaster && martialCount >= 3) {
    synergies.push({
      icon: "⚡",
      title: "Haste multiplies the whole party",
      body: `${hasteCaster.name} knows Haste, and your active party has ${martialCount} weapon users who all benefit from extra attacks, speed, and AC. Cast it early in every meaningful fight.`,
    });
  }

  const healer = bestHealer(chars);
  const barkskinCaster = chars.find((c) => hasKnownSpell(c, "Barkskin"));
  if (healer && barkskinCaster) {
    synergies.push({
      icon: "💉",
      title: "Sustain + prebuff core",
      body: healer.uniqueId === barkskinCaster.uniqueId
        ? `${healer.name} can handle both prebuff coverage and emergency recovery, which reduces attrition before long dungeon pushes.`
        : `${healer.name} covers recovery while ${barkskinCaster.name} supplies durable prebuffs. Use that pairing to reduce attrition before long dungeon pushes.`,
    });
  }

  return synergies.slice(0, 6);
}

function buildRecommendation(char: CharacterData, maxLevel: number): GuideRecommendation {
  const gap = isUnderleveled(char, maxLevel);
  const mainHand = getMainHand(char);
  const armor = getArmor(char);
  const knownHaste = hasKnownSpell(char, "Haste");
  const preparedHaste = hasPreparedSpell(char, "Haste");
  const knownPrayer = hasKnownSpell(char, "Prayer");
  const preparedPrayer = hasPreparedSpell(char, "Prayer");
  const knownBarkskin = hasKnownSpell(char, "Barkskin");
  const preparedBarkskin = hasPreparedSpell(char, "Barkskin");
  const weakItems = (char.equipment ?? []).filter((e) =>
    /^Standard\s|^Standart\s/i.test(e.name) && ["Armor", "Main Hand", "Off Hand"].includes(e.slot)
  );

  if (isDead(char)) {
    return {
      feat: "Revive before the next outing",
      why: "This character is dead in the current save. Use Raise Dead before planning tactics or spell prep around them.",
      priority: "high",
    };
  }

  if (gap >= 4) {
    return {
      feat: "Catch-up priority",
      why: `${char.name} is ${gap} levels behind the party ceiling. Keep them in the active party until they close the XP gap so gear and tactics recommendations start paying off.`,
      priority: "high",
    };
  }

  if (hasFeat(char, "Finesse Training Dagger") && mainHand && !/dagger/i.test(mainHand.name)) {
    return {
      feat: "Fix weapon mismatch",
      why: `Main hand is ${mainHand.name}, but this build only gets full DEX-to-damage with daggers. Swap immediately instead of waiting for another level-up.`,
      priority: "high",
      spell: hasKnownSpell(char, "Invisibility") ? `${spellDisplay(char, "Invisibility") ?? "Invisibility"} improves opening sneak attacks.` : undefined,
    };
  }

  if (knownHaste && !preparedHaste) {
    return {
      feat: "Prepare Haste every rest",
      why: "Haste is one of the strongest party-wide buffs in Wrath. If it is known but not prepared, your best opener is sitting unused.",
      priority: "high",
      spell: spellDisplay(char, "Haste") ?? "Haste",
    };
  }

  if (knownPrayer && !preparedPrayer) {
    return {
      feat: "Keep Prayer ready",
      why: "Prayer is a high-value fight opener because it buffs allies and debuffs enemies at the same time. Put at least one copy into daily prep.",
      priority: "med",
      spell: spellDisplay(char, "Prayer") ?? "Prayer",
    };
  }

  if (knownBarkskin && !preparedBarkskin) {
    return {
      feat: "Prebuff Barkskin users",
      why: "Barkskin gives reliable AC value before the fight even starts. If the spell is known, it should usually be prepared for the frontline.",
      priority: "med",
      spell: spellDisplay(char, "Barkskin") ?? "Barkskin",
    };
  }

  if (weakItems.length > 0) {
    return {
      feat: "Upgrade weak gear first",
      why: `Current save still shows starting-tier gear: ${weakItems.map((e) => `${e.slot} ${e.name}`).join(", ")}. Replacing that is a bigger gain than waiting for the next feat.`,
      priority: "high",
    };
  }

  if ((char.emptySlots?.length ?? 0) > 1) {
    return {
      feat: "Fill missing accessory slots",
      why: `Open slots (${(char.emptySlots ?? []).join(", ")}) are leaving free stats on the table. Even low-tier rings, cloaks, belts, or bracers matter at this stage.`,
      priority: "med",
    };
  }

  if (char.isPlayerCharacter && hasFeat(char, "Power Attack") && !hasFeat(char, "Furious Focus") && (char.class?.level ?? 0) >= 5) {
    return {
      feat: "Complete the Power Attack chain",
      why: "You already lean on Power Attack. Furious Focus is the most efficient follow-up if you want cleaner first-hit reliability on your opener.",
      priority: "high",
    };
  }

  if (isMelee(char) && !hasFeat(char, "Outflank") && (char.class?.level ?? 0) >= 4 && !char.isPlayerCharacter) {
    return {
      feat: "Play for flank pressure",
      why: "This companion is strongest when they stay in the flank with the rest of the melee line. Even with autoleveling on, positioning will matter more than a perfect future feat pick.",
      priority: "low",
    };
  }

  return {
    feat: "Stay on current track",
    why: `${char.name} does not have an urgent build correction in the current save. Focus on positioning, prebuffs, and keeping gear current.`,
    priority: "low",
  };
}

function buildRecommendations(party: PartyData): Record<string, GuideRecommendation> {
  const maxLevel = Math.max(1, ...party.characters.map((c) => c.class?.level ?? 1));
  return Object.fromEntries(party.characters.map((char) => [char.name, buildRecommendation(char, maxLevel)]));
}

function mythicAdvice(char: CharacterData): string | undefined {
  if (!char.mythicPath) return undefined;
  if (char.mythicPath === "Mythic Companion") return `This companion is on mythic companion progression at tier ${char.mythicLevel ?? "?"}; treat mythic choices as preset and focus your decisions on positioning, spell prep, and gear.`;
  if (char.mythicPath === "Mythic Hero") return `Current mythic path is still ${char.mythicPath} tier ${char.mythicLevel ?? "?"}. Future path-specific planning should stay flexible until the next mythic choice is locked in.`;
  return `${char.mythicPath} tier ${char.mythicLevel ?? "?"} is active in the current save. Prioritise abilities and spells that reinforce ${char.name}'s existing class role instead of splitting focus.`;
}

function buildTactic(char: CharacterData): CharacterTactics {
  const combat: string[] = [];

  if (isMelee(char)) combat.push("Open by taking or maintaining a flank on the highest-value melee target.");
  if (hasFeat(char, "Power Attack")) combat.push("Keep Power Attack on when accuracy is comfortable and turn it into burst on durable targets.");
  if (hasFeat(char, "Cornugon Smash") || hasFeat(char, "Shatter Defenses")) combat.push("Pressure one target at a time so shaken and flat-footed effects convert into faster kills.");
  if (isRanged(char)) combat.push("Stay behind the frontline and full-attack whenever you can instead of spending turns repositioning.");
  if (hasFeat(char, "Finesse Training Dagger")) combat.push("Attack from flanks, stealth, or invisibility setups so precision damage lands before enemies can stabilize.");
  if (isArcaneCaster(char) && hasKnownSpell(char, "Haste")) combat.push("Cast Haste early in real fights, then shift into control or AoE based on enemy count.");
  if (hasKnownSpell(char, "Slumber")) combat.push("Open on the most dangerous non-immune enemy with Slumber or your best control effect before the melee line commits.");
  if (isDivineCaster(char) && (hasKnownSpell(char, "Prayer") || hasKnownSpell(char, "Bless"))) combat.push("Use your first turn on party-wide buffs unless someone is about to drop.");
  if (hasFeat(char, "Channel Energy") || hasKnownSpell(char, "Cure")) combat.push("Save emergency healing for turns where it prevents a knockout, not for topping people off mid-fight.");
  if (hasKnownSpell(char, "Barkskin")) combat.push("Apply Barkskin before combat starts instead of spending combat turns on long-duration buffs.");

  return {
    combat: combat.length > 0 ? combat.join(" ") : "No special tactical branch detected from the current save; play to this character's class role and current gear.",
    spells: importantSpells(char),
    mythic: mythicAdvice(char),
    attributes: primaryStatSuggestions(char),
  };
}

function buildTactics(party: PartyData): Record<string, CharacterTactics> {
  return Object.fromEntries(party.characters.map((char) => [char.name, buildTactic(char)]));
}

function maxRoleScores(chars: { scores: RoleScores }[]): RoleScores {
  const out: RoleScores = { frontline: 0, damage: 0, healer: 0, buffer: 0, control: 0, utility: 0 };
  for (const char of chars) {
    for (const key of Object.keys(out) as (keyof RoleScores)[]) {
      out[key] = Math.max(out[key], char.scores[key]);
    }
  }
  return out;
}

function buildPartyAdvice(party: PartyData): PartyAdvice {
  const composition = analyzeComposition(party, getBuilds());
  const byId = new Map(composition.characters.map((c) => [c.characterId, c]));
  const activeChars = party.characters.filter((c) => c.inParty);
  const campChars = party.characters.filter((c) => !c.inParty);
  const activeProfiles = composition.characters.filter((c) => activeChars.some((p) => p.uniqueId === c.characterId));
  const activeScores = maxRoleScores(activeProfiles);
  const gaps = (Object.entries(activeScores) as [keyof RoleScores, number][]).filter(([, v]) => v < 3).map(([k]) => k);

  const slots: PartySlotAdvice[] = activeChars.map((char) => {
    const profile = byId.get(char.uniqueId);
    const reasons: string[] = [];
    if (char.isPlayerCharacter) reasons.push("player character anchor");
    if ((profile?.scores.healer ?? 0) >= 4) reasons.push("primary healing");
    if ((profile?.scores.buffer ?? 0) >= 4) reasons.push("party buffs");
    if ((profile?.scores.frontline ?? 0) >= 4) reasons.push("frontline stability");
    if ((profile?.scores.control ?? 0) >= 4) reasons.push("crowd control");
    if (isUnderleveled(char, Math.max(...party.characters.map((c) => c.class?.level ?? 1))) >= 3) reasons.push("needs catch-up XP");

    const top = Math.max(profile?.scores.frontline ?? 0, profile?.scores.damage ?? 0, profile?.scores.healer ?? 0, profile?.scores.buffer ?? 0, profile?.scores.control ?? 0);
    const priority: PartySlotAdvice["priority"] =
      char.isPlayerCharacter || (profile?.scores.healer ?? 0) >= 4 || (profile?.scores.buffer ?? 0) >= 4 || (profile?.scores.frontline ?? 0) >= 4
        ? "core"
        : top >= 3 ? "recommended" : "situational";

    return {
      name: char.name,
      role: profile ? `${profile.primaryRole} / ${profile.secondaryRole}` : (char.class?.className ?? "Unknown role"),
      why: reasons.length > 0 ? `Currently active because they provide ${reasons.join(", ")}.` : "Currently active and not showing a clear composition liability in the save.",
      priority,
    };
  });

  const bench = campChars.map((char) => {
    const profile = byId.get(char.uniqueId);
    const levelGap = isUnderleveled(char, Math.max(...party.characters.map((c) => c.class?.level ?? 1)));
    if (levelGap >= 2) return { name: char.name, reason: `Behind the active party by ${levelGap} levels. Rotate in for catch-up XP when the next area is manageable.` };
    const fills = gaps.filter((gap) => (profile?.scores[gap] ?? 0) >= 3);
    if (fills.length > 0) return { name: char.name, reason: `Best bench option if you want more ${fills.join(", ")} in the active six.` };
    return { name: char.name, reason: `Mostly overlaps with roles already covered by the active party. Swap in for personal preference, quest flavor, or specific utility.` };
  });

  const rotationTips: string[] = [];
  if (gaps.length > 0) rotationTips.push(`Current active party is weakest on ${gaps.join(", ")}. Use camp companions who score higher in those roles when an area punishes that gap.`);
  const laggards = party.characters.filter((c) => isUnderleveled(c, Math.max(...party.characters.map((p) => p.class?.level ?? 1))) >= 2);
  if (laggards.length > 0) rotationTips.push(`${laggards.map((c) => c.name).join(", ")} are behind on levels; rotate them into safer fights to close the gap.`);
  if (activeChars.some((c) => hasKnownSpell(c, "Haste"))) rotationTips.push("Keep your Haste caster in the active six for difficult encounters; it multiplies your whole physical damage core.");
  if (campChars.some((c) => hasKnownSpell(c, "Barkskin"))) rotationTips.push("If the frontline starts folding, rotate in a Barkskin caster or ensure prebuff coverage before long maps.");

  const coverageNote = `Current active party coverage — Frontline ${roleScoreDots(activeScores.frontline)}, Damage ${roleScoreDots(activeScores.damage)}, Healer ${roleScoreDots(activeScores.healer)}, Buffer ${roleScoreDots(activeScores.buffer)}, Control ${roleScoreDots(activeScores.control)}, Utility ${roleScoreDots(activeScores.utility)}.`;

  return { slots, bench, rotationTips: dedupe(rotationTips), coverageNote };
}

function slotLookFor(char: CharacterData, slot: string): string {
  const primary = primaryStatSuggestions(char)[0];
  switch (slot) {
    case "Main Hand":
      if (hasFeat(char, "Finesse Training Dagger")) return "a better dagger, ideally enchanted or cold iron";
      if (isRanged(char)) return "an upgraded bow/crossbow that matches the build";
      return "an upgraded main weapon with enhancement or useful damage properties";
    case "Armor":
      return /monk|wizard|witch|sorcerer|arcanist/.test(norm(className(char)))
        ? "Bracers of Armor or other AC gear for an unarmored build"
        : "armor with an enhancement bonus appropriate to current level";
    case "Belt":
      return `a belt that boosts ${primary}`;
    case "Head":
      return /wis|cha|int/i.test(primary) ? `a headband that boosts ${primary}` : "a helm or head slot item with defense or utility";
    case "Ring 1":
    case "Ring 2":
      return "a Ring of Protection or another defensive/utility ring";
    case "Neck":
      return "an Amulet of Natural Armor or another defensive neck item";
    case "Shoulders":
      return "a Cloak of Resistance or another save-boosting cloak";
    case "Wrist":
      return "bracers that improve AC, saves, or utility";
    case "Gloves":
      return `gloves that boost ${primary} or otherwise reinforce the build`;
    case "Feet":
      return "boots that improve movement, saves, or positioning";
    default:
      return "a slot-appropriate upgrade";
  }
}

function buildShoppingTips(party: PartyData): Record<string, CharacterShoppingTip> {
  const out: Record<string, CharacterShoppingTip> = {};
  for (const char of party.characters) {
    const slotPriority = (char.emptySlots ?? []).map((slot) => ({ slot, lookFor: slotLookFor(char, slot) }));
    const itemPicks: string[] = [];
    const mainHand = getMainHand(char);
    const armor = getArmor(char);
    if (mainHand && /^Standard\s|^Standart\s/i.test(mainHand.name)) itemPicks.push(`Replace ${mainHand.name} with an enchanted version that actually matches ${char.name}'s role.`);
    if (armor && /^Standard\s|^Standart\s/i.test(armor.name)) itemPicks.push(`Replace ${armor.name} with upgraded armor or defensive gear; it is lagging behind current level.`);
    if (hasFeat(char, "Finesse Training Dagger") && mainHand && !/dagger/i.test(mainHand.name)) itemPicks.push("Buy or swap to any dagger so the build gets DEX-to-damage immediately.");
    if (slotPriority.length > 0 || itemPicks.length > 0) out[char.name] = { slotPriority, itemPicks: dedupe(itemPicks) };
  }
  return out;
}

function buildRestChecklist(party: PartyData): string[] {
  const out: string[] = [];
  const dead = party.characters.filter(isDead);
  if (dead.length > 0) out.push(`Revive ${dead.map((c) => c.name).join(", ")} before leaving camp. Resting alone will not fix dead companions.`);

  const injured = party.characters.filter((c) => (c.stats?.hpMax ?? 1) > 0 && (c.stats?.hp ?? 0) / (c.stats?.hpMax ?? 1) < 0.7 && !isDead(c));
  if (injured.length > 0) out.push(`Heal up ${injured.map((c) => c.name).join(", ")} before the next push so your first real fight does not start with a resource deficit.`);

  for (const char of party.characters) {
    if (hasKnownSpell(char, "Haste") && !hasPreparedSpell(char, "Haste")) out.push(`${char.name}: prepare ${spellDisplay(char, "Haste") ?? "Haste"} before resting out of camp; it should be available for hard fights.`);
    if (hasKnownSpell(char, "Prayer") && !hasPreparedSpell(char, "Prayer")) out.push(`${char.name}: add ${spellDisplay(char, "Prayer") ?? "Prayer"} to daily prep for party-wide value.`);
    if (hasKnownSpell(char, "Barkskin") && !hasPreparedSpell(char, "Barkskin")) out.push(`${char.name}: prepare ${spellDisplay(char, "Barkskin") ?? "Barkskin"} so the frontline gets prebuffed after rest.`);
    if (hasKnownSpell(char, "Invisibility") && !hasPreparedSpell(char, "Invisibility") && hasFeat(char, "Finesse Training Dagger")) out.push(`${char.name}: keep ${spellDisplay(char, "Invisibility") ?? "Invisibility"} available if you want stronger opener positioning.`);
  }

  if (party.meta.areaTips.some((tip) => /fire/i.test(tip))) out.push("Current area tips imply fire pressure; prep or stock Resist Energy / Protection From Energy before setting out.");
  if (party.characters.some((c) => hasKnownSpell(c, "Raise Dead"))) out.push("If someone can cast Raise Dead from a spellbook, check that expensive material components are in inventory before leaving vendors behind.");

  return dedupe(out).slice(0, 8);
}

function buildConsumableTips(party: PartyData): string[] {
  const out: string[] = [];
  const meleeCount = party.characters.filter((c) => c.inParty && isMelee(c)).length;
  const healerCount = party.characters.filter((c) => c.inParty && (hasFeat(c, "Channel Energy") || hasKnownSpell(c, "Cure"))).length;

  if (party.characters.some(isDead)) out.push("Carry at least one Scroll of Raise Dead so the next death does not force a retreat.");
  if (healerCount === 0) out.push("No strong healer is currently active — carry extra Cure pots and emergency healing scrolls.");
  else out.push("Carry a stack of Cure Moderate or Cure Serious consumables so channels and spell slots are not your only recovery plan.");
  if (party.meta.areaTips.some((tip) => /fire/i.test(tip))) out.push("Bring Resist Energy / Protection From Energy consumables for fire-heavy encounters in the current area.");
  if (party.characters.some((c) => hasKnownSpell(c, "Restoration"))) out.push("Keep one Restoration scroll or equivalent backup in case negative levels land at the wrong time.");
  else out.push("Carry Restoration scrolls because the current party cannot guarantee on-demand recovery from negative levels.");
  if (party.characters.some((c) => hasKnownSpell(c, "Invisibility") || hasFeat(c, "Finesse Training Dagger"))) out.push("Invisibility potions or scrolls are valuable for scouting and for setting up precision-damage openers.");
  if (meleeCount >= 2) out.push("Stock a few Enlarge Person or defensive consumables for the frontline so hard fights do not depend entirely on spell slots.");
  out.push("Keep camping rations and a wand-style healing item in reserve so rests and cleanup do not consume your best spell slots.");

  return dedupe(out).slice(0, 8);
}

// ─── Public API ────────────────────────────────────────────────────

export function getBuildGuide(party: PartyData): BuildGuideData {
  return {
    issues: detectIssues(party),
    synergies: synergyCards(party),
    recommendations: buildRecommendations(party),
    featNotes: FEAT_ANALYSIS as Record<string, { note: string; status: "good" | "warn" | "bad" | "info" }>,
    tactics: buildTactics(party),
    restChecklist: buildRestChecklist(party),
    shoppingTips: buildShoppingTips(party),
    consumableTips: buildConsumableTips(party),
    partyAdvice: buildPartyAdvice(party),
    provenance: {
      issues: "save",
      synergies: "save",
      recommendations: "save",
      featNotes: "reference",
      tactics: "save",
      restChecklist: "save",
      shoppingTips: "save",
      consumableTips: "save",
      partyAdvice: "save",
    },
  };
}
