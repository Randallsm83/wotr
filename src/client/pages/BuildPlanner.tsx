import { useState, useEffect, useCallback } from "react";
import { useLiveSave } from "../hooks/useLiveSave.ts";
import type { BuildProfile, BuildAdvice, BuildRole, CharacterRoleProfile, CharacterData } from "../../../src/server/models/types.ts";
import { BUILD_ROLE_LABELS } from "../../../src/server/models/types.ts";
import AiStream from "../components/AiStream.tsx";

// ─── Guide rec card (inline in Build Planner) ─────────────────────────────────

interface GuideRec { feat: string; why: string; priority: "high" | "med" | "low"; spell?: string; }
interface BuildGuideData { recommendations: Record<string, GuideRec>; }

function GuideRecBanner({ rec, charName }: { rec: GuideRec; charName: string }) {
  const accent =
    rec.priority === "high" ? { border: "border-orange/40", bg: "bg-orange/5",  text: "text-orange", bar: "border-l-orange" } :
    rec.priority === "med"  ? { border: "border-cyan/30",   bg: "bg-cyan/5",    text: "text-cyan",   bar: "border-l-cyan"   } :
                              { border: "border-bg-border2", bg: "bg-bg-elevated", text: "text-text-dim", bar: "border-l-bg-border2" };
  return (
    <div className={`card space-y-2 border-l-4 ${accent.bar} ${accent.bg} ${accent.border}`}>
      <div className="flex items-center gap-2">
        <span className="section-title">Guide Recommendation — {charName}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${accent.border} ${accent.text}`}>
          {rec.priority.toUpperCase()}
        </span>
      </div>
      <div className={`text-sm font-semibold ${accent.text}`}>{rec.feat}</div>
      <div className="text-xs text-text-muted leading-relaxed">{rec.why}</div>
      {rec.spell && <div className="text-xs text-cyan">📖 {rec.spell}</div>}
    </div>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 75 ? "bg-green" :
    score >= 50 ? "bg-cyan" :
    score >= 25 ? "bg-orange" :
    "bg-red";

  const label =
    score >= 75 ? "text-green" :
    score >= 50 ? "text-cyan" :
    score >= 25 ? "text-orange" :
    "text-red";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-dim uppercase tracking-wider">Build Fit</span>
        <span className={`font-bold text-sm ${label}`}>{score}/100</span>
      </div>
      <div className="h-2 bg-bg-elevated rounded overflow-hidden">
        <div
          className={`h-full rounded transition-all duration-500 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="text-xs text-text-dim">
        {score >= 75 ? "On track — keep it up" :
         score >= 50 ? "Making progress — some gaps remain" :
         score >= 25 ? "Needs attention — check the advice below" :
         "Significant gaps — review the build plan"}
      </div>
    </div>
  );
}

// ─── Advice panel ─────────────────────────────────────────────────────────────

