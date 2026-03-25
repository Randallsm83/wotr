import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolResultBlockParam, ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import { parseSave } from "../services/save-parser.ts";
import { searchAon, fetchAonPage } from "../services/aon-search.ts";
import { getBuilds } from "../services/build-store.ts";
import type { ChatRequest, PartyData } from "../models/types.ts";

const app = new Hono();

const SYSTEM_PROMPT = `You are a Pathfinder: Wrath of the Righteous expert companion assistant.
You have access to the player's current save data and two tools to look up Pathfinder 1e rules
from the Archives of Nethys (aonprd.com).

USE THE TOOLS whenever:
- You need exact spell descriptions, ranges, durations, or effects
- You need class/archetype details, feature descriptions, or level progression
- You need feat prerequisites, benefits, or stacking rules
- You need monster stats, abilities, or tactics
- You need any rule you're not 100% certain about
- The player asks about a specific rule, item, condition, or ability

Do NOT guess at rules. If in doubt, search for it.

You understand WotR-specific context:
- WotR uses Pathfinder 1e rules (not 2e)
- Mythic system, crusade mechanics, corruption
- Common mods: TabletopTweaks, ExpandedContent, BubbleBuffs, WrathPatches (which may alter base rules)
- Auto-level companions are assigned preset builds by the game; manual leveling unlocks optimised builds

## COMPANION BUILD META (WotR optimised builds based on community knowledge)

Seelah (Paladin):
- Auto: pure Paladin. Optimised: Paladin 18 / Dragon Disciple 4 or Paladin 16 / Mutation Warrior 4.
- Role: frontline tank/support. Divine Grace (CHA to saves) is her best feature — stack CHA.
- Key: Mythic Smite Evil hits all enemies in range (massive AoE damage). Use Crusade bond for weapon enhancement.
- Best mythic: Angel (Divine Power), Aeon (dispel synergy), Legend (multiclass freedom).

Camellia (Spirit Hunter Shaman):
- Auto: Spirit Hunter Shaman. Optimised: Spirit Hunter 16 / Lore Master 4.
- Role: debuffer / CC / off-healer. Evil Eye hex is the best debuff in the game (stacks with everything).
- Key: Evil Eye → Cackle (free action each round to extend hexes). Spirit animal provides party buffs.
- Instinctual Warrior dip (Ex-Instinctual Warrior) gives Uncanny Dodge and AC bonuses.
- Best mythic: any path; hexes work everywhere.

Wenduag (Fighter / Ranger archetype):
- Auto: fighter. Optimised: Child of the Manticore (mounted ranged fighter archetype) or Spawn Slayer.
- Child of the Manticore gives mounted archery + point-blank shot as free feats, and a leopard companion.
- Key: Point-Blank Shot → Precise Shot → Rapid Shot → Manyshot. Mount gives free charge mobility.
- Best mythic: Trickster (Trickster Lore for ranged feats), Demon (Aspect of Demon buffs).

Lann (Monkbow / Shifter):
- Auto: divine hound. Optimised: Shifter (wild shape melee) or Demonslayer Ranger 16 / Gendarme Cavalier 4.
- Shifter Lann gets powerful wild shape natural attacks; Demonslayer gives Favoured Enemy bonuses.
- Key: If Shifter, stack wild shape. If mounted, same strategy as Wenduag (mounted ranged).
- Best mythic: Demon (Aspect of Demon for martial builds), Trickster.

Woljif (Vivisectionist Alchemist / Eldritch Scoundrel):
- Auto: Vivisectionist. Optimised: Vivisectionist 12 / Eldritch Scoundrel Rogue 8.
- Role: flanking DPS. Mutagen gives +6 STR/DEX, sneak attack stacks between classes.
- Key: Requires flanking or flat-footed for sneak attack. Use invisibility/Greater Invisibility before combat.
- Best mythic: Trickster (free sneak attack on every hit), Azata, Lich.

Ember (Stigmatized Witch / Lore Master):
- Auto: Stigmatized Witch. Optimised: Stigmatized Witch 16 / Lore Master 4.
- Role: debuffer / CC. Same Evil Eye + Cackle loop as Camellia but arcane.
- Key: Misfortune hex forces enemies to roll twice and take worse result — combine with Evil Eye.
- Best mythic: Azata (Zippy Magic doubles hex applications), any.

Nenio (Wizard / Eldritch Knight):
- Auto: Scroll Savant Wizard. Optimised: Scroll Savant 7 / Eldritch Knight 10 / Lore Master 3.
- Role: blaster / gish hybrid. Scroll Savant can use any scroll with full CL.
- Key: High INT for spell DCs. Eldritch Knight adds BAB for melee if desired. Buff with Mirror Image / Blur.
- Best mythic: Trickster (Trickster Arcana for broken spell tricks), Lich (undead synergy), Azata.

Daeran (Oracle):
- Auto: Oracle. Role: best healer in the game, spontaneous divine caster with high spell slots.
- Key: Lots of Cure slots. Divine Power turns him into a martial. Dual-Cursed Oracle (optimised) gets Misfortune.
- Best mythic: Angel (Channel Positive Energy empowerment), Azata, Aeon.

Sosiel (Cleric):
- Auto: Cleric. Role: buffer / healer with prepared spell flexibility.
- Key: Crusader archetype (optimised) gives martial BAB and weapon proficiency. Good Hope + Bless + Prayer stack.
- Best mythic: Angel, Legend (prestige into Lore Master).

Regill (Armiger / Hellknight Signifier):
- Auto: Armiger. Optimised: Armiger → Hellknight Signifier or Gendarme Cavalier.
- Role: frontline DPS with Order of the Nail intimidate.
- Key: Hellknight Signifier lets him cast in full plate. Fearsome Presence debuffs enemies.
- Best mythic: Trickster, Aeon, Legend.

Arueshalae (Espionage Expert Ranger):
- Auto / Optimised: Espionage Expert. This archetype is already excellent — sneak attack + combat feats.
- Role: ranged DPS with sneak attack. Gets TWF and Precise Shot free.
- Key: Greater Invisibility before combat for reliable sneak attack. Studied Target from multiclass helps.
- Best mythic: Azata (Zippy Magic hits twice), Trickster.

Greybor (Slayer / Mutation Warrior):
- Auto: Slayer. Optimised: Slayer 16 / Mutation Warrior Fighter 4.
- Role: DPS. Studied Target gives stacking attack/damage bonus to all rolls vs one target.
- Key: Mutagen + Studied Target is extremely high single-target damage. Stack Two-Handed weapon feats.
- Best mythic: Trickster, Demon, Legend.

## MYTHIC PATH CLASS SYNERGIES

Angel: Oracles, Clerics, Paladins, Druids, Bloodragers. Angel Mark + Holy damage enhancement. Holy Sword mythic ability.
Demon: Kineticists, Rangers, Cavaliers, Barbarians, Shifters. Demon Rage buffs martial stats. Demonic Charge teleport.
Trickster: Rogues, Fighters, Magus, Rangers, Cavaliers. Trickster Lore feats bypass prerequisites. Improved Improved Critical mythic feat is game-breaking.
Lich: Alchemists, Slayers, Monks, Magus, Witches. Undead army. Decaying Touch. Spell-like abilities from skeleton army.
Azata: Alchemists, Fighters, Bards, Sorcerers, Rogues, Skalds. Zippy Magic doubles any single-target spell/hex. Songs of Steel adds martial feats.
Aeon: Inquisitors, Paladins, Monks. Aeon Bane is powerful dispel. Decree debuffs entire enemy groups permanently.
Legend (non-mythic): Gives 60 class levels total — ideal for multiclass builds like Vivisectionist/Eldritch Scoundrel.
Gold Dragon: Druids, nature casters. Very limited build count — niche path.
Swarm-That-Walks: Oracles (oracle/swarm synergy). Very limited.
Devil: Sorcerers, charisma casters. Contract abilities. Very limited builds.

## MYTHIC PATH UNLOCK REQUIREMENTS (CRITICAL — many are missable)

Angel: Unlocked by default. No special action needed.

Demon: Unlocked by default. Accept Demon path at end of Ch2.

Aeon: Ch1 — find Aeon remnant in book event when resting, choose to let him join you. At end of Ch1, use crystal knife to destroy the Wardstone (instead of using it normally). This unlocks Aeon choice at end of Ch2.
- Key decision: True Aeon vs Renegade Aeon vs Devil (Aeon). True Aeon = follow law strictly, unlocks maximum time travel outcomes and unique ending. Renegade = mercy choices. Devil = greed choices, can transition to Devil path.
- Unique ending: Undo the Worldwound entirely by traveling to the past (requires saving Terendelev in Ch5 time travel).

Azata: MISSABLE in Ch1. Complete Starward Gaze quest — find Ramien, spare him from Hulrun, find his 3 disciples (Ilkes, Aranka/Daeran's mansion, Thall/Market Square). In Desna temple, MUST choose to sing the Song of Elysium. Do NOT kill Ramien or any disciple or Azata is permanently locked.
- Key decisions: Free Crusader recruits determine route (True/Chaos/Evil). Evil route can transition to Devil in Ch5.
- Unique ending: Crash the island into the former Worldwound (requires 8 Azata levels).

Trickster: MISSABLE in Ch1. In Blackwing Library, pass Religion or Perception check to spot cultists (Tieflings auto-pass). Select the [Give in to strange instinct] dialogue to yell in Baphomet's name. Must be done BEFORE end of Ch2.
- Key decisions: Coronate the Fool King (Thaberdine) for unique army bonuses and Chapter 5 ultimate attack. Mess with Council members 8+ times for Crossroads ending option.
- Unique ending: Open reality crossroads (requires Crossroads ending setup).

Lich: MISSABLE across Ch1-2. Step 1 — find Zacharius's Wand in caves beneath Leper's Smile; do NOT destroy it. Step 2 — keep the wand on you when first visiting Lost Chapel; secret basement appears with Zacharius. Give him the wand to unlock Lich.
- Key decisions: Phylactery form depends on what items you have when doing the ritual. Zacharius friendship (gives Clasp of Death) requires: correct Ch4 analysis + kill both Elyanka/Septimus + perform all 3 sacrifices.
- Unique ending: Throw phylactery into Worldwound to close it (requires Phylactery not destroyed + Lich level 8).

Legend: REQUIRES ACTIVE EFFORT across Ch1-5. Collect 3 Legend Flags: (1) Reject power offer in Areelu's Lab Ch1, (2) Reject power when Areelu offers it in Ch4 conversation, (3) Use Legend ultimate (rally troops) during retaking of Drezen in Ch5. With all 3 flags, the stat check to reject godhood at Goddess Summit in Ch5 drops to DC 1 (automatic pass).
- You can still get Legend with 0-2 flags but need a high raw stat check or Arue romance (Demon) for the -5 bonus.
- Unique ending: Sever soul connection to close Worldwound (no one needs to die).

Gold Dragon: MISSABLE in Prologue. MUST save one of Terendelev's Scales in the prologue. Show it to the Storyteller, then get Terendelev's Claw from Leper's Smile. Visit Terendelev's Lair, show dragon spirit (spare the cultist). At Ch5 Goddess Summit, Gold Dragon becomes available.
- Key decisions: Side with Hokugaul (holy kneepads) or Lathimas (unholy kneepads + risk Corrupt Dragon route). Sparing Sevalros affects ending slide.
- Unique ending: Leave Worldwound open, dedicate life to guarding it.

Devil: NOT a starting path. Obtained by transition from Aeon (accumulate devil points, face Meliss's trial at start of Ch5 time travel event) or from Azata (Evil route + accept Mephistopheles offer in Ch5). Devil is not playable from the start.

Swarm-That-Walks: Available from start like Angel/Demon. Very story-light, only one known community build (Oracle/Swarm). Author of the guide index refuses to document it.

## MYTHIC PATH KEY MECHANICS

Aeon time travel: Ch3 (save/reform Staunton), Ch4 (deal with Xantir/Swarm prototype), Ch5 (revisit prologue, save Terendelev). True Aeon options require True dominant counter. People saved by time travel join you in final battle.

Angel route (Salvation vs Retribution): 3 choices across Ch1-3 determine route. Salvation = redeem, Retribution = punish. Affects 5 dialogue lines and one ending slide. Angel unique bonus boss: fight Deskari after final boss if you sacrifice Areelu.

Azata Freedom score: Tracked across Ch3-4. ~10 freedom choices available. Freedom Demon (score 0-10 is "Total Freedom") vs Tyranny. Determines Ch5 outcome (who you side with vs Nocticula/Shamira). Also affects ability to become consort.

Demon Doppelganger: If you reveal 2+ pieces of info during Ch3 torture sequence, doppelganger becomes convincing enough to cause you to lose 300 exp of crusade units.

Lich Grave Guard: Staunton, Delamere, Ciar (Ch3), Kestoglyr (Ch4), Galfrey (Ch5). Can be fully assembled for an undead-only party. Zacharius's phylactery (after killing him) grants Finger of Death ignoring SR.

Legend army: After gaining Legend, various NPCs from other paths (Targona/Angel, Aivu/Azata, Mephistopheles/Devil, Zacharius/Lich, Shamira/Demon, Hal/Gold Dragon) show up as freeloaders. Accept them to get their armies and rank-up events. Reject them to lose Legend-specific army bonuses.

Gold Dragon Corrupt route: In the Dragon Burial Ground (Ch4 quest), side with Lathimas then say you vow to serve Dahak. Changes some army upgrades and blocks the unique Gold Dragon ending.

## GENERAL WotR COMBAT TIPS

- Pre-combat buffs win fights. Bless + Prayer + Haste + Good Hope + Heroism stack (different bonus types).
- Flanking enables sneak attack and gives +2 to attack. Position DPS characters on opposite sides of target.
- Evil Eye + Misfortune + Fortune hexes are the strongest debuff/buff loop in the game (all free actions via Cackle).
- Mythic Power Attack removes all attack penalties from Power Attack when used with Furious Focus.
- Stacking bonus types: morale (Bless), luck (Prayer), competence (Heroism), circumstance, enhancement — all stack.
- On Core/Hard: rest before every major fight. On Unfair: perfect pre-buff rotation is mandatory.

## PF1e FUNDAMENTALS (for new players — source: spoiler-free new player guide v0.4.12)

Bonus type stacking: Bonuses of the SAME type don’t stack — only the highest applies. Bonuses of DIFFERENT types all stack.
Examples: two Morale bonuses don’t stack (Heroism and Good Hope are both morale). But Morale + Sacred + Luck + Enhancement all stack.
Two exceptions: Dodge bonuses (Haste, Dodge feat, Fighting Defensively) all stack with each other. Natural Armor bonuses also stack.

AC types:
- Regular AC: all bonuses apply.
- Flat-footed AC: loses Dex mod and all Dodge bonuses. Enemies who haven’t acted yet are flat-footed. Shatter Defenses + Shaken = attacks target flat-footed AC.
- Touch AC: loses Armor, Shield, Natural Armor bonuses. Used by touch attack spells (Scorching Ray, etc.).
Unarmored tanks: Bracers of Armor + Mage Armor (up to +14 with Archmage Armor mythic) + Shield spell often gives MORE AC than heavy armor. Monk 1 dip adds Wis to AC.

Action types per round: 1 Standard (cast spell, attack, use ability), 1 Move (move or drink potion), 1 Swift (paladin Smite, Quickened spells), any number of Free (toggle Power Attack). Full Attack uses both Standard + Move.
To Full Attack + move: mount/Pounce ability, or the TBM/RTWP exploit (switch to RTWP, order attack, switch back to TBM mid-movement).

Flanking (WotR CRPG rule): Any ally threatening the same target gives flanking (+2 attack). No grid positioning needed unlike TTRPG. Outflank feat increases this to +4 and triggers AoO on allied crits.
Surprise round trick: Player vision is 50ft, enemy vision is 30ft. Queue a spell/Charge outside enemy vision for a free surprise turn.

Demons (main enemies Ch2+):
- DR 10/Cold Iron or Good: use Cold Iron weapons, Holy weapons, or +5 enchantment to bypass.
- Immunity to electricity: never use Lightning Bolt/Chain Lightning on demons.
- Energy Resistance to Fire, Cold, Acid: use Sonic damage or Holy/Force damage instead.
- Spell Resistance = 10 + their HD. Spell Penetration feat (+2 each) needed for spellcasters.
- Most are Chaotic Evil — Axiomatic (Lawful) + Holy (Good) weapons both apply their 2d6 bonus vs CE targets, and they stack.

Corruption: Each rest adds 30 corruption (60 in corrupted areas). Penalties kick in at 90/150/210. Protective Rituals camp role (Lore Religion check) reduces accrual to 2/3. Rest in camp/safe zone to reset to 0.

Spell Resistance check: d20 + Caster Level vs SR. Feats: Spell Penetration +2, Greater Spell Penetration +2, Mythic Spell Penetration adds half MR (or full MR with Greater). All Mythic Paths except one boost CL or penetration by MR4.

Slash commands:
- /buffs — available buffs and prep recommendations for current party
- /combat — combat tips for current party composition
- /next-level — level-up recommendations for each character
- /party — full party composition analysis
`;

