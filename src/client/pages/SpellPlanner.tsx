import { useState } from "react";
import { useLiveSave } from "../hooks/useLiveSave.ts";
import type { CharacterData, SpellEntry } from "../../../src/server/models/types.ts";

function spellCategory(name: string): "cantrip" | "buff" | "heal" | "cc" | "damage" | "other" {
  const n = name.toLowerCase();
  if (n.includes("cure") || n.includes("heal") || n.includes("stabilize") || n.includes("layonhands")) return "heal";
  if (n.includes("bless") || n.includes("protection") || n.includes("magic") && n.includes("weapon") ||
      n.includes("haste") || n.includes("heroism") || n.includes("guidance") || n.includes("virtue") ||
      n.includes("resistance") || n.includes("blur") || n.includes("mirror") || n.includes("stoneskin") ||
      n.includes("removefear") || n.includes("unbreakable") || n.includes("communal")) return "buff";
  if (n.includes("sleep") || n.includes("hold") || n.includes("entangle") || n.includes("daze") ||
      n.includes("causefear") || n.includes("haze") || n.includes("strand")) return "cc";
  if (n.includes("burning") || n.includes("inflict") || n.includes("doom") || n.includes("bane") ||
      n.includes("divinezap") || n.includes("unholyzap")) return "damage";
  return "other";
}

const CATEGORY_COLOR: Record<string, string> = {
  buff: "text-blue border-blue/40",
  heal: "text-green border-green/40",
  cc: "text-cyan border-cyan/40",
  damage: "text-red border-red/40",
  cantrip: "text-purple border-purple/30",
  other: "text-text-dim border-bg-border2",
};

function SpellRow({ spell, prepared }: { spell: SpellEntry; prepared: boolean }) {
  const cat = spell.isCantrip ? "cantrip" : spellCategory(spell.name);
  return (
    <div className={`flex items-center justify-between py-1 px-2 rounded ${prepared ? "bg-bg-elevated" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs w-5 text-center rounded border px-0.5 ${CATEGORY_COLOR[cat] ?? CATEGORY_COLOR.other}`}>
          {spell.isCantrip ? "0" : spell.spellLevel}
        </span>
        <span className="text-sm text-text-base">{spell.displayName || spell.name}</span>
      </div>
      <div className="flex items-center gap-2">
        {prepared && <span className="text-xs text-green">prepared</span>}
        {!prepared && !spell.isCantrip && <span className="text-xs text-text-dim">not prepared</span>}
        {spell.isCantrip && <span className="text-xs text-cyan">∞</span>}
      </div>
    </div>
  );
}

function CasterCard({ char }: { char: CharacterData }) {
  const sb = char.spellbook!;
  const preparedIds = new Set(sb.preparedSpells.flatMap((l) => l.slots.map((s) => s.spellBlueprintId)));

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
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
              <span className="ml-2 text-text-dim">{sb.type}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {sb.slots.map((slot) => (
            <span key={slot.level} className="text-xs">
              <span className="text-text-dim">L{slot.level}: </span>
              <span className={slot.remaining === 0 ? "text-red" : "text-cyan"}>
                {slot.remaining}/{slot.total}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Spells by level */}
      {sb.knownSpells.map((lvlSpells, lvlIdx) => {
        if (lvlSpells.length === 0) return null;
        return (
          <div key={lvlIdx}>
            <div className="text-xs text-text-dim uppercase tracking-wider mb-1">
              {lvlIdx === 0 ? "Cantrips / Orisons" : `Level ${lvlIdx}`}
            </div>
            <div className="space-y-0.5">
              {lvlSpells.map((spell) => (
                <SpellRow
                  key={spell.blueprintId}
                  spell={spell}
                  prepared={preparedIds.has(spell.blueprintId)}
                />
              ))}
            </div>
          </div>
        );
      })}

    </div>
  );
}

export default function SpellPlanner() {
  const { party, loading } = useLiveSave();
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (loading && !party) {
    return <div className="text-text-dim text-sm animate-pulse">Loading...</div>;
  }

  const allCasters = party?.characters.filter((c) => c.spellbook) ?? [];
  // Party members first, then at-camp
  const casters = [
    ...allCasters.filter(c => c.inParty),
    ...allCasters.filter(c => !c.inParty),
  ];
  const activeCaster = casters[Math.min(selectedIdx, casters.length - 1)];
  const partyCasterCount = casters.filter(c => c.inParty).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-purple font-bold text-sm tracking-widest uppercase">Spell Planner</h2>

      {casters.length === 0 && (
        <div className="card text-text-muted text-sm">No spellcasters found in current save.</div>
      )}

      {/* Caster selector — party first, then at camp */}
      {casters.length > 1 && (
        <div className="space-y-1">
          <div className="flex gap-1 flex-wrap">
            {casters.map((c, i) => (
              <>
                {i === partyCasterCount && i > 0 && (
                  <div key="divider" className="w-full flex items-center gap-2 mt-1 mb-0.5">
                    <span className="text-[10px] text-text-dim">AT CAMP</span>
                    <div className="flex-1 h-px bg-bg-border" />
                  </div>
                )}
                <button
                  key={c.uniqueId}
                  onClick={() => setSelectedIdx(i)}
                  className={[
                    "text-xs px-3 py-1.5 rounded border transition-colors",
                    i >= partyCasterCount ? "opacity-75" : "",
                    i === selectedIdx
                      ? "bg-bg-elevated border-bg-border2 text-purple"
                      : "border-bg-border text-text-muted hover:text-text-base hover:bg-bg-elevated",
                  ].join(" ")}
                >
                  {c.name}
                  {c.class && <span className="ml-1 opacity-50">{c.class.className} {c.class.level}</span>}
                </button>
              </>
            ))}
          </div>
        </div>
      )}

      {activeCaster && <CasterCard char={activeCaster} />}

      {/* Prep recommendation note */}
      <div className="card space-y-1">
        <div className="section-title">Prep Priorities</div>
        <div className="text-xs text-text-muted">Before resting, make sure to prepare:</div>
        <ul className="space-y-1 text-xs text-text-muted">
          <li className="flex gap-2"><span className="text-orange shrink-0">●</span>Nenio: Haste (L3) — must cast every combat. Glitterdust (L2) on fliers. Displacement (L3) on Kaede for tough fights.</li>
          <li className="flex gap-2"><span className="text-cyan shrink-0">●</span>Camellia: Barkskin (L2) ×2 minimum (Kaede + Sly). StinkingCloud (L3) and SickeningEntanglement for groups.</li>
          <li className="flex gap-2"><span className="text-green shrink-0">●</span>Daeran: Cure Serious Wounds ×2 minimum. Prayer (L3). HoldPerson (L2) as CC when needed.</li>
          <li className="flex gap-2"><span className="text-purple shrink-0">●</span>Sosiel: Prayer (L3) every fight. Bless (L1) + DivineFavor for frontliners. ProtectionFromEnergy (L3) before major fights.</li>
          <li className="flex gap-2"><span className="text-text-dim shrink-0">●</span>Kaede: Lead Blades (L1) every combat. ResistEnergy Fire (L1) on herself + Sly pre-rest.</li>
        </ul>
        <div className="text-[10px] text-text-dim pt-1 border-t border-bg-border">These recommendations come from the curated session guide. Open Field Guide for full details.</div>
      </div>
    </div>
  );
}
