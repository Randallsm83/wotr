import { useState, useEffect, useCallback } from "react";
import { useLiveSave } from "../hooks/useLiveSave.ts";
import type { CharacterData, CharacterRoleProfile, RoleScores } from "../../../src/server/models/types.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatNote { note: string; status: "good" | "warn" | "bad" | "info"; }
interface GuideIssue { sev: "crit" | "warn" | "info"; char: string; msg: string; }
interface GuideSynergy { icon: string; title: string; body: string; }
interface GuideRec { feat: string; why: string; priority: "high" | "med" | "low"; spell?: string; }
interface CharacterTactics { combat?: string; spells?: string[]; mythic?: string; attributes?: string[]; }
interface ShoppingSlot { slot: string; lookFor: string; }
interface ShoppingTip { slotPriority: ShoppingSlot[]; itemPicks?: string[]; }

interface PartySlot { name: string; role: string; why: string; priority: "core" | "recommended" | "situational"; }
interface PartyAdvice {
  slots: PartySlot[];
  bench: { name: string; reason: string }[];
  rotationTips: string[];
  coverageNote: string;
}

interface BuildGuideData {
  issues: GuideIssue[];
  synergies: GuideSynergy[];
  recommendations: Record<string, GuideRec>;
  featNotes: Record<string, FeatNote>;
  tactics: Record<string, CharacterTactics>;
  restChecklist: string[];
  shoppingTips: Record<string, ShoppingTip>;
  consumableTips: string[];
  partyAdvice?: PartyAdvice;
  provenance?: Record<string, "save" | "reference" | "hybrid">;
}

// ─── Issue row ────────────────────────────────────────────────────────────────

const SEV_STYLES = {
  crit: { badge: "bg-red/20 text-red border border-red/40",       bar: "border-l-red",    bg: "bg-red/5  border border-red/20" },
  warn: { badge: "bg-orange/20 text-orange border border-orange/40", bar: "border-l-orange", bg: "bg-orange/5 border border-orange/20" },
  info: { badge: "bg-cyan/15 text-cyan border border-cyan/30",    bar: "border-l-cyan",   bg: "bg-cyan/5 border border-cyan/20" },
} as const;