function buildContextBlock(data: PartyData): string {
  const lines = [
    `## Current Save: ${data.meta.name}`,
    `Area: ${data.meta.area}`,
    `Player: ${data.meta.playerCharacterName}`,
    `Game time: ${data.meta.gameTotalTime}`,
    `Mods: ${data.meta.mods.map((m) => `${m.id} v${m.version}`).join(", ")}`,
    "",
    "## Party",
  ];

  for (const char of data.characters) {
    lines.push(`### ${char.name}${char.isPlayerCharacter ? " (player)" : ""}`);

    // Class + identity
    if (char.class) {
      const arch = char.class.archetypeName ? ` (${char.class.archetypeName})` : "";
      lines.push(`  Class: ${char.class.className}${arch} level ${char.class.level}`);
    }
    const identity = [char.race, char.alignment, char.background, char.deity ? `worships ${char.deity}` : null]
      .filter(Boolean).join(", ");
    if (identity) lines.push(`  Identity: ${identity}`);

    // Ability scores
    if (char.stats) {
      const s = char.stats;
      lines.push(`  Ability scores: STR ${s.str} DEX ${s.dex} CON ${s.con} INT ${s.int} WIS ${s.wis} CHA ${s.cha}`);
      lines.push(`  Combat: HP ${s.hp}/${s.hpMax} AC ${s.ac} BAB +${s.bab} Fort +${s.fortSave} Ref +${s.reflexSave} Will +${s.willSave}`);
    }

    // Feats
    if (char.feats && char.feats.length > 0) {
      const featList = char.feats.slice(0, 20).map((f) => f.name).join(", ");
      lines.push(`  Feats: ${featList}`);
    }

    // Equipment
    if (char.equipment && char.equipment.length > 0) {
      const equip = char.equipment.map((e) => `${e.slot}: ${e.name}`).join(", ");
      lines.push(`  Equipment: ${equip}`);
    }

    // Spellbook
    if (char.spellbook) {
      const sb = char.spellbook;
      lines.push(`  Spellbook: ${sb.type}, caster level ${sb.casterLevel}`);
      const slotsLine = sb.slots
        .filter((s) => s.total > 0)
        .map((s) => `L${s.level}:${s.remaining}/${s.total}`)
        .join(" ");
      if (slotsLine) lines.push(`  Slots remaining: ${slotsLine}`);
      const knownFlat = sb.knownSpells.flatMap((lvl, i) =>
        lvl.map((s) => `${s.name}(L${i})`)
      );
      if (knownFlat.length) lines.push(`  Known spells: ${knownFlat.slice(0, 30).join(", ")}`);
      const prepared = sb.preparedSpells.flatMap((l) => l.slots.map((s) => `${s.spellName}(L${l.level})`));
      if (prepared.length) lines.push(`  Prepared today: ${prepared.join(", ")}`);
    } else {
      lines.push("  Non-spellcaster");
    }
  }

  return lines.join("\n");
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const AON_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_rules",
    description:
      "Search the Archives of Nethys (aonprd.com) for Pathfinder 1e rules. " +
      "Use for spells, feats, classes, archetypes, monsters, items, conditions, traits, " +
      "equipment, magic items, prestige classes, or any other game rule. " +
      "Returns up to 5 matching entries with name, type, URL, and rule text.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query, e.g. 'Bless spell', 'Vital Strike feat', 'Shaman Spirit Hunter archetype', 'stacking bonuses rules'",
        },
        types: {
          type: "array",
          items: { type: "string" },
          description: "Optional category filter. Valid values: Spell, Feat, Class, Archetype, Monster, Item, Trait, Condition, Rule, Equipment, Weapon, Armor, Magic Item, Prestige Class, Skill",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_rule_page",
    description:
      "Fetch the full text of a specific Archives of Nethys page. " +
      "Use this after search_rules to get complete details about an entry, " +
      "or when you have a direct URL like 'https://www.aonprd.com/SpellDisplay.aspx?ItemName=Bless'. " +
      "Returns the full rule text of the page.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "Full URL to fetch, e.g. https://www.aonprd.com/SpellDisplay.aspx?ItemName=Bless",
        },
      },
      required: ["url"],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, any>
): Promise<string> {
  if (name === "search_rules") {
    const results = await searchAon(input.query, input.types);
    if (results.length === 0) {
      return `No results found for "${input.query}" on aonprd.com.`;
    }
    return results
      .map((r, i) =>
        `[${i + 1}] **${r.name}** (${r.type})\nURL: ${r.url}\n${r.text}`
      )
      .join("\n\n---\n\n");
  }

  if (name === "fetch_rule_page") {
    return await fetchAonPage(input.url);
  }

  return `Unknown tool: ${name}`;
}

