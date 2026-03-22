/**
 * Archives of Nethys (aonprd.com) search service.
 * Uses the AoN Elasticsearch endpoint for structured search,
 * plus direct page fetching for full rule text.
 * WotR uses Pathfinder 1e — target aonprd.com (not 2e.aonprd.com).
 */

const ES_ENDPOINT = "https://elasticsearch.aonprd.com/aon/_search";
const AON_BASE    = "https://www.aonprd.com";

export interface AonResult {
  name: string;
  type: string;
  url: string;
  text: string;
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search aonprd.com for any rule content.
 * @param query    Free-text query (e.g. "bless spell", "Shaman class", "Vital Strike feat")
 * @param types    Optional filter by category (e.g. ["Spell","Feat","Class","Monster","Item"])
 * @param limit    Max results (default 5)
 */
export async function searchAon(
  query: string,
  types?: string[],
  limit = 5
): Promise<AonResult[]> {
  const mustFilters: any[] = [];
  if (types && types.length > 0) {
    mustFilters.push({ terms: { type: types.map((t) => t.toLowerCase()) } });
  }

  const body = {
    query: {
      function_score: {
        query: {
          bool: {
            must: mustFilters,
            should: [
              { match_phrase:  { name:  { query, boost: 20 } } },
              { multi_match:   { query, fields: ["name^10", "type^3", "text^1"], type: "best_fields" } },
            ],
            minimum_should_match: 1,
          },
        },
        boost_mode: "multiply",
      },
    },
    size: limit,
    _source: ["name", "type", "url", "text"],
    highlight: {
      fields: { text: { fragment_size: 400, number_of_fragments: 2 } },
    },
  };

  try {
    const res = await fetch(ES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`ES responded ${res.status}`);
    const data = await res.json() as any;
    const hits: any[] = data?.hits?.hits ?? [];

    return hits.map((h) => ({
      name: h._source.name ?? "",
      type: h._source.type ?? "",
      url:  h._source.url ? `${AON_BASE}/${h._source.url}` : "",
      text: extractText(h._source.text, h.highlight?.text),
    }));
  } catch (e: any) {
    console.warn("[aon] search failed:", e.message);
    return [];
  }
}

/**
 * Fetch the full text of a specific AoN page.
 * Pass the URL from a search result or construct one like:
 *   https://www.aonprd.com/SpellDisplay.aspx?ItemName=Bless
 */
export async function fetchAonPage(url: string): Promise<string> {
  // Ensure absolute URL
  const target = url.startsWith("http") ? url : `${AON_BASE}/${url}`;

  try {
    const res = await fetch(target, {
      headers: { "User-Agent": "WotR-Companion/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return extractPageText(html, target);
  } catch (e: any) {
    console.warn("[aon] fetch failed:", e.message);
    return `Failed to fetch ${target}: ${e.message}`;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractText(fullText: string | undefined, highlights: string[] | undefined): string {
  // Prefer highlighted fragments (they're contextually relevant to the query)
  if (highlights && highlights.length > 0) {
    return highlights
      .map((h) => h.replace(/<\/?em>/g, "**"))  // bold the matched terms
      .join(" … ")
      .slice(0, 1200);
  }
  if (fullText) return fullText.slice(0, 1200);
  return "";
}

function extractPageText(html: string, url: string): string {
  // Strip script/style blocks
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");

  // Try to find main content section
  const mainMatch = text.match(/<div[^>]+id=["']main-content["'][^>]*>([\s\S]+?)<\/div>/i)
    || text.match(/<div[^>]+class=["'][^"']*content[^"']*["'][^>]*>([\s\S]+?)<\/div>/i);

  const raw = mainMatch ? mainMatch[1] : text;

  // Strip remaining tags and decode entities
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim()
    .slice(0, 3000);
}
