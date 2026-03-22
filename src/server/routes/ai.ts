import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolResultBlockParam, ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import { parseSave } from "../services/save-parser.ts";
import { searchAon, fetchAonPage } from "../services/aon-search.ts";
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
    if (char.class) {
      const arch = char.class.archetypeName ? ` (${char.class.archetypeName})` : "";
      lines.push(`  Class: ${char.class.className}${arch} level ${char.class.level}`);
    }
    if (char.spellbook) {
      const sb = char.spellbook;
      lines.push(`  Spellbook type: ${sb.type}, caster level: ${sb.casterLevel}`);
      const slotsLine = sb.slots
        .filter((s) => s.total > 0)
        .map((s) => `L${s.level}:${s.remaining}/${s.total}`)
        .join(" ");
      if (slotsLine) lines.push(`  Slots remaining: ${slotsLine}`);

      const knownFlat = sb.knownSpells.flatMap((lvl, i) =>
        lvl.slice(0, 5).map((s) => `${s.name}(L${i})`)
      );
      if (knownFlat.length) lines.push(`  Known spells (sample): ${knownFlat.slice(0, 15).join(", ")}`);

      const prepared = sb.preparedSpells.flatMap((l) => l.slots.map((s) => `${s.spellName}(L${l.level})`));
      if (prepared.length) lines.push(`  Prepared: ${prepared.join(", ")}`);
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
  const systemWithContext = `${SYSTEM_PROMPT}\n\n## LIVE PARTY DATA\n${analysisBlock}`;

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