function IssueRow({ issue }: { issue: GuideIssue }) {
  const s = SEV_STYLES[issue.sev];
  return (
    <div className={`flex gap-3 rounded p-3 border-l-4 ${s.bg} ${s.bar}`}>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 h-fit mt-0.5 ${s.badge}`}>{issue.sev.toUpperCase()}</span>
      <div className="text-sm"><span className="font-semibold text-text-base">{issue.char}: </span><span className="text-text-muted">{issue.msg}</span></div>
    </div>
  );
}

// ─── Synergy card ─────────────────────────────────────────────────────────────

function SynergyCard({ s }: { s: GuideSynergy }) {
  return (
    <div className="card flex gap-3">
      <span className="text-xl shrink-0 mt-0.5">{s.icon}</span>
      <div>
        <div className="text-sm font-semibold text-text-base mb-1">{s.title}</div>
        <div className="text-xs text-text-muted leading-relaxed">{s.body}</div>
      </div>
    </div>
  );
}

// ─── Role bars ────────────────────────────────────────────────────────────────

const ROLE_KEYS: (keyof RoleScores)[] = ["frontline","damage","healer","buffer","control","utility"];
const ROLE_COLOR: Record<string, string> = {
  frontline: "bg-orange", damage: "bg-red", healer: "bg-green",
  buffer: "bg-purple",    control: "bg-cyan", utility: "bg-yellow",
};
const ROLE_TEXT: Record<string, string> = {
  frontline: "text-orange", damage: "text-red", healer: "text-green",
  buffer: "text-purple",    control: "text-cyan", utility: "text-yellow",
};

function RoleBars({ scores }: { scores: RoleScores }) {
  return (
    <div className="space-y-1">
      {ROLE_KEYS.map(k => {
        const v = scores[k];
        return (
          <div key={k} className="flex items-center gap-2">
            <span className={`text-[10px] w-14 shrink-0 capitalize ${ROLE_TEXT[k]}`}>{k}</span>
            <div className="flex-1 h-1 bg-bg-border rounded overflow-hidden">
              <div className={`h-full rounded ${ROLE_COLOR[k]}`} style={{ width: `${Math.round((v/5)*100)}%`, opacity: v===0?0.15:0.85 }} />
            </div>
            <span className="text-[10px] text-text-dim w-3 text-right">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Feat badge ───────────────────────────────────────────────────────────────

const FEAT_CLS: Record<string, string> = {
  good: "border-green/35 text-green bg-green/8",
  warn: "border-yellow/35 text-yellow bg-yellow/8",
  bad:  "border-red/35 text-red bg-red/8",
  info: "border-cyan/30 text-cyan bg-cyan/8",
};

function cleanFeat(name: string): string {
  return name.replace(/Feature$/,"").replace(/Feat$/,"").replace(/Selection.*/,"")
    .replace(/([a-z])([A-Z])/g,"$1 $2").replace(/_/g," ").trim();
}

function FeatBadge({ name, notes }: { name: string; notes: Record<string, FeatNote> }) {
  const note = notes[name];
  const cls  = note ? (FEAT_CLS[note.status] ?? FEAT_CLS.info) : "border-bg-border2 text-text-dim";
  return (
    <span title={note?.note ?? name}
      className={`inline-block text-[10px] px-1.5 py-0.5 rounded border leading-none ${cls}`}>
      {cleanFeat(name)}
    </span>
  );
}

// ─── Stat box ─────────────────────────────────────────────────────────────────

const STAT_COLOR: Record<string, string> = {
  STR:"text-orange", DEX:"text-green", CON:"text-red",
  INT:"text-cyan",   WIS:"text-purple", CHA:"text-pink",
};
const STAT_TIP: Record<string, string> = {
  STR: "Strength — melee attack/damage, carrying capacity",
  DEX: "Dexterity — ranged attacks, AC, Reflex saves, finesse",
  CON: "Constitution — hit points per level, Fortitude saves",
  INT: "Intelligence — skill points, Wizard/Alchemist spell power",
  WIS: "Wisdom — divine spell DC, Will saves, Perception",
  CHA: "Charisma — Paladin/Oracle/Sorcerer/Bard power, social checks",
};

function StatBox({ label, value }: { label: string; value: number }) {
  const mod = Math.floor((value - 10) / 2);
  return (
    <div title={STAT_TIP[label]} className="flex flex-col items-center bg-bg-elevated border border-bg-border2 rounded p-1.5 min-w-[42px]">
      <div className="text-[9px] text-text-dim uppercase tracking-widest">{label}</div>
      <div className={`text-base font-bold ${STAT_COLOR[label] ?? "text-text-base"}`}>{value}</div>
      <div className="text-[9px] text-text-dim">{mod >= 0 ? `+${mod}` : String(mod)}</div>
    </div>
  );
}

// ─── Save box (BAB/Fort/Ref/Will) ─────────────────────────────────────────────

const SAVE_TIP: Record<string, string> = {
  BAB: "Base Attack Bonus — added to every attack roll",
  Fort: "Fortitude Save — vs poison, disease, exhaustion (CON-based)",
  Ref: "Reflex Save — vs area effects, traps, explosions (DEX-based)",
  Will: "Will Save — vs mind-affecting, enchantments, fear (WIS-based)",
  AC: "Armor Class (base+armor+DEX; natural armor/deflection partially included)",
};

function SaveBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div title={SAVE_TIP[label]} className="flex flex-col items-center bg-bg-elevated border border-bg-border rounded py-1">
      <div className="text-[9px] text-text-dim">{label}</div>
      <div className={`text-xs font-bold ${color}`}>{value >= 0 ? `+${value}` : value}</div>
    </div>
  );
}

// ─── Equipment row ────────────────────────────────────────────────────────────

function cleanItem(name: string): string {
  return name.replace(/Item$/,"").replace(/Plus(\d)/,"+$1").replace(/(\d)$/, " +$1")
    .replace(/([a-z])([A-Z])/g,"$1 $2").replace(/\s+/g," ").trim();
}

function EquipRow({ slot, name }: { slot: string; name: string }) {
  const c = slot==="Main Hand"?"text-pink":slot==="Off Hand"?"text-orange":slot==="Armor"?"text-cyan":"text-text-dim";
  return (
    <div className="flex gap-2 text-xs">
      <span className={`text-[10px] w-14 shrink-0 ${c}`}>{slot}</span>
      <span className="text-text-muted truncate">{cleanItem(name)}</span>
    </div>
  );
}

// ─── Full character profile card ──────────────────────────────────────────────

interface CharCardProps {
  char: CharacterData;
  roleProfile?: CharacterRoleProfile;
  rec?: GuideRec;
  tactics?: CharacterTactics;
  shopping?: ShoppingTip;
  featNotes: Record<string, FeatNote>;
  dimmed?: boolean;
}

function CharCard({ char, roleProfile, rec, tactics, shopping, featNotes, dimmed }: CharCardProps) {
  const [showTactics, setShowTactics] = useState(false);
  const s = char.stats;
  const hpPct = s ? Math.max(0, Math.min(100, (s.hp / s.hpMax) * 100)) : 0;
  const hpCol  = !s||s.hp<=0 ? "bg-red" : s.hp/s.hpMax < 0.3 ? "bg-orange" : s.hp/s.hpMax < 0.7 ? "bg-yellow" : "bg-green";
  const hasTactics = tactics && (tactics.combat || (tactics.spells?.length??0)>0 || tactics.mythic || (tactics.attributes?.length??0)>0);
  const recBar = rec?.priority==="high" ? "border-l-orange" : rec?.priority==="med" ? "border-l-cyan" : "border-l-bg-border2";

  return (
    <div className={`card space-y-3 ${dimmed ? "opacity-80" : ""}`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-text-base">{char.name}</span>
            {char.isPlayerCharacter && <span className="text-yellow text-xs">★</span>}
            {!char.inParty && <span className="text-[9px] text-text-dim border border-bg-border2 px-1 rounded">camp</span>}
          </div>
          <div className="text-xs text-purple mt-0.5">
            {char.class?.className}
            {char.class?.archetypeName && <span className="text-text-dim"> · {char.class.archetypeName}</span>}
            {char.class && <span className="text-orange ml-1">Lv{char.class.level}</span>}
            {char.mythicPath && <span className="text-cyan ml-1">· {char.mythicPath} T{char.mythicLevel}</span>}
          </div>
          {(char.race || char.alignment) && (
            <div className="text-[10px] text-text-dim mt-0.5">{[char.race, char.alignment, char.background].filter(Boolean).join(" · ")}</div>
          )}
        </div>
        {s && (
          <div className="text-right shrink-0">
            <div className={`text-lg font-bold ${s.hp<=0?"text-red":"text-green"}`}>
              {s.hp}<span className="text-xs text-text-dim">/{s.hpMax}</span>
            </div>
            <div className="text-[9px] text-text-dim">HP</div>
          </div>
        )}
      </div>

      {/* HP bar */}
      {s && (
        <div className="h-1.5 bg-bg-border rounded overflow-hidden -mt-1">
          <div className={`h-full rounded ${hpCol}`} style={{ width: `${hpPct}%` }} />
        </div>
      )}

      {/* Stat grid */}
      {s && (
        <div className="flex gap-1 flex-wrap">
          {(["STR","DEX","CON","INT","WIS","CHA"] as const).map(k => (
            <StatBox key={k} label={k}
              value={k==="STR"?s.str:k==="DEX"?s.dex:k==="CON"?s.con:k==="INT"?s.int:k==="WIS"?s.wis:s.cha} />
          ))}
        </div>
      )}

      {/* Saves + AC */}
      {s && (
        <div className="grid grid-cols-5 gap-1">
          <SaveBox label="BAB"  value={s.bab}        color="text-orange" />
          <SaveBox label="Fort" value={s.fortSave}   color="text-green" />
          <SaveBox label="Ref"  value={s.reflexSave} color="text-cyan" />
          <SaveBox label="Will" value={s.willSave}   color="text-purple" />
          <div className="flex flex-col items-center bg-bg-elevated border border-bg-border rounded py-1">
            <div className="text-[9px] text-text-dim">AC</div>
            <div className="text-xs font-bold text-cyan">{s.ac}</div>
          </div>
        </div>
      )}

      {/* Empty slots warning */}
      {(char.emptySlots?.length ?? 0) > 0 && (
        <div>
          <div className="text-[10px] text-orange uppercase tracking-wider mb-1">Empty Slots</div>
          <div className="flex flex-wrap gap-1">
            {char.emptySlots!.map(slot => (
              <span key={slot} className="inline-block text-[10px] px-1.5 py-0.5 rounded border border-orange/40 text-orange bg-orange/8">
                {slot}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Feat badges */}
      {(char.feats?.length ?? 0) > 0 && (
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1">Feats</div>
          <div className="flex flex-wrap gap-1">
            {char.feats!.map(f => <FeatBadge key={f.guid} name={f.name} notes={featNotes} />)}
          </div>
        </div>
      )}

      {/* Equipment */}
      {(char.equipment?.length ?? 0) > 0 && (
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1">Equipment</div>
          <div className="space-y-0.5">
            {char.equipment!.map((e, i) => <EquipRow key={i} slot={e.slot} name={e.name} />)}
          </div>
        </div>
      )}

      {/* Spellbook */}
      {char.spellbook && (
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1">
            Spells — {char.spellbook.type} CL{char.spellbook.casterLevel}
          </div>
          <div className="flex gap-2 flex-wrap">
            {char.spellbook.slots.filter(sl => sl.total > 0).map(sl => (
              <span key={sl.level} className="text-xs">
                <span className="text-text-dim">L{sl.level}: </span>
                <span className={sl.remaining===0?"text-red":"text-purple"}>{sl.remaining}/{sl.total}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Role bars */}
      {roleProfile && (
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1">
            Role — {roleProfile.primaryRole} / {roleProfile.secondaryRole}
          </div>
          <RoleBars scores={roleProfile.scores} />
        </div>
      )}

      {/* Shopping tips */}
      {shopping && (shopping.slotPriority.length > 0 || (shopping.itemPicks?.length ?? 0) > 0) && (
        <div className="border-t border-bg-border pt-2">
          <button
            onClick={() => setShowTactics(v => !v)}
            className="text-[10px] text-text-dim hover:text-text-muted uppercase tracking-wider flex items-center gap-1"
          >
            &#9657; Shopping Priorities
          </button>
          {/* Always visible — shopping is immediately actionable */}
          <div className="mt-2 space-y-1">
            {shopping.slotPriority.map((s, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-orange font-semibold shrink-0 w-14">{s.slot}</span>
                <span className="text-text-muted">{s.lookFor}</span>
              </div>
            ))}
            {(shopping.itemPicks?.length ?? 0) > 0 && (
              <div className="space-y-0.5 pt-1 border-t border-bg-border">
                {shopping.itemPicks!.map((p, i) => (
                  <div key={i} className="flex gap-1.5 text-xs text-text-muted">
                    <span className="text-yellow shrink-0">▪</span><span>{p}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tactics toggle */}
      {hasTactics && (
        <div className="border-t border-bg-border pt-2">
          <button
            onClick={() => setShowTactics(v => !v)}
            className="text-[10px] text-text-dim hover:text-text-muted uppercase tracking-wider flex items-center gap-1"
          >
            {showTactics ? "▾" : "▸"} Tactics, Spells &amp; Mythic
          </button>
          {showTactics && (
            <div className="mt-2 space-y-3">
              {tactics!.combat && (
                <div>
                  <div className="text-[10px] text-orange uppercase tracking-wider mb-1">⚔ Combat Rotation</div>
                  <div className="text-xs text-text-muted leading-relaxed">{tactics!.combat}</div>
                </div>
              )}
              {(tactics!.spells?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[10px] text-purple uppercase tracking-wider mb-1">✦ Spells to Cast</div>
                  <ul className="space-y-1">
                    {tactics!.spells!.map((sp, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-text-muted">
                        <span className="text-purple shrink-0 mt-0.5">▪</span><span>{sp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tactics!.mythic && (
                <div>
                  <div className="text-[10px] text-cyan uppercase tracking-wider mb-1">◈ Mythic Path</div>
                  <div className="text-xs text-text-muted leading-relaxed">{tactics!.mythic}</div>
                </div>
              )}
              {(tactics!.attributes?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[10px] text-yellow uppercase tracking-wider mb-1">◆ Attribute Priorities</div>
                  <ul className="space-y-1">
                    {tactics!.attributes!.map((a, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-text-muted">
                        <span className="text-yellow shrink-0 mt-0.5">▪</span><span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recommendation box */}
      {rec && (
        <div className={`border-l-4 ${recBar} rounded p-2.5 bg-bg-elevated border border-bg-border`}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9px] font-bold text-text-dim uppercase tracking-wider">
              Lv{(char.class?.level ?? 5) + 1} →
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
              rec.priority==="high" ? "text-orange border-orange/40 bg-orange/10" :
              rec.priority==="med"  ? "text-cyan border-cyan/30 bg-cyan/10" :
              "text-text-dim border-bg-border2"
            }`}>{rec.priority.toUpperCase()}</span>
          </div>
          <div className="text-xs font-semibold text-purple mb-1">{rec.feat}</div>
          <ul className="space-y-0.5">
            {rec.why.split(/\.\s+/).filter(Boolean).map((sent, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] text-text-muted leading-snug">
                <span className="text-text-dim shrink-0 mt-0.5">◦</span>
                <span>{sent.endsWith(".") ? sent : sent + "."}</span>
              </li>
            ))}
          </ul>
          {rec.spell && <div className="text-[10px] text-cyan mt-1.5">📖 {rec.spell}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FieldGuide() {
  const { party, lastUpdate } = useLiveSave();
  const [guide, setGuide]     = useState<BuildGuideData | null>(null);
  const [roleMap, setRoleMap] = useState<Record<string, CharacterRoleProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchGuide = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [gr, rr] = await Promise.all([fetch("/api/build-guide"), fetch("/api/party-builder")]);
      if (!gr.ok) throw new Error(`HTTP ${gr.status}`);
      setGuide(await gr.json());
      if (rr.ok) {
        const rd = await rr.json();
        const m: Record<string, CharacterRoleProfile> = {};
        for (const c of (rd.characters ?? [])) m[c.characterId] = c;
        setRoleMap(m);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGuide(); }, [fetchGuide, lastUpdate]);

  if (loading && !guide) return <div className="text-text-dim text-sm animate-pulse">Loading field guide...</div>;
  if (error)             return <div className="card border-red/30 text-red text-sm">{error}</div>;
  if (!guide)            return null;

  const crits       = guide.issues.filter(i => i.sev === "crit");
  const sortedIssues = [...crits, ...guide.issues.filter(i=>i.sev==="warn"), ...guide.issues.filter(i=>i.sev==="info")];
  const chars    = party?.characters ?? [];
  const inParty  = chars.filter(c => c.inParty);
  const atCamp   = chars.filter(c => !c.inParty);
  const featNotes = guide.featNotes ?? {};

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex items-baseline justify-between">
        <h2 className="text-purple font-bold text-sm tracking-widest uppercase">Field Guide</h2>
        <button onClick={fetchGuide}
          className="text-xs text-text-dim hover:text-text-base px-2 py-1 rounded border border-bg-border hover:border-bg-border2 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {guide.provenance && (
        <div className="card text-xs text-text-dim leading-relaxed">
          Guide advice is generated from the current save state. Feat tooltips remain reference data, but recommendations, tactics,
          party advice, rest notes, shopping priorities, consumables, and synergies are now live save-driven analysis.
        </div>
      )}

      {/* Party Composition */}
      {guide.partyAdvice && (() => {
        const pa = guide.partyAdvice;
        const PRIORITY_STYLE: Record<string, string> = {
          core:        "border-purple/40 bg-purple/8 text-purple",
          recommended: "border-cyan/30 bg-cyan/8 text-cyan",
          situational: "border-bg-border2 bg-bg-elevated text-text-dim",
        };
        return (
          <section>
            <div className="section-title mb-3">📊 Party Composition</div>

            {/* Coverage note */}
            <div className="text-xs text-text-dim mb-3">{pa.coverageNote}</div>

            {/* Party coverage from role scores */}
            {Object.keys(roleMap).length > 0 && (() => {
              const roleKeys = ["frontline","damage","healer","buffer","control","utility"] as const;
              const roleColors: Record<string, string> = {
                frontline:"bg-orange", damage:"bg-red", healer:"bg-green",
                buffer:"bg-purple", control:"bg-cyan", utility:"bg-yellow",
              };
              const roleText: Record<string, string> = {
                frontline:"text-orange", damage:"text-red", healer:"text-green",
                buffer:"text-purple", control:"text-cyan", utility:"text-yellow",
              };
              // Max score per role across in-party characters
              const partyScores: Record<string, number> = {};
              const inPartyChars = chars.filter(c => c.inParty);
              for (const k of roleKeys) {
                partyScores[k] = Math.max(0, ...inPartyChars.map(c => roleMap[c.uniqueId]?.scores[k] ?? 0));
              }
              return (
                <div className="card mb-4">
                  <div className="section-title mb-2">Active Party Role Coverage</div>
                  <div className="grid grid-cols-3 gap-2">
                    {roleKeys.map(k => {
                      const v = partyScores[k] ?? 0;
                      const tier = v >= 4 ? "green" : v >= 2 ? "cyan" : "red";
                      return (
                        <div key={k} className={`flex items-center gap-2 rounded p-2 border ${
                          tier === "green" ? "border-green/30 bg-green/5" :
                          tier === "cyan"  ? "border-cyan/20 bg-cyan/5" :
                          "border-red/30 bg-red/5"
                        }`}>
                          <div className="flex-1">
                            <div className={`text-[10px] font-bold capitalize ${roleText[k]}`}>{k}</div>
                            <div className="h-1 bg-bg-border rounded overflow-hidden mt-0.5">
                              <div className={`h-full ${roleColors[k]}`} style={{width:`${Math.round((v/5)*100)}%`,opacity:0.85}} />
                            </div>
                          </div>
                          <span className={`text-sm font-bold ${
                            tier==="green"?"text-green":tier==="cyan"?"text-cyan":"text-red"
                          }`}>{v}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Recommended slots */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {pa.slots.map(slot => (
                <div key={slot.name} className={`rounded p-3 border ${PRIORITY_STYLE[slot.priority]}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm text-text-base">{slot.name}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${PRIORITY_STYLE[slot.priority]}`}>{slot.priority}</span>
                  </div>
                  <div className="text-[10px] font-semibold text-text-muted mb-0.5">{slot.role}</div>
                  <div className="text-xs text-text-muted leading-relaxed">{slot.why}</div>
                </div>
              ))}
            </div>

            {/* Bench advice */}
            <details className="card">
              <summary className="cursor-pointer text-xs text-text-dim hover:text-text-muted select-none">
                Bench &amp; rotation ({pa.bench.length} characters)
              </summary>
              <div className="mt-3 space-y-2">
                {pa.bench.map(b => (
                  <div key={b.name} className="flex gap-2 text-xs">
                    <span className="text-text-dim font-semibold shrink-0 w-16">{b.name}</span>
                    <span className="text-text-muted">{b.reason}</span>
                  </div>
                ))}
                <div className="border-t border-bg-border pt-2 space-y-1">
                  <div className="text-[10px] text-text-dim uppercase tracking-wider">Rotation tips</div>
                  {pa.rotationTips.map((t, i) => (
                    <div key={i} className="flex gap-1.5 text-xs text-text-muted">
                      <span className="text-cyan shrink-0">↻</span><span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </section>
        );
      })()}

      {/* Issues */}
      {sortedIssues.length > 0 && (
        <section>
          <div className="section-title mb-3">
            Issues &amp; Immediate Actions
            {crits.length > 0 && <span className="ml-2 text-red font-bold">{crits.length} critical</span>}
          </div>
          <div className="space-y-2">
            {sortedIssues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
          </div>
        </section>
      )}

      {/* Synergies */}
      {guide.synergies.length > 0 && (
        <section>
          <div className="section-title mb-3">Party Synergies</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {guide.synergies.map((s, i) => <SynergyCard key={i} s={s} />)}
          </div>
        </section>
      )}

      {/* Before You Rest checklist */}
      {guide.restChecklist?.length > 0 && (
        <section>
          <div className="section-title mb-3">⛺ Before You Rest</div>
          <div className="card space-y-2">
            {guide.restChecklist.map((item, i) => (
              <div key={i} className="flex gap-2 text-xs text-text-muted">
                <span className="text-green shrink-0 mt-0.5">{i + 1}.</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Consumables to carry */}
      {guide.consumableTips?.length > 0 && (
        <section>
          <div className="section-title mb-3">🧪 Consumables &amp; Supplies</div>
          <div className="card space-y-1.5">
            {guide.consumableTips.map((tip, i) => (
              <div key={i} className="flex gap-2 text-xs text-text-muted">
                <span className="text-yellow shrink-0 mt-0.5">▪</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active party profiles */}
      {inParty.length > 0 && (
        <section>
          <div className="section-title mb-3">Active Party — Character Profiles</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {inParty.map(char => (
              <CharCard key={char.uniqueId} char={char}
                roleProfile={roleMap[char.uniqueId]}
                rec={guide.recommendations[char.name]}
                tactics={guide.tactics?.[char.name]}
                shopping={guide.shoppingTips?.[char.name]}
                featNotes={featNotes} />
            ))}
          </div>
        </section>
      )}

      {/* At-camp profiles */}
      {atCamp.length > 0 && (
        <section>
          <div className="section-title text-text-dim mb-3">At Camp</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {atCamp.map(char => (
              <CharCard key={char.uniqueId} char={char}
                roleProfile={roleMap[char.uniqueId]}
                rec={guide.recommendations[char.name]}
                tactics={guide.tactics?.[char.name]}
                shopping={guide.shoppingTips?.[char.name]}
                featNotes={featNotes} dimmed />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
