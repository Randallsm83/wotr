import { useState, useRef, useEffect } from "react";
import { useLiveSave } from "../hooks/useLiveSave.ts";
import type { CharacterData } from "../../../src/server/models/types.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function statColor(n: number): string {
  if (n >= 18) return "text-green";
  if (n >= 14) return "text-cyan";
  if (n <= 8)  return "text-red";
  return "text-text-base";
}

function saveColor(n: number): string {
  if (n >= 8) return "text-green";
  if (n >= 5) return "text-cyan";
  if (n <= 1) return "text-red";
  return "text-text-muted";
}

// ─── Stat Block ───────────────────────────────────────────────────────────────

function AbilityScore({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex flex-col items-center bg-bg-elevated rounded p-2 min-w-[52px]">
      <div className="text-xs text-text-dim uppercase tracking-widest">{label}</div>
      <div className={`text-lg font-bold ${statColor(score)}`}>{score}</div>
      <div className="text-xs text-text-muted">{mod(score)}</div>
    </div>
  );
}

function StatPill({ label, value, color = "text-text-base" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1 px-2 rounded bg-bg-elevated text-xs">
      <span className="text-text-dim">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}

// ─── Character Sheet ──────────────────────────────────────────────────────────

function CharacterSheet({ char }: { char: CharacterData }) {
  const [showAllFeats, setShowAllFeats] = useState(false);
  const s = char.stats;
  const feats = char.feats ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-bold text-text-base">
              {char.name}
              {char.isPlayerCharacter && <span className="ml-2 text-yellow text-sm">★ Player</span>}
            </div>
            {/* Class line */}
            {char.class && (
              <div className="text-sm text-purple mt-0.5 font-semibold">
                {char.class.className}
                {char.class.archetypeName && (
                  <span className="text-text-dim font-normal"> — {char.class.archetypeName}</span>
                )}
                <span className="ml-2 text-orange">Level {char.class.level}</span>
              </div>
            )}
          </div>
          {s && (
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold text-green">{s.hp}<span className="text-sm text-text-dim">/{s.hpMax}</span></div>
              <div className="text-xs text-text-dim">Hit Points</div>
            </div>
          )}
        </div>

        {/* Identity grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs border-t border-bg-border pt-3">
          {char.race && (
            <div><span className="text-text-dim">Race: </span><span className="text-text-base font-semibold">{char.race}</span></div>
          )}
          {char.gender && (
            <div><span className="text-text-dim">Gender: </span><span className="text-text-base">{char.gender}</span></div>
          )}
          {char.alignment && (
            <div><span className="text-text-dim">Alignment: </span><span className="text-cyan font-semibold">{char.alignment}</span></div>
          )}
          {char.background && (
            <div><span className="text-text-dim">Background: </span><span className="text-text-base">{char.background}</span></div>
          )}
          {char.deity && (
            <div><span className="text-text-dim">Deity: </span><span className="text-yellow">{char.deity}</span></div>
          )}
        </div>
      </div>

      {s && (
        <>
          {/* Ability Scores */}
          <div className="card">
            <div className="section-title">Ability Scores</div>
            <div className="flex gap-2 flex-wrap">
              <AbilityScore label="STR" score={s.str} />
              <AbilityScore label="DEX" score={s.dex} />
              <AbilityScore label="CON" score={s.con} />
              <AbilityScore label="INT" score={s.int} />
              <AbilityScore label="WIS" score={s.wis} />
              <AbilityScore label="CHA" score={s.cha} />
            </div>
          </div>

          {/* Combat Stats */}
          <div className="card">
            <div className="section-title">Combat</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <StatPill label="AC" value={s.ac} color="text-cyan" />
              <StatPill label="BAB" value={sign(s.bab)} color="text-orange" />
              <StatPill label="Initiative" value={sign(s.initiative)} color="text-yellow" />
              <StatPill label="Speed" value={`${s.speed} ft`} />
              <StatPill label="CMB" value={sign(s.cmb)} />
              <StatPill label="CMD" value={s.cmd} />
            </div>
          </div>

          {/* Saving Throws */}
          <div className="card">
            <div className="section-title">Saving Throws</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center bg-bg-elevated rounded p-2">
                <div className="text-xs text-text-dim">Fortitude</div>
                <div className={`text-xl font-bold ${saveColor(s.fortSave)}`}>{sign(s.fortSave)}</div>
              </div>
              <div className="flex flex-col items-center bg-bg-elevated rounded p-2">
                <div className="text-xs text-text-dim">Reflex</div>
                <div className={`text-xl font-bold ${saveColor(s.reflexSave)}`}>{sign(s.reflexSave)}</div>
              </div>
              <div className="flex flex-col items-center bg-bg-elevated rounded p-2">
                <div className="text-xs text-text-dim">Will</div>
                <div className={`text-xl font-bold ${saveColor(s.willSave)}`}>{sign(s.willSave)}</div>
              </div>
            </div>
          </div>

          {/* Skills */}
          {Object.keys(s.skills).length > 0 && (
            <div className="card">
              <div className="section-title">Skills</div>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(s.skills)
                  .sort((a, b) => b[1] - a[1])
                  .map(([skill, val]) => (
                    <div key={skill} className="flex justify-between py-0.5 px-2 rounded hover:bg-bg-elevated text-xs">
                      <span className="text-text-muted">{skill}</span>
                      <span className={`font-semibold ${val >= 8 ? "text-green" : val >= 4 ? "text-cyan" : val < 0 ? "text-red" : "text-text-base"}`}>
                        {sign(val)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Equipment */}
      {char.equipment && char.equipment.length > 0 && (
        <div className="card">
          <div className="section-title">Equipment</div>
          <div className="grid grid-cols-2 gap-1">
            {char.equipment.map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-bg-elevated text-xs">
                <span className={`w-20 shrink-0 ${
                  item.slot === "Main Hand" ? "text-pink" :
                  item.slot === "Off Hand" ? "text-orange" :
                  item.slot === "Armor" ? "text-blue" : "text-text-dim"
                }`}>{item.slot}</span>
                <span className="text-text-muted">{item.name}</span>
                {!item.isIdentified && <span className="text-orange text-[10px]">?</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Racial / Background / Class Traits */}
      {char.traits && char.traits.length > 0 && (() => {
        const racial = char.traits.filter((t) => t.category === "racial");
        const background = char.traits.filter((t) => t.category === "background");
        const classFeats = char.traits.filter((t) => t.category === "class" || t.category === "other");

        function TraitGroup({ title, items, color }: { title: string; items: typeof char.traits; color: string }) {
          if (!items || items.length === 0) return null;
          return (
            <div>
              <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${color}`}>{title}</div>
              <div className="flex flex-wrap gap-1">
                {items.map((t) => (
                  <span key={t.guid} className="text-xs bg-bg-elevated px-2 py-0.5 rounded text-text-muted">
                    {t.displayName}
                  </span>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div className="card space-y-3">
            <div className="section-title">Traits & Class Features</div>
            <TraitGroup title="Racial Traits" items={racial} color="text-cyan" />
            <TraitGroup title="Background Traits" items={background} color="text-yellow" />
            <TraitGroup title="Class Features" items={classFeats} color="text-purple" />
          </div>
        );
      })()}

      {/* Chosen Feats */}
      {feats.length > 0 && (
        <div className="card">
          <div className="section-title">Feats &amp; Class Features</div>
          <div className="flex items-center gap-2 px-2 py-0.5 text-[10px] text-text-dim border-b border-bg-border mb-1">
            <span className="w-5 shrink-0">Lv</span>
            <span>Feat / ability (character level acquired)</span>
          </div>
          <div className="space-y-1">
            {(showAllFeats ? feats : feats.slice(0, 12)).map((f) => (
              <div key={f.guid} className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-bg-elevated">
                <span className="text-xs text-text-dim w-5 shrink-0">{f.level}</span>
                <span className="text-xs text-text-muted">{f.name}</span>
              </div>
            ))}
            {feats.length > 12 && (
              <button
                onClick={() => setShowAllFeats(!showAllFeats)}
                className="text-xs text-text-dim hover:text-purple mt-1 px-2"
              >
                {showAllFeats ? "Show less" : `+${feats.length - 12} more`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Spellbook summary */}
      {char.spellbook && (
        <div className="card">
          <div className="section-title">Spellbook</div>
          <div className="text-xs text-text-dim mb-2">
            {char.spellbook.type} caster · level {char.spellbook.casterLevel}
          </div>
          <div className="flex gap-2 flex-wrap">
            {char.spellbook.slots.map((slot) => (
              <span key={slot.level} className="text-xs">
                <span className="text-text-dim">L{slot.level}: </span>
                <span className={slot.remaining === 0 ? "text-red" : "text-cyan"}>
                  {slot.remaining}/{slot.total}
                </span>
              </span>
            ))}
          </div>
          <div className="mt-2 text-xs text-text-dim">
            {char.spellbook.knownSpells.reduce((n, l) => n + l.length, 0)} spells known across {char.spellbook.knownSpells.filter(l => l.length > 0).length} levels
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Characters() {
  const { party, loading } = useLiveSave();
  const [selected, setSelected] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Scroll the character sheet back to top whenever the selected character changes
  useEffect(() => {
    sheetRef.current?.scrollTo(0, 0);
  }, [selected]);

  if (loading && !party) {
    return <div className="text-text-dim text-sm animate-pulse">Loading...</div>;
  }
  if (!party) {
    return <div className="card text-text-muted text-sm">No save data.</div>;
  }

  const chars = party.characters;
  const active = chars[selected];

  return (
    <div className="flex gap-6 max-w-4xl">
      {/* Character selector */}
      <div className="w-36 shrink-0 space-y-1">
        <div className="section-title">Characters</div>
        {chars.map((c, i) => (
          <button
            key={c.uniqueId}
            onClick={() => setSelected(i)}
            className={[
              "w-full text-left px-3 py-2 rounded text-sm transition-colors",
              i === selected
                ? "bg-bg-elevated border border-bg-border2 text-purple"
                : "text-text-muted hover:text-text-base hover:bg-bg-elevated",
            ].join(" ")}
          >
            <div className="font-semibold truncate">{c.name}</div>
            {c.class && (
              <div className="text-xs text-text-dim truncate">
                {c.class.className} {c.class.level}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Sheet */}
      <div ref={sheetRef} className="flex-1 overflow-auto">
        {active && <CharacterSheet char={active} />}
      </div>
    </div>
  );
}
