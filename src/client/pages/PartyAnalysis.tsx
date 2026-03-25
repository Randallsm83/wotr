import { useLiveSave } from "../hooks/useLiveSave.ts";

export default function PartyAnalysis() {
  const { party, analysis, loading } = useLiveSave();

  if (loading && !party) {
    return <div className="text-text-dim text-sm animate-pulse">Loading...</div>;
  }

  if (!analysis) {
    return <div className="card text-text-muted text-sm">No analysis data. Make sure saves are loaded.</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-purple font-bold text-sm tracking-widest uppercase">Party Analysis</h2>

      {/* Per-character breakdown */}
      {analysis.characters?.map((char: any) => (
        <div key={char.characterId} className="card space-y-3">
          <div className="font-semibold text-sm text-text-base">{char.characterName}</div>

          {char.availableBuffs?.length > 0 && (
            <div>
              <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Available Buffs</div>
              <div className="flex flex-wrap gap-1">
                {char.availableBuffs.map((s: any) => (
                  <span key={s.blueprintId} className="badge-buff">{s.displayName || s.name}</span>
                ))}
              </div>
            </div>
          )}

          {char.availableHeals?.length > 0 && (
            <div>
              <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Available Heals</div>
              <div className="flex flex-wrap gap-1">
                {char.availableHeals.map((s: any) => (
                  <span key={s.blueprintId} className="badge-heal">{s.displayName || s.name}</span>
                ))}
              </div>
            </div>
          )}

          {char.availableCC?.length > 0 && (
            <div>
              <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Crowd Control</div>
              <div className="flex flex-wrap gap-1">
                {char.availableCC.map((s: any) => (
                  <span key={s.blueprintId} className="badge-cc">{s.displayName || s.name}</span>
                ))}
              </div>
            </div>
          )}

          {char.notPreparedBuffs?.length > 0 && (
            <div>
              <div className="text-xs text-orange uppercase tracking-wider mb-1">Known but NOT Prepared</div>
              <div className="flex flex-wrap gap-1">
                {char.notPreparedBuffs.map((s: any) => (
                  <span key={s.blueprintId} className="badge-warn">{s.displayName || s.name}</span>
                ))}
              </div>
            </div>
          )}

          {char.prepSuggestions?.map((tip: string, i: number) => (
            <div key={i} className="tip">{tip}</div>
          ))}
        </div>
      ))}

      {/* Coverage heatmap */}
      {analysis.party && (
        <div className="card space-y-3">
          <div className="section-title">Party Coverage</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "AOE Buff (Bless/Haste)", ok: analysis.party.hasAoeBuff },
              { label: "Protection from Evil",    ok: analysis.party.hasProtectionFromEvil },
              { label: "Magic Weapon",            ok: analysis.party.hasMagicWeapon },
              { label: "Group Healing",           ok: analysis.party.hasGroupHeal },
              { label: "Crowd Control",           ok: analysis.party.hasCC },
              { label: "Summons",                 ok: analysis.party.hasSummon },
            ].map(({ label, ok }) => (
              <div key={label} className={`flex items-center gap-2 text-sm px-3 py-2 rounded border ${
                ok ? "border-green/30 bg-green/5" : "border-red/30 bg-red/5"
              }`}>
                <span className={ok ? "text-green" : "text-red"}>{ok ? "✓" : "✗"}</span>
                <span className={ok ? "text-text-muted" : "text-text-muted"}>{label}</span>
              </div>
            ))}
          </div>

          {analysis.party.missingCoverage?.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-red uppercase tracking-wider">Gaps</div>
              {analysis.party.missingCoverage.map((m: string, i: number) => (
                <div key={i} className="tip text-xs border-red/30">{m}</div>
              ))}
            </div>
          )}

          {analysis.party.tips?.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-orange uppercase tracking-wider">Tips</div>
              {analysis.party.tips.map((tip: string, i: number) => (
                <div key={i} className="tip">{tip}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
