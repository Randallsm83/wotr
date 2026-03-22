import { useLiveSave } from "../hooks/useLiveSave.ts";

export default function Dashboard() {
  const { party, analysis, loading, error, refresh } = useLiveSave();

  if (loading && !party) {
    return <div className="text-text-dim text-sm animate-pulse">Loading save data...</div>;
  }

  if (error) {
    return (
      <div className="card border-red/30">
        <div className="text-red text-sm font-semibold mb-1">Error loading save</div>
        <div className="text-text-muted text-xs">{error}</div>
        <button onClick={refresh} className="mt-2 text-xs text-blue hover:text-blue/80">Retry</button>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="card">
        <div className="text-text-muted text-sm">No save data found.</div>
        <div className="text-text-dim text-xs mt-1">Make sure you have a save file and the blueprint index is built.</div>
      </div>
    );
  }

  const { meta, characters } = party;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-purple">WotR Companion</h1>
          <p className="text-text-dim text-xs mt-0.5">{meta.name}</p>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-text-dim hover:text-text-base px-2 py-1 rounded border border-bg-border hover:border-bg-border2 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Save info */}
      <div className="card">
        <div className="section-title">Current Save</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div><span className="text-text-dim">Player: </span><span className="text-text-base">{meta.playerCharacterName}</span></div>
          <div><span className="text-text-dim">Area: </span><span className="text-text-base">{meta.area.slice(0, 40)}</span></div>
          <div><span className="text-text-dim">Play time: </span><span className="text-text-base">{meta.gameTotalTime.slice(0, 8)}</span></div>
          <div><span className="text-text-dim">Mods: </span><span className="text-text-base">{meta.mods.length}</span></div>
        </div>
      </div>

      {/* Party cards */}
      <div>
        <div className="section-title">Party</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {characters.map((char) => {
            const charAnalysis = analysis?.characters?.find((a: any) => a.characterId === char.uniqueId);
            const buffCount   = charAnalysis?.availableBuffs?.length ?? 0;
            const healCount   = charAnalysis?.availableHeals?.length ?? 0;

            return (
              <div key={char.uniqueId} className="card hover:border-bg-border2 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm text-text-base">
                      {char.name}
                      {char.isPlayerCharacter && <span className="ml-1 text-yellow text-xs">★</span>}
                    </div>
                    {char.class && (
                      <div className="text-xs text-text-muted">
                        {char.class.className}
                        {char.class.archetypeName && <span className="text-text-dim"> ({char.class.archetypeName})</span>}
                        <span className="ml-1 text-text-dim">Lv{char.class.level}</span>
                      </div>
                    )}
                  </div>
                  {char.spellbook && (
                    <div className="flex gap-1 flex-wrap justify-end">
                      {buffCount > 0 && <span className="badge-buff">{buffCount} buffs</span>}
                      {healCount > 0 && <span className="badge-heal">{healCount} heals</span>}
                    </div>
                  )}
                </div>

                {char.spellbook && (
                  <div className="mt-2 space-y-1">
                    {/* Slot summary */}
                    <div className="flex gap-2 flex-wrap">
                      {char.spellbook.slots.map((slot) => (
                        <div key={slot.level} className="text-xs">
                          <span className="text-text-dim">L{slot.level}: </span>
                          <span className={slot.remaining === 0 ? "text-red" : "text-cyan"}>
                            {slot.remaining}/{slot.total}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Prep suggestions */}
                    {charAnalysis?.prepSuggestions?.map((tip: string, i: number) => (
                      <div key={i} className="tip text-xs">{tip}</div>
                    ))}
                  </div>
                )}

                {!char.spellbook && (
                  <div className="text-xs text-text-dim">Non-caster — no spells</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Party insights */}
      {analysis?.party && (
        <div>
          <div className="section-title">Party Coverage</div>
          <div className="card space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                { key: "hasAoeBuff",          label: "AOE Buff",   ok: analysis.party.hasAoeBuff },
                { key: "hasProtectionFromEvil", label: "Prot Evil", ok: analysis.party.hasProtectionFromEvil },
                { key: "hasMagicWeapon",      label: "Magic Wep",  ok: analysis.party.hasMagicWeapon },
                { key: "hasGroupHeal",        label: "Group Heal", ok: analysis.party.hasGroupHeal },
                { key: "hasCC",               label: "CC",         ok: analysis.party.hasCC },
                { key: "hasSummon",           label: "Summon",     ok: analysis.party.hasSummon },
              ].map(({ key, label, ok }) => (
                <span key={key} className={ok ? "badge-ok" : "badge-missing"}>
                  {ok ? "✓" : "✗"} {label}
                </span>
              ))}
            </div>

            {analysis.party.tips.length > 0 && (
              <div className="space-y-1">
                {analysis.party.tips.map((tip: string, i: number) => (
                  <div key={i} className="tip">{tip}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