function AdvicePanel({ advice }: { advice: BuildAdvice }) {
  return (
    <div className="space-y-4">
      <ScoreBar score={advice.alignmentScore} />

      {advice.statWarnings.length > 0 && (
        <div className="card space-y-2">
          <div className="section-title text-orange">Stat Warnings</div>
          {advice.statWarnings.map((w, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-orange shrink-0">▲</span>
              <span className="text-text-muted">{w}</span>
            </div>
          ))}
        </div>
      )}

      {advice.featGaps.length > 0 && (
        <div className="card space-y-2">
          <div className="section-title text-red">Feat Gaps</div>
          {advice.featGaps.map((f, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="badge badge-missing">{f.featName}</span>
                {f.byLevel && (
                  <span className="text-xs text-text-dim">ideal by Lv{f.byLevel}</span>
                )}
              </div>
              <div className="text-xs text-text-dim pl-1">{f.reason}</div>
            </div>
          ))}
        </div>
      )}

      {advice.spellPriorities.length > 0 && (
        <div className="card space-y-2">
          <div className="section-title text-blue">Spell Priorities</div>
          {advice.spellPriorities.map((s, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-blue shrink-0">✦</span>
              <span className="text-text-muted">{s}</span>
            </div>
          ))}
        </div>
      )}

      {advice.equipmentNotes.length > 0 && (
        <div className="card space-y-2">
          <div className="section-title text-yellow">Equipment</div>
          {advice.equipmentNotes.map((n, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-yellow shrink-0">◆</span>
              <span className="text-text-muted">{n}</span>
            </div>
          ))}
        </div>
      )}

      {advice.nextLevelTips.length > 0 && (
        <div className="card space-y-2">
          <div className="section-title text-purple">Next Level-Up</div>
          {advice.nextLevelTips.map((t, i) => (
            <div key={i} className="tip">{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Build editor ─────────────────────────────────────────────────────────────

const CASTER_CLASSES = /witch|wizard|sorcerer|oracle|shaman|druid|cleric|warpriest|bard|arcanist|skald|inquisitor/i;

/** Map detected primary-role label + class to a BuildRole. */
function autoDetectRole(primaryRole: string, className?: string): BuildRole {
  const cn = className ?? "";
  if (primaryRole === "Damage") {
    // Casters doing damage do it with spells, not melee — map to caster roles
    if (CASTER_CLASSES.test(cn)) return "arcane-caster";
    return "melee-dps";
  }
  const MAP: Record<string, BuildRole> = {
    Frontline: "tank", Healer: "healer", Buffer: "buffer",
    Control: "controller", Utility: "support",
  };
  return MAP[primaryRole] ?? "support";
}

interface EditorProps {
  characterId: string;
  characterName: string;
  char: CharacterData | undefined;       // live character from save
  initial: BuildProfile | null;
  detected: CharacterRoleProfile | null; // from party-builder
  onSaved: (profile: BuildProfile) => void;
}

/** Strip trailing "Class" from blueprint names: "RangerClass" → "Ranger" */
function stripClass(n: string): string { return n.replace(/Class$/, ""); }

/** Build a human-readable class path from CharacterData */
function detectClassPath(char: CharacterData | undefined): string {
  if (!char?.class) return "";
  const classes = char.allClasses ?? [char.class];
  const parts = classes
    .sort((a, b) => b.level - a.level)
    .map((c) => {
      const name = stripClass(c.className);
      const arch = c.archetypeName ? ` (→ ${stripClass(c.archetypeName)})` : "";
      const lvl  = classes.length > 1 ? ` ${c.level}` : "";
      return `${name}${arch}${lvl}`;
    });
  return parts.join(" / ");
}

function BuildEditor({ characterId, characterName, char, initial, detected, onSaved }: EditorProps) {
  const detectedRole: BuildRole = autoDetectRole(detected?.primaryRole ?? "", char?.class?.className);
  const autoClassPath   = detectClassPath(char);
  const autoMythicPath  = char?.mythicPath ?? "";

  const [role, setRole]           = useState<BuildRole>(initial?.role ?? detectedRole);
  const [classPath, setClassPath] = useState(initial?.classPath || autoClassPath);
  const [mythicPath, setMythicPath] = useState(initial?.mythicPath || autoMythicPath);
  const [notes, setNotes]         = useState(initial?.notes ?? "");
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState<string | null>(null);
  const isAutoRole    = !initial && detected;
  const isAutoClass   = !initial?.classPath   && !!autoClassPath;
  const isAutoMythic  = !initial?.mythicPath  && !!autoMythicPath;

  // Reset when character changes
  useEffect(() => {
    setRole(initial?.role ?? detectedRole);
    setClassPath(initial?.classPath || autoClassPath);
    setMythicPath(initial?.mythicPath || autoMythicPath);
    setNotes(initial?.notes ?? "");
    setSaveMsg(null);
  }, [characterId, initial]);

  async function save() {
    if (!classPath.trim() && !autoClassPath) {
      setSaveMsg("Class path is required.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/builds/${characterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, characterName, role, classPath, mythicPath, notes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved: BuildProfile = await res.json();
      setSaveMsg("Saved.");
      onSaved(saved);
    } catch (e: any) {
      setSaveMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full bg-bg-elevated border border-bg-border2 rounded px-3 py-2 text-sm text-text-base placeholder:text-text-dim focus:outline-none focus:border-purple/50";

  return (
    <div className="card space-y-4">
      <div className="section-title">Build Profile</div>

      {/* Role */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-dim">Role</label>
          </div>
          {detected && role !== detectedRole && (
            <button
              onClick={() => setRole(detectedRole)}
              className="text-[10px] text-cyan hover:text-cyan/80 transition-colors"
              title={`Reset to auto-detected: ${detected.primaryRole}`}
            >
              ↺ reset to {detected.primaryRole.toLowerCase()}
            </button>
          )}
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as BuildRole)}
          className={`${inputClass} cursor-pointer`}
        >
          {(Object.entries(BUILD_ROLE_LABELS) as [BuildRole, string][]).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        {detected && (
          <div className="text-[10px] text-text-dim mt-1">
            Detected: {detected.primaryRole} / {detected.secondaryRole}
            {detected.scores && ` — ${Object.entries(detected.scores).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${v}`).join("  ")}`}
          </div>
        )}
      </div>

      {/* Class path */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-text-dim">Class / Archetype Path</label>
          {autoClassPath && classPath !== autoClassPath && (
            <button
              onClick={() => setClassPath(autoClassPath)}
              className="text-[10px] text-cyan hover:text-cyan/80 transition-colors"
              title={`Reset to: ${autoClassPath}`}
            >
              ↺ reset to detected
            </button>
          )}
        </div>
        <input
          value={classPath}
          onChange={(e) => setClassPath(e.target.value)}
          placeholder={autoClassPath || "e.g. Paladin → Divine Commander archetype"}
          className={inputClass}
        />
        {autoClassPath && (
          <div className="text-[10px] text-text-dim mt-1">
            Detected: {autoClassPath} — edit to add prestige dips or notes
          </div>
        )}
      </div>

      {/* Mythic path */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-text-dim">Mythic Path</label>
          {autoMythicPath && mythicPath !== autoMythicPath && (
            <button
              onClick={() => setMythicPath(autoMythicPath)}
              className="text-[10px] text-cyan hover:text-cyan/80 transition-colors"
              title={`Reset to: ${autoMythicPath}`}
            >
              ↺ reset to detected
            </button>
          )}
        </div>
        <input
          value={mythicPath}
          onChange={(e) => setMythicPath(e.target.value)}
          placeholder={autoMythicPath || "e.g. Aeon, Angel, Legend, Azata..."}
          className={inputClass}
        />
        {autoMythicPath && (
          <div className="text-[10px] text-text-dim mt-1">
            Detected: {autoMythicPath}{char?.mythicLevel ? ` (Tier ${char.mythicLevel})` : ""}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs text-text-dim mb-1">Build Goals / Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Focused on mounted combat feats. Wants to use Cornugon Smash intimidate chain. Dipping 2 levels of Fighter for bonus feats."
          rows={4}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded bg-purple/20 border border-purple/30 text-purple text-sm hover:bg-purple/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Build"}
        </button>
        {saveMsg && (
          <span className={`text-xs ${saveMsg.startsWith("Error") ? "text-red" : "text-green"}`}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Respec prompt builder ───────────────────────────────────────────────────

function buildRespeccPrompt(
  char: CharacterData,
  target: string,
  targetMythic: string,
  notes: string
): string {
  const currentBuild = char.class
    ? `${char.class.className}${char.class.archetypeName ? ` (${char.class.archetypeName})` : ""} level ${char.class.level}`
    : "unknown class";

  const stats = char.stats
    ? `STR ${char.stats.str} / DEX ${char.stats.dex} / CON ${char.stats.con} / INT ${char.stats.int} / WIS ${char.stats.wis} / CHA ${char.stats.cha}`
    : "";

  const feats = (char.feats ?? [])
    .slice(0, 20)
    .map((f) => `Lv${f.level}: ${f.name}`)
    .join(", ");

  const mythic = char.mythicPath
    ? `${char.mythicPath} Tier ${char.mythicLevel ?? "?"}`
    : "";

  return [
    `Generate a complete WotR respec guide for ${char.name}.`,
    `Current build: ${currentBuild}.`,
    stats && `Current stats: ${stats}.`,
    mythic && `Current mythic: ${mythic}.`,
    feats && `Current feats: ${feats}.`,
    `Target build: ${target}.`,
    targetMythic && `Target mythic path: ${targetMythic}.`,
    notes && `Goals/notes: ${notes}.`,
    `Provide:\n` +
    `1. Point-buy attribute spread optimised for the target build.\n` +
    `2. Complete level-by-level feat selections from level 1 to 20 — highlight the choices at level ${char.class?.level ?? "?"} for the immediate respec.\n` +
    `3. Skill point allocation priorities each level.\n` +
    `4. Mythic ability picks as each tier unlocks.\n` +
    `5. Any multiclass dips or prestige class entries — which level to dip and why.\n` +
    `6. Key gear milestones to prioritise.`,
    `Use WotR mechanic names, flag feat prerequisites, and be specific.`,
  ].filter(Boolean).join(" ");
}

// ─── Respec planner panel ─────────────────────────────────────────────────────

function RespeccPanel({ char }: { char: CharacterData }) {
  const inputClass =
    "w-full bg-bg-elevated border border-bg-border2 rounded px-3 py-2 text-sm text-text-base placeholder:text-text-dim focus:outline-none focus:border-orange/50";

  const [target, setTarget]           = useState("");
  const [targetMythic, setTargetMythic] = useState("");
  const [notes, setNotes]             = useState("");
  // Stable key for AiStream — changes only when character or submitted target changes
  const [submittedTarget, setSubmittedTarget] = useState("");
  const [prompt, setPrompt] = useState("");

  // Reset when character changes
  useEffect(() => {
    setTarget("");
    setTargetMythic("");
    setNotes("");
    setSubmittedTarget("");
    setPrompt("");
  }, [char.uniqueId]);

  function generate() {
    if (!target.trim()) return;
    setPrompt(buildRespeccPrompt(char, target, targetMythic, notes));
    setSubmittedTarget(target.trim());
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-dim">
        Describe your target build and get a full level-by-level respec guide — attribute spread,
        feat order, skill points, and mythic picks.
      </p>

      <div>
        <label className="block text-xs text-text-dim mb-1">Target Build <span className="text-orange">*</span></label>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="e.g. Cavalier 10 / Fighter 5, mounted TWF, STR-focused"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-dim mb-1">Target Mythic Path</label>
          <input
            value={targetMythic}
            onChange={(e) => setTargetMythic(e.target.value)}
            placeholder="e.g. Legend, Angel..."
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-text-dim mb-1">Goals / Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Cornugon Smash chain"
            className={inputClass}
          />
        </div>
      </div>

      <button
        onClick={generate}
        disabled={!target.trim()}
        className="px-4 py-2 rounded bg-orange/20 border border-orange/30 text-orange text-sm hover:bg-orange/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ✦ Generate Respec Guide
      </button>

      {submittedTarget && prompt && (
        <AiStream
          key={`${char.uniqueId}-respec-${submittedTarget}`}
          label="✦ Generate Respec Guide"
          prompt={prompt}
          accent="orange"
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuildPlanner() {
  const { party, loading, lastUpdate } = useLiveSave();
  const [selected, setSelected] = useState(0);
  const [profiles, setProfiles] = useState<Record<string, BuildProfile>>({});
  const [detected, setDetected] = useState<Record<string, CharacterRoleProfile>>({});
  const [advice, setAdvice] = useState<BuildAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [guideRecs, setGuideRecs] = useState<Record<string, GuideRec>>({});

  // Load guide recommendations on mount and save updates
  useEffect(() => {
    fetch("/api/build-guide")
      .then(r => r.ok ? r.json() as Promise<BuildGuideData> : null)
      .then(d => d ? setGuideRecs(d.recommendations) : null)
      .catch(() => {});
  }, [lastUpdate]);

  // Load saved profiles once on mount
  useEffect(() => {
    fetch("/api/builds")
      .then((r) => r.json())
      .then((list: BuildProfile[]) => {
        const map: Record<string, BuildProfile> = {};
        for (const p of list) map[p.characterId] = p;
        setProfiles(map);
      })
      .catch(() => {});
  }, []);

  // Load party-builder role detection
  useEffect(() => {
    fetch("/api/party-builder")
      .then((r) => r.json())
      .then((d: { characters: CharacterRoleProfile[] }) => {
        const map: Record<string, CharacterRoleProfile> = {};
        for (const c of d.characters ?? []) map[c.characterId] = c;
        setDetected(map);
      })
      .catch(() => {});
  }, []);

  const chars = party?.characters ?? [];
  const activeChar = chars[selected];

  const fetchAdvice = useCallback(async (characterId: string) => {
    setAdvice(null);
    setAdviceLoading(true);
    try {
      const res = await fetch(`/api/builds/${characterId}/advice`);
      if (!res.ok) return;
      setAdvice(await res.json());
    } finally {
      setAdviceLoading(false);
    }
  }, []);

  // Refresh advice when profile is saved or selection changes
  useEffect(() => {
    if (activeChar && profiles[activeChar.uniqueId]) {
      fetchAdvice(activeChar.uniqueId);
    } else {
      setAdvice(null);
    }
  }, [activeChar, profiles, fetchAdvice]);

  function handleSaved(profile: BuildProfile) {
    setProfiles((prev) => ({ ...prev, [profile.characterId]: profile }));
    fetchAdvice(profile.characterId);
  }

  if (loading && !party) {
    return <div className="text-text-dim text-sm animate-pulse">Loading...</div>;
  }
  if (!party) {
    return <div className="card text-text-muted text-sm">No save data.</div>;
  }

  return (
    <div className="flex gap-6 max-w-5xl">
      {/* Character selector */}
      <div className="w-36 shrink-0 space-y-1">
        <div className="section-title">Party</div>
        {chars.filter(c => c.inParty).map((c, _i) => {
          const i = chars.indexOf(c);
          const hasProfile = !!profiles[c.uniqueId];
          return (
            <button key={c.uniqueId} onClick={() => setSelected(i)}
              className={["w-full text-left px-3 py-2 rounded text-sm transition-colors",
                i === selected ? "bg-bg-elevated border border-bg-border2 text-purple"
                : "text-text-muted hover:text-text-base hover:bg-bg-elevated"].join(" ")}
            >
              <div className="font-semibold truncate flex items-center gap-1">
                {hasProfile && <span className="text-green text-xs">●</span>}
                {c.name}
              </div>
              {c.class && <div className="text-xs text-text-dim truncate">{c.class.className} {c.class.level}</div>}
            </button>
          );
        })}
        {chars.some(c => !c.inParty) && (
          <>
            <div className="section-title text-text-dim mt-3 pt-2 border-t border-bg-border">At Camp</div>
            {chars.filter(c => !c.inParty).map((c, _i) => {
              const i = chars.indexOf(c);
              const hasProfile = !!profiles[c.uniqueId];
              return (
                <button key={c.uniqueId} onClick={() => setSelected(i)}
                  className={["w-full text-left px-3 py-2 rounded text-sm transition-colors opacity-80",
                    i === selected ? "bg-bg-elevated border border-bg-border2 text-purple"
                    : "text-text-muted hover:text-text-base hover:bg-bg-elevated"].join(" ")}
                >
                  <div className="font-semibold truncate flex items-center gap-1">
                    {hasProfile && <span className="text-green text-xs">●</span>}
                    {c.name}
                  </div>
                  {c.class && <div className="text-xs text-text-dim truncate">{c.class.className} {c.class.level}</div>}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Main panel */}
      {activeChar && (
        <div className="flex-1 space-y-5 overflow-auto">
          {/* Character header */}
          <div>
            <div className="text-lg font-bold text-text-base">
              {activeChar.name}
              {activeChar.isPlayerCharacter && <span className="ml-2 text-yellow text-sm">★ Player</span>}
            </div>
            {activeChar.class && (
              <div className="text-sm text-purple mt-0.5">
                {activeChar.class.className}
                {activeChar.class.archetypeName && (
                  <span className="text-text-dim font-normal"> — {activeChar.class.archetypeName}</span>
                )}
                <span className="ml-2 text-orange">Level {activeChar.class.level}</span>
                {profiles[activeChar.uniqueId]?.mythicPath && (
                  <span className="ml-2 text-cyan">· {profiles[activeChar.uniqueId].mythicPath}</span>
                )}
              </div>
            )}
          </div>

          {/* Build profile — always first */}
          {activeChar.isPlayerCharacter ? (
            <BuildEditor
              key={activeChar.uniqueId}
              characterId={activeChar.uniqueId}
              characterName={activeChar.name}
              char={activeChar}
              initial={profiles[activeChar.uniqueId] ?? null}
              detected={detected[activeChar.uniqueId] ?? null}
              onSaved={handleSaved}
            />
          ) : (
            <details className="card" open={!!profiles[activeChar.uniqueId]}>
              <summary className="cursor-pointer text-xs text-text-dim hover:text-text-muted select-none">
                Build profile for {activeChar.name} {profiles[activeChar.uniqueId] ? "(configured)" : "(optional)"}
              </summary>
              <div className="mt-3">
                <BuildEditor
                  key={activeChar.uniqueId}
                  characterId={activeChar.uniqueId}
                  characterName={activeChar.name}
                  char={activeChar}
                  initial={profiles[activeChar.uniqueId] ?? null}
                  detected={detected[activeChar.uniqueId] ?? null}
                  onSaved={handleSaved}
                />
              </div>
            </details>
          )}

          {/* Guide recommendation */}
          {guideRecs[activeChar.name] && (
            <GuideRecBanner rec={guideRecs[activeChar.name]} charName={activeChar.name} />
          )}

          {/* AI build analysis */}
          <div className="card space-y-2">
            <div className="section-title text-purple">AI Build Analysis</div>
            <p className="text-xs text-text-dim">
              {activeChar.isPlayerCharacter
                ? `Feat progression, gear priorities, and next-level recommendations for ${activeChar.name}.`
                : `${activeChar.name} is auto-leveled — how they play, their strengths, and how to use them effectively.`}
            </p>
            <AiStream
              key={activeChar.uniqueId}
              label="✦ Analyse Build"
              prompt={[
                activeChar.isPlayerCharacter
                  ? `Give me a detailed build analysis and actionable next-level guide for ${activeChar.name}.`
                  : `${activeChar.name} is an auto-leveled companion — explain their preset build, how to play them, and how to use them effectively in the party.`,
                activeChar.class
                  ? `${activeChar.class.level} levels of ${activeChar.class.className}${activeChar.class.archetypeName ? ` (${activeChar.class.archetypeName} archetype)` : ""}.`
                  : "",
                activeChar.mythicPath ? `Mythic path: ${activeChar.mythicPath} (Tier ${activeChar.mythicLevel ?? "?"}).` : "",
                activeChar.isPlayerCharacter
                  ? `Focus on: best next feats, how to maximise damage/effectiveness, gear to prioritise. Be specific.`
                  : `Cover: their role, key class features, combat style, gear recommendations, and any synergies with the rest of the party.`,
                profiles[activeChar.uniqueId]
                  ? `Intended role: ${profiles[activeChar.uniqueId].role} (${profiles[activeChar.uniqueId].classPath})${profiles[activeChar.uniqueId].notes ? `. Notes: ${profiles[activeChar.uniqueId].notes}` : ""}.`
                  : "",
              ].filter(Boolean).join(" ")}
            />
          </div>

          {/* Respec planner */}
          <details className="card">
            <summary className="cursor-pointer text-xs text-text-dim hover:text-text-muted select-none">
              Respec Planner — full level-by-level guide for a new build
            </summary>
            <div className="mt-3">
              <RespeccPanel key={activeChar.uniqueId} char={activeChar} />
            </div>
          </details>

          {/* Rule-based score — only for the player character (autoleveled companions won't
               match any role checklist since they pick feats freely; the score is meaningless) */}
          {activeChar.isPlayerCharacter && profiles[activeChar.uniqueId] && (
            <details className="card">
              <summary className="cursor-pointer text-xs text-text-dim hover:text-text-muted select-none">
                Rule-based build score {advice ? `— ${advice.alignmentScore}/100` : "(save profile to compute)"}
              </summary>
              <div className="mt-3 space-y-3">
                {adviceLoading && <div className="text-text-dim text-sm animate-pulse">Computing...</div>}
                {!adviceLoading && advice && <AdvicePanel advice={advice} />}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
