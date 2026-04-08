import { useState, useEffect } from "react";
import { useLiveSave } from "../hooks/useLiveSave.ts";

interface GuideIssue { sev: "crit" | "warn" | "info"; char: string; msg: string; }

export default function Dashboard() {
  const { party, analysis, loading, error, refresh, lastUpdate } = useLiveSave();
  const [crits, setCrits] = useState<GuideIssue[]>([]);

  // Fetch top critical issues from field guide on load + save updates
  useEffect(() => {
    fetch("/api/build-guide")
      .then(r => r.ok ? r.json() : null)
      .then(d => d ? setCrits((d.issues as GuideIssue[]).filter(i => i.sev === "crit").slice(0, 2)) : null)
      .catch(() => {});
  }, [lastUpdate]);

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

      {/* Area / act banner */}
      <div className="card space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-base">{meta.areaName || meta.name.split(" -")[0]}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple/15 text-purple border border-purple/30">
            {meta.actLabel}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-x-6 text-xs text-text-dim border-t border-bg-border pt-2">
          <div><span>Player: </span><span className="text-text-muted">{meta.playerCharacterName}</span></div>
          <div><span>Played: </span><span className="text-text-muted">{meta.gameTotalTime.slice(0, 8)}</span></div>
          <div><span>Mods: </span><span className="text-text-muted">{meta.mods.length}</span></div>
        </div>
      </div>

      {/* Area prep tips */}
      {meta.areaTips?.length > 0 && (
        <div className="card space-y-2">
          <div className="section-title">Area Tips — {meta.areaName}</div>
          {meta.areaTips.map((tip, i) => (
            <div key={i} className="tip text-xs">{tip}</div>
          ))}
        </div>
      )}

      {/* Top critical issues */}
      {crits.length > 0 && (
        <div className="space-y-2">
          <div className="section-title text-red">Critical Actions</div>
          {crits.map((issue, i) => (
            <div key={i} className="flex gap-3 rounded p-3 border-l-4 border-l-red bg-red/5 border border-red/20">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 h-fit mt-0.5 bg-red/20 text-red border border-red/40">CRIT</span>
              <div className="text-sm">
                <span className="font-semibold text-text-base">{issue.char}: </span>
                <span className="text-text-muted">{issue.msg}</span>
              </div>
            </div>
          ))}
          <div className="text-xs text-text-dim">
            See <button className="text-cyan hover:text-cyan/80 underline" onClick={() => {}}>Field Guide</button> for full issues list.
          </div>
        </div>
      )}

      {/* Active party */}
      <div>
        <div className="section-title">Active Party ({characters.filter(c => c.inParty).length})</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {characters.filter(c => c.inParty).map((char) => {
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

                {/* HP status — only show when wounded or dying */}
                {char.stats && char.stats.hp < char.stats.hpMax && (
                  <div className="mt-1 text-xs">
                    {char.stats.hp <= 0
                      ? <span className="text-red font-semibold">☠️ Dying ({char.stats.hp}/{char.stats.hpMax} HP)</span>
                      : char.stats.hp < char.stats.hpMax * 0.5
                      ? <span className="text-orange">▼ {char.stats.hp}/{char.stats.hpMax} HP</span>
                      : null
                    }
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

      {/* Companions at camp */}
      {characters.filter(c => !c.inParty).length > 0 && (
        <div>
          <div className="section-title text-text-dim">At Camp ({characters.filter(c => !c.inParty).length})</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-80">
            {characters.filter(c => !c.inParty).map((char) => {
              const charAnalysis = analysis?.characters?.find((a: any) => a.characterId === char.uniqueId);
              const buffCount   = charAnalysis?.availableBuffs?.length ?? 0;
              const healCount   = charAnalysis?.availableHeals?.length ?? 0;
              return (
                <div key={char.uniqueId} className="card hover:border-bg-border2 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-sm text-text-base">{char.name}</div>
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
                      {charAnalysis?.prepSuggestions?.map((tip: string, i: number) => (
                        <div key={i} className="tip text-xs">{tip}</div>
                      ))}
                    </div>
                  )}
                  {char.stats && char.stats.hp <= 0 && (
                    <div className="mt-1 text-xs"><span className="text-red font-semibold">☠️ Dying ({char.stats.hp}/{char.stats.hpMax} HP)</span></div>
                  )}
                  {!char.spellbook && (
                    <div className="text-xs text-text-dim">Non-caster — no spells</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Party insights */}
      {analysis?.party && (
        <div>
          <div className="section-title">Party Coverage</div>
          <div className="card space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                { key: "hasAoeBuff",          label: "AoE Buff",       ok: analysis.party.hasAoeBuff },
                { key: "hasProtectionFromEvil", label: "Prot. Evil",    ok: analysis.party.hasProtectionFromEvil },
                { key: "hasMagicWeapon",      label: "Magic Weapon",   ok: analysis.party.hasMagicWeapon },
                { key: "hasGroupHeal",        label: "Group Heal",     ok: analysis.party.hasGroupHeal },
                { key: "hasCC",               label: "Crowd Control",  ok: analysis.party.hasCC },
                { key: "hasSummon",           label: "Summon",         ok: analysis.party.hasSummon },
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
