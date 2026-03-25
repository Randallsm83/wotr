import { useState, useEffect } from "react";
import type { PartyComposition, CharacterRoleProfile, RoleScores } from "../../../src/server/models/types.ts";

// ─── Role bar ─────────────────────────────────────────────────────────────────

const ROLE_KEYS: (keyof RoleScores)[] = ["frontline", "damage", "healer", "buffer", "control", "utility"];
const ROLE_LABELS: Record<keyof RoleScores, string> = {
  frontline: "Frontline", damage: "Damage", healer: "Healer",
  buffer: "Buffer", control: "Control", utility: "Utility",
};
const ROLE_COLOR: Record<keyof RoleScores, string> = {
  frontline: "bg-orange",  damage: "bg-red",    healer: "bg-green",
  buffer:    "bg-purple",  control: "bg-cyan",  utility: "bg-yellow",
};
const ROLE_TEXT: Record<keyof RoleScores, string> = {
  frontline: "text-orange", damage: "text-red",    healer: "text-green",
  buffer:    "text-purple", control: "text-cyan",  utility: "text-yellow",
};

function ScoreBar({ role, value }: { role: keyof RoleScores; value: number }) {
  const pct = Math.round((value / 5) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs w-16 shrink-0 ${ROLE_TEXT[role]}`}>{ROLE_LABELS[role]}</span>
      <div className="flex-1 h-1.5 bg-bg-border rounded overflow-hidden">
        <div
          className={`h-full rounded transition-all ${ROLE_COLOR[role]}`}
          style={{ width: `${pct}%`, opacity: value === 0 ? 0.2 : 0.85 }}
        />
      </div>
      <span className="text-xs text-text-dim text-right">{value}<span className="opacity-40">/5</span></span>
    </div>
  );
}

// ─── Character card ───────────────────────────────────────────────────────────

function CharacterCard({ char }: { char: CharacterRoleProfile }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-sm text-text-base">{char.characterName}</div>
          <div className="text-xs text-text-dim mt-0.5">
            {char.className} <span className="text-text-dim">Lv{char.level}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-xs text-purple font-semibold">{char.primaryRole}</span>
          <span className="text-xs text-text-dim"> / {char.secondaryRole}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {ROLE_KEYS.map((k) => (
          <ScoreBar key={k} role={k} value={char.scores[k]} />
        ))}
      </div>

      {char.notes.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-bg-border">
          {char.notes.map((n, i) => (
            <div key={i} className="text-xs text-text-dim">◆ {n}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Party coverage grid ──────────────────────────────────────────────────────

function CoverageGrid({ scores }: { scores: RoleScores }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ROLE_KEYS.map((k) => {
        const v = scores[k];
        const tier = v >= 4 ? "green" : v >= 2 ? "cyan" : "red";
        return (
          <div
            key={k}
            className={`flex flex-col items-center rounded p-3 border ${
              tier === "green" ? "border-green/30 bg-green/5" :
              tier === "cyan"  ? "border-cyan/20 bg-cyan/5"  :
              "border-red/30 bg-red/5"
            }`}
          >
            <div className={`text-xl font-bold text-${tier}`}>{v}</div>
            <div className={`text-xs font-semibold text-${tier}`}>{ROLE_LABELS[k]}</div>
            <div className="text-[10px] text-text-dim mt-0.5">
              {v >= 4 ? "Strong" : v >= 2 ? "Adequate" : "Gap"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PartyBuilder() {
  const [data, setData] = useState<PartyComposition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/party-builder")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-text-dim text-sm animate-pulse">Analysing party composition...</div>;
  if (error)   return <div className="card border-red/30 text-red text-sm">{error}</div>;
  if (!data)   return <div className="card text-text-muted text-sm">No data.</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-purple font-bold text-sm tracking-widest uppercase">Party Builder</h2>

      {/* Party coverage */}
      <div className="card space-y-3">
        <div className="section-title">Party Coverage</div>
        <CoverageGrid scores={data.partyScores} />
      </div>

      {/* Strengths / gaps */}
      {(data.strengths.length > 0 || data.gaps.length > 0) && (
        <div className="flex gap-4">
          {data.strengths.length > 0 && (
            <div className="card flex-1 space-y-2">
              <div className="section-title text-green">Strengths</div>
              <div className="flex flex-wrap gap-1">
                {data.strengths.map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded border border-green/30 bg-green/5 text-green">{s}</span>
                ))}
              </div>
            </div>
          )}
          {data.gaps.length > 0 && (
            <div className="card flex-1 space-y-2">
              <div className="section-title text-red">Gaps</div>
              <div className="flex flex-wrap gap-1">
                {data.gaps.map((g) => (
                  <span key={g} className="text-xs px-2 py-0.5 rounded border border-red/30 bg-red/5 text-red">{g}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advice */}
      {data.advice.length > 0 && (
        <div className="card space-y-2">
          <div className="section-title text-orange">Composition Advice</div>
          {data.advice.map((a, i) => (
            <div key={i} className="tip text-xs">{a}</div>
          ))}
        </div>
      )}

      {/* Synergies */}
      {data.synergies.length > 0 && (
        <div className="card space-y-2">
          <div className="section-title text-cyan">Synergies</div>
          {data.synergies.map((s, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-cyan shrink-0">↔</span>
              <span className="text-text-muted">{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* Per-character grid */}
      <div>
        <div className="section-title mb-3">Role Breakdown</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.characters.map((char) => (
            <CharacterCard key={char.characterId} char={char} />
          ))}
        </div>
      </div>
    </div>
  );
}