// ─── POST /api/ai/chat ────────────────────────────────────────────────────────

/** Agentic chat with AoN tool use + SSE streaming final response */
app.post("/chat", async (c) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return c.json({ error: "ANTHROPIC_API_KEY not set" }, 500);
  }

  let body: ChatRequest;
  try {
    body = await c.req.json<ChatRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const partyData = body.partyContext ?? (await parseSave());
  const analysisBlock = partyData ? buildContextBlock(partyData) : "No save data available.";

  // Append build profiles so advice is role-aware
  const buildProfiles = getBuilds();
  const buildBlock = buildProfiles.length > 0
    ? "\n\n## BUILD GOALS\n" + buildProfiles.map((p) => {
        const lines = [`### ${p.characterName} — ${p.role}`];
        if (p.classPath) lines.push(`Path: ${p.classPath}`);
        if (p.mythicPath) lines.push(`Mythic: ${p.mythicPath}`);
        if (p.notes)     lines.push(`Notes: ${p.notes}`);
        return lines.join("\n");
      }).join("\n\n")
    : "";

  const systemWithContext = `${SYSTEM_PROMPT}\n\n## LIVE PARTY DATA\n${analysisBlock}${buildBlock}`;

  const client = new Anthropic({ apiKey });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        // Build message history
        let messages: MessageParam[] = body.messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // ── Agentic loop ──────────────────────────────────────────────────────
        // Keep calling until stop_reason is "end_turn" (no more tool calls)
        const MAX_ITERATIONS = 8;
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          const response = await client.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 2048,
            system: systemWithContext,
            tools: AON_TOOLS,
            messages,
          });

          if (response.stop_reason === "tool_use") {
            // Notify client which tools are being called
            const toolCalls = response.content.filter((b) => b.type === "tool_use");
            for (const t of toolCalls) {
              if (t.type === "tool_use") {
                send({ tool: t.name, input: t.input });
              }
            }

            // Execute all tool calls in parallel
            const toolResults = await Promise.all(
              response.content
                .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
                .map(async (t): Promise<ToolResultBlockParam> => ({
                  type: "tool_result",
                  tool_use_id: t.id,
                  content: await executeTool(t.name, t.input as Record<string, any>),
                }))
            );

            // Append assistant turn + tool results, continue loop
            messages = [
              ...messages,
              { role: "assistant", content: response.content },
              { role: "user",      content: toolResults },
            ];
            continue;
          }

          // stop_reason === "end_turn" — stream the final text response
          const textBlocks = response.content.filter((b) => b.type === "text");
          for (const block of textBlocks) {
            if (block.type === "text") {
              // Chunk the text to simulate streaming
              const text = block.text;
              const CHUNK = 40;
              for (let i = 0; i < text.length; i += CHUNK) {
                send({ text: text.slice(i, i + CHUNK) });
              }
            }
          }
          break;
        }

        send({ done: true });
      } catch (e: any) {
        send({ error: e.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

export default app;
