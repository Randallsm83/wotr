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

const CATEGORY_BADGE: Record<string, string> = {
  buff: "badge-buff", heal: "badge-heal", cc: "badge-cc",
  damage: "badge-damage", cantrip: "badge-cantrip", other: "text-text-dim text-xs",
};

function SpellRow({ spell, prepared }: { spell: SpellEntry; prepared: boolean }) {
  const cat = spell.isCantrip ? "cantrip" : spellCategory(spell.name);
  return (
    <div className={`flex items-center justify-between py-1 px-2 rounded ${prepared ? "bg-bg-elevated" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={CATEGORY_BADGE[cat] || "text-text-dim text-xs"}>
          {spell.isCantrip ? "0" : spell.spellLevel}
        </span>
        <span className="text-sm text-text-base">{spell.name}</span>
        {spell.displayName && spell.displayName !== spell.name && (
          <span className="text-xs text-text-dim">({spell.displayName})</span>
        )}
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

  if (loading && !party) {
    return <div className="text-text-dim text-sm animate-pulse">Loading...</div>;
  }

  const casters = party?.characters.filter((c) => c.spellbook) ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-purple font-bold text-sm tracking-widest uppercase">Spell Planner</h2>

      {casters.length === 0 && (
        <div className="card text-text-muted text-sm">No spellcasters found in current save.</div>
      )}

      {casters.map((char) => (
        <CasterCard key={char.uniqueId} char={char} />
      ))}
    </div>
  );
}
