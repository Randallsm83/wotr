/**
 * Generates party-guide.html from the current save file.
 * Run: bun run scripts/gen-party-guide.ts
 */
import { parseSave, listSaves } from "../src/server/services/save-parser.ts";
import { analyzeComposition } from "../src/server/services/party-builder.ts";
import { getBuilds } from "../src/server/services/build-store.ts";
import { FEAT_ANALYSIS, LVL_RECS } from "../src/server/services/build-guide.ts";
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

// FEAT_ANALYSIS and LVL_RECS are imported from services/build-guide.ts

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
  const rec = LVL_RECS[c.name];
  const status = c.stats ? hpStatus(c.stats.hp, c.stats.hpMax) : "ok";
  const statusColor = STATUS_COLORS[status];
  const cls = c.class ? humanClass(c.class.className) : "?";
  const archetype = c.class?.archetypeName ? humanClass(c.class.archetypeName) : null;
  const isPC = c.isPlayerCharacter;
  const hasTWFFeats = (c.feats ?? []).some(f => f.name === "Two Weapon Fighting");
  const weaponMismatch = hasTWFFeats && c.equipment?.some(e => e.slot === "Main Hand" && e.itemType === "Weapon") && !c.equipment?.some(e => e.slot === "Off Hand");

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
        const warn = (hasTWFFeats && e.slot==="Main Hand" && e.itemType==="Weapon" && !c.equipment?.some(ee=>ee.slot==="Off Hand")) ? " ⚠" : "";
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

  const nextLevel = (c.class?.level ?? 5) + 1;
  const recHtml = rec ? `
    <div style="background:rgba(179,161,230,.06);border:1px solid rgba(179,161,230,.2);border-left:3px solid #b3a1e6;border-radius:5px;padding:8px 10px;">
      <div style="font-size:.65rem;color:#4b5280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;">Level ${nextLevel} →</div>
      <div style="font-size:.82rem;font-weight:700;color:#b3a1e6;margin-bottom:2px;">${rec.feat}</div>
      <div style="font-size:.72rem;color:#8a93c0;">${rec.why}</div>
      ${rec.spell ? `<div style="font-size:.7rem;color:#42b3c2;margin-top:3px;">📖 ${rec.spell}</div>` : ""}
    </div>` : "";

  const warnHtml = weaponMismatch ? `
    <div style="background:rgba(227,148,0,.08);border:1px solid rgba(227,148,0,.3);border-radius:4px;padding:6px 8px;margin-bottom:8px;font-size:.72rem;color:#e39400;">
      ⚠ TWF feats active but no off-hand weapon equipped!
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
  { icon: "🎯", title: "Outflank Chain — Kaede only (Sly needs INT 3)", body: "Kaede has Outflank. Sly has Weapon Focus but not yet Outflank (blocked by INT 2 — needs INT 3 to qualify). Still needed: Seelah, Woljif, Ulbrig, Sly. Sly fix: Headband of Vast Intellect +2 during level-up screen to take Outflank, then swap back." },
  { icon: "😵", title: "Cornugon Smash + Shatter Defenses — fully online", body: "Every Kaede Power Attack auto-Shakes the target for free (Cornugon Smash). Shaken targets hit by Kaede become flat-footed (Shatter Defenses). The full debuff chain runs automatically on single targets with no setup turn required." },
  { icon: "😴", title: "Ember Slumber → melee pile-on", body: "Ember Slumber hex: Will save or sleep (auto if not in combat). Sleeping = flat-footed = Woljif sneak attacks + Kaede Shatter Defenses + Coup de Grace. Highest-value control in the party. Vulnerability Curse follows for bonus damage." },
  { icon: "💉", title: "Deep healing bench — 4 sources, one now swift", body: "Seelah (Lay on Hands swift + channel), Daeran (Combat Healer swift channel + Cure spells), Sosiel (Cleric channel + Cure), Camellia (Cure spells). Daeran's new Combat Healer revelation makes mid-combat triage nearly free — heals without spending a standard action." },
  { icon: "🎹", title: "Dual ranged — Lann at peak, Wenduag far behind", body: "Lann is fully online with Clustered Shots at Lv 7 — all arrows count together for DR bypass, critical vs Act 2+ DR/cold iron enemies. Wenduag is still Lv 2. She must be in every fight." },
  { icon: "⚡", title: "Woljif sneak attack — one swap from full power", body: "Finesse Training Dagger adds DEX to damage ONLY with daggers. Sickle of Falter in main hand wastes this entirely. Swap the Sickle to any dagger — no level-up required. Both attacks then apply full DEX-to-damage. Sources of flat-footed: Ember Slumber, Kaede Cornugon+Shatter, or flanking." },
];

// ─── Build page issues ────────────────────────────────────────────────────────

const issues = [
  { sev: "crit",  char: "Woljif",   msg: "Sickle of Falter still in main hand. Finesse Training Dagger adds DEX to damage ONLY with daggers — the Sickle wastes it completely. Swap to any dagger in main hand RIGHT NOW. No level-up required. Immediate DPS increase on every attack." },
  { sev: "crit",  char: "Wenduag",  msg: "Level 2 while everyone else is level 7. Five levels behind. Every fight she sits out deepens the gap. She must be active in every combat to close the XP debt." },
  { sev: "warn",  char: "Sosiel",   msg: "Wearing Standard Scalemail and using a Standard Glaive at Level 7. Starting-tier gear on your best buffer. Upgrade his armor to +2 medium/heavy (he has Heavy Armor Proficiency) and give him a +1 or better polearm. He needs to survive to cast Prayer and Divine Favor." },
  { sev: "warn",  char: "Sly",      msg: "Level 7 level-up pending in the Animal Companion screen. Apply it now: choose STR +2 (12 → 14). For Outflank: needs INT 3 (currently INT 2) — equip a Headband of Vast Intellect +2 during the level-up screen to qualify, take the feat, then swap it back." },
  { sev: "info",  char: "Ember",    msg: "One level behind the party (Lv 6). Will catch up on the next area level-up. No action needed." },
  { sev: "info",  char: "Note",     msg: "Companion feats (Outflank, Dazzling Display, Evil Eye, etc.) require disabling autoleveling entirely. Equipment swaps, hex usage, and spell choices can all be changed without touching autoleveling." },
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
  <h2>Character Profiles — Level 7 (Act 2) with Next Level Recommendations</h2>
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
