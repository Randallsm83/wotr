/**
 * Generates party-guide.html from the current save file.
 * Run: bun run scripts/gen-party-guide.ts
 */
import { parseSave, listSaves } from "../src/server/services/save-parser.ts";
import { analyzeComposition } from "../src/server/services/party-builder.ts";
import { getBuilds } from "../src/server/services/build-store.ts";
import fs from "fs";
import path from "path";

const data = await parseSave();
if (!data) { console.error("No save found"); process.exit(1); }

const composition = analyzeComposition(data, getBuilds());

// ─── helpers ──────────────────────────────────────────────────────────────────

function hpColor(hp: number, max: number): string {
  if (hp <= 0) return "#e05a5a";
  const pct = hp / max;
  if (pct < 0.3) return "#e39400";
  if (pct < 0.7) return "#f2ce00";
  return "#5ccc96";
}

function hpPct(hp: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (hp / max) * 100));
}

function humanFeat(name: string): string {
  return name
    .replace(/Feature$/, "").replace(/Feat$/, "").replace(/Selection.*/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ").trim();
}

function humanItem(name: string): string {
  return name
    .replace(/Item$/, "").replace(/Plus(\d)/, "+$1").replace(/(\d)$/, " +$1")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ").trim();
}

function humanClass(name: string): string {
  return name.replace(/Class$/, "").replace(/Archetype$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

function sign(n: number): string { return n >= 0 ? `+${n}` : `${n}`; }

const FEAT_ANALYSIS: Record<string, { note: string; status: "good" | "warn" | "bad" | "info" }> = {
  TwoWeaponFighting:      { note: "TWF core — requires dual one-handed weapons",             status: "good" },
  DoubleSlice:            { note: "Full STR to off-hand attacks",                            status: "good" },
  PowerAttackFeature:     { note: "−1 hit / +2 dmg per 4 BAB",                              status: "good" },
  FuriousFocus:           { note: "Negates Power Attack penalty on first attack",           status: "good" },
  FavoriteTerrainAbyss:   { note: "+2 perception/stealth/initiative in Abyssal terrain",    status: "info" },
  RangerStyleMenacingSelection2: { note: "Menacing combat style: +2 intimidate when flanking", status: "info" },
  AnimalCompanionFeatureDog:    { note: "Dog companion — Stomper",                          status: "info" },
  AnimalCompanionSelectionRanger: { note: "Ranger animal companion progression",             status: "info" },
  Dodge:                  { note: "+1 Dodge AC — stacks with everything",                    status: "good" },
  ShieldFocus:            { note: "+1 Shield AC",                                            status: "good" },
  ArmorFocusHeavy:        { note: "+1 AC in heavy armor",                                   status: "good" },
  ArmorFocusSelection:    { note: "Armor Focus selection",                                   status: "info" },
  MercySickened:          { note: "Paladin Mercy: cures sickened on lay on hands",          status: "good" },
  WeaponFinesse:          { note: "Use DEX for attack rolls with light/finesse weapons",     status: "good" },
  ShamanHexIceplantFeature: { note: "Iceplant Hex: +2 Natural Armor AC",                   status: "good" },
  CombatReflexes:         { note: "Extra AoO per round equal to DEX bonus",                 status: "good" },
  PointBlankShot:         { note: "+1 attack/damage within 30ft",                           status: "good" },
  PreciseShot:            { note: "No −4 penalty for shooting into melee",                  status: "good" },
  ZenArcherWayOfTheBowLongbowFocus: { note: "Zen Archer: Weapon Focus with longbow",      status: "good" },
  DeadlyAimFeature:       { note: "Ranged Power Attack: −1 hit / +2 dmg",                  status: "good" },
  PointBlankMaster:       { note: "No AoO from ranged attacks while threatened",            status: "good" },
  KiTrueStrikeFeature:    { note: "Spend 1 Ki for True Strike (auto-hit on next attack)",  status: "good" },
  FinesseTrainingDagger:  { note: "DEX to damage with daggers (no restrictions)",          status: "good" },
  WeakeningWoundFeature:  { note: "Inflict STR damage with sneak attacks",                  status: "good" },
  SpellFocus:             { note: "+1 DC to chosen school spells",                          status: "good" },
  SpellPenetration:       { note: "+2 to caster level checks to beat SR — vital vs demons", status: "good" },
  PowerAttack:            { note: "Power Attack",                                            status: "good" },
  WeaponFocus:            { note: "+1 attack with chosen weapon",                            status: "good" },
  WeaponSpecialization:   { note: "+2 damage with chosen weapon (Fighter 4 required)",      status: "good" },
  FurysFall:              { note: "Add DEX to Trip CMB (stacks with STR)",                  status: "good" },
  WitchHexSlumberFeature: { note: "Slumber hex: Will save or sleep",                        status: "good" },
  WitchHexVulnerabilityCurseFeature: { note: "Vulnerability Curse: +1 dmg dice from one damage type", status: "good" },
  WitchHexHealingFeature: { note: "Healing hex: cure light wounds 1×/day per target",      status: "good" },
};

const LVL5_RECS: Record<string, { feat: string; why: string; priority: "high" | "med" | "low"; spell?: string }> = {
  "Kaede": {
    feat: "Outflank",
    why: "Flanking → +4 (from +2). Crit chains with Seelah/Woljif. Prereq BAB +4 ✓",
    priority: "high",
    spell: "Barkskin (L2) — natural armor buff"
  },
  "Seelah_Companion": {
    feat: "Dazzling Display",
    why: "Full-round Shaken on all nearby enemies. Opens Shatter Defenses chain (makes enemies flat-footed).",
    priority: "high"
  },
  "Camelia_Companion": {
    feat: "Evil Eye Hex (via level up)",
    why: "Best debuff in the game. −2 to saves/AC/attacks. Free action + Cackle extends it indefinitely.",
    priority: "high"
  },
  "Lann_Companion": {
    feat: "Manyshot",
    why: "Fire 2 arrows on first attack as a standard action. Doubles opening burst damage.",
    priority: "high"
  },
  "Wenduag_Companion": {
    feat: "Rapid Shot",
    why: "Extra ranged attack per round at −2. Essential ranged DPS upgrade at this level.",
    priority: "high"
  },
  "Woljif_Companion": {
    feat: "Outflank",
    why: "TWF sneak attacker who flanks constantly — +4 flanking AND crit chains with the party.",
    priority: "high",
    spell: "Invisibility (L2) — reliable sneak attack setup"
  },
  "Nenio_Companion": {
    feat: "Greater Spell Focus (Illusion)",
    why: "Scrollmaster is Illusion-focused. +2 total DC to Illusion spells. Or Greater Spell Penetration for better demon SR bypass.",
    priority: "med",
    spell: "Haste (L3) — most important party buff in the game"
  },
  "Stomper": {
    feat: "Outflank",
    why: "Stomper trips enemies as part of its attacks (BullyArchetype + FurysFall). Outflank adds crit-chain synergy.",
    priority: "high"
  },
  "Ulbrig_Companion": {
    feat: "Outflank",
    why: "Frontline shifter with Power Attack + WeaponFocus — flanking synergy makes all his crits trigger party AoO.",
    priority: "high"
  },
  "Ember_Companion": {
    feat: "Accursed Hex (metamagic) or Extra Hex: Evil Eye",
    why: "Ember lacks Evil Eye — taking it via the hex class feature at level 5 is more valuable than any feat. Slumber+VulnerabilityCurse+EvilEye is the full hex trifecta.",
    priority: "high"
  },
};

// ─── HP status ────────────────────────────────────────────────────────────────

const STATUS_COLORS = { dead: "#e05a5a", critical: "#e39400", low: "#f2ce00", ok: "#5ccc96" };
function hpStatus(hp: number, max: number): keyof typeof STATUS_COLORS {
  if (hp <= 0) return "dead";
  const pct = hp / max;
  if (pct < 0.25) return "critical";
  if (pct < 0.5)  return "low";
  return "ok";
}

// ─── Build HTML ───────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  frontline: "#e39400", damage: "#e05a5a", healer: "#5ccc96",
  buffer: "#b3a1e6", control: "#42b3c2", utility: "#f2ce00",
};

function roleBar(label: string, val: number, key: string): string {
  const col = ROLE_COLORS[key] ?? "#8a93c0";
  const pct = (val / 5) * 100;
  return `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
      <span style="font-size:.6rem;width:54px;color:${col};flex-shrink:0;">${label}</span>
      <div style="flex:1;height:5px;background:#1a1f3a;border-radius:3px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${col};opacity:.8;border-radius:3px;"></div>
      </div>
      <span style="font-size:.6rem;color:#4b5280;width:10px;text-align:right;">${val}</span>
    </div>`;
}

function charCard(c: (typeof data.characters)[0]): string {
  const roleProfile = composition.characters.find(r => r.characterId === c.uniqueId);
  const rec = LVL5_RECS[c.name];
  const status = c.stats ? hpStatus(c.stats.hp, c.stats.hpMax) : "ok";
  const statusColor = STATUS_COLORS[status];
  const cls = c.class ? humanClass(c.class.className) : "?";
  const archetype = c.class?.archetypeName ? humanClass(c.class.archetypeName) : null;
  const isPC = c.isPlayerCharacter;
  const weaponMismatch = c.name === "Kaede" && c.equipment?.some(e => e.slot === "Main Hand" && e.itemType === "Weapon") && !c.equipment?.some(e => e.slot === "Off Hand");

  const statBlock = c.stats ? `
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-bottom:10px;">
      ${[["STR",c.stats.str,"#e39400"],["DEX",c.stats.dex,"#5ccc96"],["CON",c.stats.con,"#e05a5a"],["INT",c.stats.int,"#42b3c2"],["WIS",c.stats.wis,"#b3a1e6"],["CHA",c.stats.cha,"#ce6f8f"]].map(([k,v,col])=>`
        <div style="background:#0d0f18;border:1px solid #252a45;border-radius:5px;text-align:center;padding:5px 2px;">
          <div style="font-size:.55rem;color:#4b5280;text-transform:uppercase;">${k}</div>
          <div style="font-size:1rem;font-weight:700;color:${col};">${v}</div>
          <div style="font-size:.55rem;color:#4b5280;">${sign(Math.floor((Number(v)-10)/2))}</div>
        </div>`).join("")}
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:10px;font-size:.7rem;">
      <div style="background:#0d0f18;border:1px solid #252a45;border-radius:4px;padding:4px;text-align:center;">
        <div style="color:#4b5280;font-size:.55rem;">BAB</div>
        <div style="color:#e39400;font-weight:700;">${sign(c.stats.bab)}</div>
      </div>
      <div style="background:#0d0f18;border:1px solid #252a45;border-radius:4px;padding:4px;text-align:center;">
        <div style="color:#4b5280;font-size:.55rem;">Fort</div>
        <div style="color:#5ccc96;font-weight:700;">${sign(c.stats.fortSave)}</div>
      </div>
      <div style="background:#0d0f18;border:1px solid #252a45;border-radius:4px;padding:4px;text-align:center;">
        <div style="color:#4b5280;font-size:.55rem;">Ref</div>
        <div style="color:#42b3c2;font-weight:700;">${sign(c.stats.reflexSave)}</div>
      </div>
      <div style="background:#0d0f18;border:1px solid #252a45;border-radius:4px;padding:4px;text-align:center;">
        <div style="color:#4b5280;font-size:.55rem;">Will</div>
        <div style="color:#b3a1e6;font-weight:700;">${sign(c.stats.willSave)}</div>
      </div>
    </div>` : "";

  const featsHtml = (c.feats ?? []).length ? `
    <div style="margin-bottom:10px;">
      <div style="font-size:.6rem;color:#4b5280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Feats</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px;">
        ${(c.feats ?? []).map(f => {
          const info = FEAT_ANALYSIS[f.name];
          const col = info ? (info.status==="good"?"#5ccc96":info.status==="warn"?"#f2ce00":info.status==="bad"?"#e05a5a":"#42b3c2") : "#8a93c0";
          const border = info ? `rgba(${info.status==="good"?"92,204,150":info.status==="warn"?"242,206,0":info.status==="bad"?"224,90,90":"66,179,194"},.3)` : "rgba(138,147,192,.2)";
          const title = info ? info.note : f.name;
          return `<span title="${title}" style="font-size:.62rem;padding:2px 6px;border-radius:3px;border:1px solid ${border};color:${col};background:${border.replace(".3",".08")};">${humanFeat(f.name)}</span>`;
        }).join("")}
      </div>
    </div>` : "";

  const equipHtml = (c.equipment ?? []).length ? `
    <div style="margin-bottom:10px;">
      <div style="font-size:.6rem;color:#4b5280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Equipment</div>
      ${(c.equipment ?? []).map(e => {
        const slotColor = e.slot==="Main Hand"?"#ce6f8f":e.slot==="Off Hand"?"#e39400":e.slot==="Armor"?"#42b3c2":"#4b5280";
        const warn = (c.name==="Kaede" && e.slot==="Main Hand" && e.itemType==="Weapon") ? " ⚠" : "";
        return `<div style="display:flex;gap:6px;font-size:.72rem;margin-bottom:2px;">
          <span style="color:${slotColor};width:56px;flex-shrink:0;font-size:.62rem;">${e.slot}</span>
          <span style="color:#8a93c0;">${humanItem(e.name)}${warn}</span>
        </div>`;
      }).join("")}
    </div>` : "";

  const spellHtml = c.spellbook ? `
    <div style="margin-bottom:10px;">
      <div style="font-size:.6rem;color:#4b5280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Spellbook (CL${c.spellbook.casterLevel})</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">
        ${c.spellbook.slots.filter(s=>s.total>0).map(s=>`
          <span style="font-size:.65rem;padding:1px 6px;border-radius:3px;background:rgba(179,161,230,.1);border:1px solid rgba(179,161,230,.25);color:${s.remaining===0?"#e05a5a":"#b3a1e6"};">L${s.level}: ${s.remaining}/${s.total}</span>
        `).join("")}
      </div>
      <div style="font-size:.62rem;color:#4b5280;">${c.spellbook.knownSpells.flatMap((lvl,i)=>lvl.map(s=>`${s.name.replace(/Cast$/,"").replace(/([a-z])([A-Z])/g,"$1 $2").trim()}(L${i})`)).slice(0,12).join(", ")}${c.spellbook.knownSpells.flat().length>12?"…":""}</div>
    </div>` : "";

  const roleHtml = roleProfile ? `
    <div style="margin-bottom:10px;">
      <div style="font-size:.6rem;color:#4b5280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Role Scores</div>
      ${roleBar("Frontline",roleProfile.scores.frontline,"frontline")}
      ${roleBar("Damage",roleProfile.scores.damage,"damage")}
      ${roleBar("Healer",roleProfile.scores.healer,"healer")}
      ${roleBar("Buffer",roleProfile.scores.buffer,"buffer")}
      ${roleBar("Control",roleProfile.scores.control,"control")}
      ${roleBar("Utility",roleProfile.scores.utility,"utility")}
    </div>` : "";

  const recHtml = rec ? `
    <div style="background:rgba(179,161,230,.06);border:1px solid rgba(179,161,230,.2);border-left:3px solid #b3a1e6;border-radius:5px;padding:8px 10px;">
      <div style="font-size:.65rem;color:#4b5280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;">Level 5 →</div>
      <div style="font-size:.82rem;font-weight:700;color:#b3a1e6;margin-bottom:2px;">${rec.feat}</div>
      <div style="font-size:.72rem;color:#8a93c0;">${rec.why}</div>
      ${rec.spell ? `<div style="font-size:.7rem;color:#42b3c2;margin-top:3px;">📖 ${rec.spell}</div>` : ""}
    </div>` : "";

  const warnHtml = weaponMismatch ? `
    <div style="background:rgba(227,148,0,.08);border:1px solid rgba(227,148,0,.3);border-radius:4px;padding:6px 8px;margin-bottom:8px;font-size:.72rem;color:#e39400;">
      ⚠ TWF feats require two one-handed weapons — switch from Finnean Greatsword!
    </div>` : "";

  const hp = c.stats?.hp ?? 0;
  const hpMax = c.stats?.hpMax ?? 1;
  const hpPctVal = hpPct(hp, hpMax);

  return `
  <div style="background:#13162b;border:1px solid #252a45;border-radius:8px;padding:16px;break-inside:avoid;">
    <!-- Header -->
    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:1rem;font-weight:700;color:#cdd6f4;">${c.name.replace(/_Companion$/," ")}</span>
          ${isPC ? `<span style="font-size:.62rem;color:#f2ce00;background:rgba(242,206,0,.1);border:1px solid rgba(242,206,0,.25);padding:1px 5px;border-radius:3px;">★ PC</span>` : ""}
        </div>
        <div style="font-size:.75rem;color:#b3a1e6;margin-top:1px;">${cls}${archetype?` · ${archetype}`:""} <span style="color:#e39400;">Lv${c.class?.level??0}</span>${c.mythicPath?` <span style="color:#42b3c2;">· ${c.mythicPath} T${c.mythicLevel}</span>`:""}</div>
        <div style="font-size:.65rem;color:#4b5280;margin-top:1px;">${[c.race,c.alignment,c.background,c.deity?`⚑ ${c.deity}`:null].filter(Boolean).join(" · ")}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:1.2rem;font-weight:700;color:${statusColor};">${hp}<span style="font-size:.7rem;color:#4b5280;">/${hpMax}</span></div>
        <div style="font-size:.6rem;color:#4b5280;">HP</div>
      </div>
    </div>
    <!-- HP bar -->
    <div style="height:4px;background:#1a1f3a;border-radius:2px;margin-bottom:12px;overflow:hidden;">
      <div style="width:${hpPctVal}%;height:100%;background:${statusColor};border-radius:2px;"></div>
    </div>
    ${warnHtml}
    ${statBlock}
    ${featsHtml}
    ${equipHtml}
    ${spellHtml}
    ${roleHtml}
    ${recHtml}
  </div>`;
}

// ─── Party status banner ──────────────────────────────────────────────────────

const injured = data.characters.filter(c => c.stats && c.stats.hp < c.stats.hpMax);
const dying   = data.characters.filter(c => c.stats && c.stats.hp <= 0);
const fullHP  = data.characters.filter(c => c.stats && c.stats.hp >= c.stats.hpMax);

const bannerItems = data.characters
  .filter(c => c.stats)
  .map(c => {
    const s = c.stats!;
    const pct = hpPct(s.hp, s.hpMax);
    const col = hpColor(s.hp, s.hpMax);
    const name = c.name.replace(/_Companion$/, "");
    return `
      <div style="flex:1;min-width:80px;">
        <div style="font-size:.65rem;color:#8a93c0;margin-bottom:2px;">${name}</div>
        <div style="height:6px;background:#1a1f3a;border-radius:3px;overflow:hidden;margin-bottom:2px;">
          <div style="width:${pct}%;height:100%;background:${col};border-radius:3px;"></div>
        </div>
        <div style="font-size:.6rem;color:${col};">${s.hp}/${s.hpMax}</div>
      </div>`;
  }).join("");

// ─── Party synergy ────────────────────────────────────────────────────────────

const synergies = [
  { icon: "🎯", title: "Outflank Chain (recommended for all frontline)", body: "None yet have Outflank. Take it at Lv5 on Kaede, Seelah, Woljif, Ulbrig, Stomper — every crit triggers a free AoO from all allies with Outflank." },
  { icon: "😴", title: "Ember Slumber → melee pile-on", body: "Ember Slumber hex knocks enemies asleep (no save if not in combat). Sleeping = flat-footed = sneak attack from Woljif. Melee finishers Coup de Grace to kill instantly." },
  { icon: "💉", title: "Healing coverage", body: "Seelah (lay on hands + channel 2d6), Camellia (Cure Light Wounds), Ember (Healing hex). Camellia has 2 L1 slots left. Ember's hex has no limit. Use Ember's healing hex between fights to save spell slots." },
  { icon: "🏹", title: "Dual ranged (Lann + Wenduag)", body: "Both are dedicated archers. Lann is Zen Archer (WIS-based, Ki pool). Wenduag is Fighter (feat-heavy). They work best behind frontline melee. PointBlankMaster on Lann means no AoO when threatened." },
  { icon: "⚡", title: "Woljif sneak attack setup", body: "Woljif needs flanking or flat-footed for 2d6 sneak attack. Use Ember's Slumber or Kaede/Seelah flanking to enable it. He dual-wields masterwork daggers — already correctly set up." },
];

// ─── Build page issues ────────────────────────────────────────────────────────

const issues = [
  { sev: "crit", char: "Kaede", msg: "Main Hand: Finnean Greatsword (TWF). Equip two one-handed weapons to activate TWF feats." },
  { sev: "crit", char: "Seelah", msg: "HP: −11 (dying). Needs immediate healing before any action." },
  { sev: "crit", char: "Stomper", msg: "HP: −2 (dying). Will revive after rest." },
  { sev: "warn", char: "Camellia", msg: "HP: 5/23. Only 2 L1 spell slots remaining — rest soon." },
  { sev: "warn", char: "Kaede", msg: "Headband of Charisma +2 equipped — this boosts CHA to +0 (still negative). Swap for Headband of Wisdom +2 to improve Will saves and skills." },
  { sev: "info", char: "Nenio", msg: "Not using Haste yet (L3 spell, unlocks at Wizard 5). This is the most impactful buff — a level away." },
  { sev: "info", char: "Ember", msg: "Lacks Evil Eye hex — take it at level 5 to complete the Slumber+Vulnerability+EvilEye trifecta." },
];

const issueHtml = issues.map(i => {
  const col = i.sev==="crit"?"#e05a5a":i.sev==="warn"?"#e39400":"#42b3c2";
  const bg  = i.sev==="crit"?"rgba(224,90,90,.06)":i.sev==="warn"?"rgba(227,148,0,.06)":"rgba(66,179,194,.06)";
  return `<div style="background:${bg};border:1px solid ${col}33;border-left:3px solid ${col};border-radius:5px;padding:8px 12px;margin-bottom:6px;display:flex;gap:10px;">
    <span style="font-size:.7rem;font-weight:700;color:${col};flex-shrink:0;width:40px;">${i.sev.toUpperCase()}</span>
    <div>
      <span style="font-size:.75rem;font-weight:700;color:#cdd6f4;">${i.char}: </span>
      <span style="font-size:.75rem;color:#8a93c0;">${i.msg}</span>
    </div>
  </div>`;
}).join("");

// ─── Assemble HTML ────────────────────────────────────────────────────────────

const saves = listSaves();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Party Build Guide — WotR</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0f18; color: #cdd6f4; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; line-height: 1.5; padding: 24px; max-width: 1300px; margin: 0 auto; }
  h2 { font-size: .65rem; font-weight: 700; color: #4b5280; text-transform: uppercase; letter-spacing: .15em; margin-bottom: 12px; }
  section { margin-bottom: 28px; }
  .party-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  @media print { .party-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
</head>
<body>

<div style="display:flex;align-items:baseline;gap:16px;margin-bottom:24px;">
  <div>
    <div style="font-size:1.5rem;font-weight:700;color:#b3a1e6;letter-spacing:.04em;">Party Build Guide</div>
    <div style="font-size:.8rem;color:#4b5280;margin-top:2px;">${data.meta.name} · ${data.meta.area} · ${data.meta.gameTotalTime.slice(0,8)} played · ${data.meta.mods.length} mods</div>
  </div>
  <div style="flex:1;"></div>
  <div style="display:flex;gap:10px;font-size:.72rem;">
    <span style="color:#e05a5a;">⬤ ${dying.length} dying</span>
    <span style="color:#5ccc96;">⬤ ${fullHP.length} full HP</span>
    <span style="color:#4b5280;">⬤ ${data.characters.length} total</span>
  </div>
</div>

<!-- ─── HP overview ───── -->
<section>
  <h2>Party HP Status</h2>
  <div style="background:#13162b;border:1px solid #252a45;border-radius:8px;padding:16px;">
    <div style="display:flex;gap:12px;flex-wrap:wrap;">${bannerItems}</div>
  </div>
</section>

<!-- ─── Issues ───────── -->
<section>
  <h2>Issues &amp; Immediate Actions</h2>
  ${issueHtml}
</section>

<!-- ─── Synergies ──────── -->
<section>
  <h2>Party Synergies</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
    ${synergies.map(s=>`
      <div style="background:#13162b;border:1px solid #252a45;border-radius:6px;padding:10px 12px;display:flex;gap:10px;">
        <span style="font-size:1.1rem;flex-shrink:0;">${s.icon}</span>
        <div>
          <div style="font-weight:700;font-size:.82rem;margin-bottom:2px;">${s.title}</div>
          <div style="font-size:.73rem;color:#8a93c0;">${s.body}</div>
        </div>
      </div>`).join("")}
  </div>
</section>

<!-- ─── Characters ──────── -->
<section>
  <h2>Character Profiles — Level 4 with Level 5 Recommendations</h2>
  <div class="party-grid">
    ${data.characters.map(charCard).join("")}
  </div>
</section>

<div style="text-align:center;color:#252a45;font-size:.65rem;margin-top:24px;padding-top:16px;border-top:1px solid #1a1f3a;">
  Generated from ${saves[0]?.name ?? "current save"} · ${new Date().toLocaleString()}
</div>

</body>
</html>`;

const outPath = path.join(import.meta.dir, "../party-guide.html");
fs.writeFileSync(outPath, html, "utf8");
console.log(`Written: ${outPath}`);
