import { useState, useEffect } from "react";

interface BbBuff {
  spellGuid: string;
  spellName: string;
  inGroup: number;
  groupLabel: string;
  blacklisted: boolean;
  wanted: string[];
  casterIds: string[];
  casterNames: string[];
  wantedNames: string[];
  advice: string;
}

interface MissingBuff {
  guid: string;
  name: string;
  level: number;
  priority: number;
  isCantrip: boolean;
  group: 1 | 2 | 3;
  groupLabel: string;
  groupTip: string;
  target: string;
  caster: string;
  effect: string;
}

interface BbData {
  configured: boolean;
  message?: string;
  gameId?: string;
  verboseCasting?: boolean;
  allowInCombat?: boolean;
  buffs?: BbBuff[];
  missing?: MissingBuff[];
  stats?: { total: number; active: number; blacklisted: number; missing: number };
}

const GROUP_COLOR: Record<string, string> = {
  Short:  "text-yellow",
  Normal: "text-blue",
  Long:   "text-green",
};

export default function BubbleBuffs() {
  const [data, setData] = useState<BbData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bubbles")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-text-dim text-sm animate-pulse">Loading BubbleBuffs config...</div>;

  if (!data?.configured) {
    return (
      <div className="card">
        <div className="text-orange font-semibold text-sm mb-1">BubbleBuffs Not Configured</div>
        <div className="text-text-muted text-sm">{data?.message ?? "No BubbleBuffs config found for this game."}</div>
        <div className="text-text-dim text-xs mt-2">Start the game once with BubbleBuffs installed to create the config file.</div>
      </div>
    );
  }

  const active   = data.buffs?.filter((b) => !b.blacklisted) ?? [];
  const blisted  = data.buffs?.filter((b) => b.blacklisted) ?? [];
  const missing  = data.missing ?? [];

  // Group active buffs by group
  const byGroup = active.reduce<Record<string, BbBuff[]>>((acc, b) => {
    const g = b.groupLabel;
    (acc[g] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-purple font-bold text-sm tracking-widest uppercase">BubbleBuffs</h2>
        <div className="flex gap-3 text-xs text-text-dim">
          <span><span className="text-green">{data.stats?.active}</span> configured</span>
          <span><span className="text-orange">{data.stats?.missing}</span> missing</span>
          {(data.stats?.blacklisted ?? 0) > 0 && (
            <span><span className="text-red">{data.stats?.blacklisted}</span> blacklisted</span>
          )}
        </div>
      </div>

      {/* Settings info */}
      <div className="card flex gap-6 text-xs">
        <div><span className="text-text-dim">Verbose casting: </span>
          <span className={data.verboseCasting ? "text-green" : "text-text-dim"}>{data.verboseCasting ? "on" : "off"}</span>
        </div>
        <div><span className="text-text-dim">Allow in combat: </span>
          <span className={data.allowInCombat ? "text-yellow" : "text-text-dim"}>{data.allowInCombat ? "on" : "off"}</span>
        </div>
      </div>

      {/* Missing buffs — full instructions */}
      {missing.length > 0 && (() => {
        const top = missing.filter((s) => s.priority >= 60);
        const rest = missing.filter((s) => s.priority < 60);

        const TARGET_COLOR: Record<string, string> = {
          "All": "text-green", "Frontline": "text-orange",
          "Caster": "text-purple", "Strongest melee": "text-pink",
        };
        const GROUP_COLOR: Record<string, string> = {
          Short: "text-yellow", Normal: "text-blue", Long: "text-green",
        };

        function BuffRow({ s }: { s: MissingBuff }) {
          return (
            <div className="rounded bg-bg-elevated p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge-warn font-semibold">{s.name}</span>
                <span className="text-xs text-text-dim">{s.isCantrip ? "cantrip" : `L${s.level} spell`}</span>
              </div>
              {s.effect && <div className="text-xs text-cyan">{s.effect}</div>}
              <div className="grid grid-cols-3 gap-2 text-xs mt-1">
                <div>
                  <div className="text-text-dim mb-0.5">Group</div>
                  <div className={`font-semibold ${GROUP_COLOR[s.groupLabel]}`}>{s.groupLabel}</div>
                  <div className="text-text-dim text-[10px] leading-tight mt-0.5">{s.groupTip}</div>
                </div>
                <div>
                  <div className="text-text-dim mb-0.5">Cast on</div>
                  <div className={`font-semibold ${TARGET_COLOR[s.target] ?? "text-text-base"}`}>{s.target}</div>
                </div>
                <div>
                  <div className="text-text-dim mb-0.5">Cast by</div>
                  <div className="font-semibold text-text-muted">{s.caster}</div>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-3">
            {top.length > 0 && (
              <div className="card border-orange/40 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="section-title mb-0">Add these to BubbleBuffs</div>
                  <span className="badge-warn">{top.length}</span>
                </div>
                <p className="text-text-dim text-xs">
                  In-game: click the BubbleBuffs icon → “Manage Buffs” → find spell → set group, select targets.
                </p>
                <div className="space-y-2">
                  {top.map((s) => <BuffRow key={s.guid} s={s} />)}
                </div>
              </div>
            )}
            {rest.length > 0 && (
              <details className="card">
                <summary className="cursor-pointer text-xs text-text-dim hover:text-text-muted select-none">
                  {rest.length} more buffs (lower priority — click to expand)
                </summary>
                <div className="space-y-2 mt-3">
                  {rest.map((s) => <BuffRow key={s.guid} s={s} />)}
                </div>
              </details>
            )}
          </div>
        );
      })()}

      {missing.length === 0 && active.length > 0 && (
        <div className="card border-green/30">
          <div className="text-green text-sm font-semibold">✓ All available buffs are configured</div>
          <div className="text-text-dim text-xs mt-1">Every buff your casters can cast is already in BubbleBuffs.</div>
        </div>
      )}

      {/* Configured buffs by group */}
      {Object.entries(byGroup).map(([groupName, buffs]) => (
        <div key={groupName} className="card space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="section-title mb-0">
              <span className={GROUP_COLOR[groupName] ?? "text-text-muted"}>{groupName} Duration</span>
            </div>
            <span className="text-xs text-text-dim">{buffs.length} buffs</span>
          </div>
          <div className="space-y-2">
            {buffs.map((b) => (
              <div key={b.spellGuid} className={`rounded p-2 space-y-1 ${b.advice.startsWith("⚠") ? "bg-orange/10 border border-orange/30" : "bg-bg-elevated"}`}>
                <div className="flex items-center justify-between">
                  <span className="badge-buff text-xs font-semibold">{b.spellName}</span>
                  <span className="text-xs text-text-dim">
                    {b.wantedNames.length > 0 ? b.wantedNames.join(", ") : `${b.wanted.length} targets`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-dim">
                    cast by {b.casterNames.length > 0 ? b.casterNames.join(", ") : b.casterIds.join(", ")}
                  </span>
                </div>
                {b.advice && (
                  <div className={`text-xs mt-1 ${b.advice.startsWith("⚠") ? "text-orange" : "text-green/80"}`}>
                    {b.advice}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Blacklisted */}
      {blisted.length > 0 && (
        <div className="card space-y-2">
          <div className="section-title text-text-dim">Blacklisted (excluded from casting)</div>
          <div className="flex flex-wrap gap-1">
            {blisted.map((b) => (
              <span key={b.spellGuid} className="badge text-xs bg-bg-elevated text-text-dim line-through">
                {b.spellName}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
