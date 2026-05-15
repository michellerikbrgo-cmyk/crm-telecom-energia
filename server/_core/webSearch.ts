/**
 * Pesquisa web opcional via [Tavily](https://tavily.com) — defina `TAVILY_API_KEY` no ambiente.
 * Usado pela IA para contexto sobre ofertas (ex.: Vodafone, concorrentes em Portugal).
 */
import { incrementGlobalApiUsage } from "./globalApiUsage";

export type WebSearchSnippet = { title: string; url: string; content: string };

export async function searchWebTavily(query: string): Promise<WebSearchSnippet[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return [];

  const q = query.trim().slice(0, 400);
  if (!q) return [];

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: q,
        search_depth: "basic",
        max_results: 6,
        include_answer: false,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[Tavily]", res.status, t.slice(0, 200));
      return [];
    }
    void incrementGlobalApiUsage("tavily");
    const j = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const rows = j.results ?? [];
    return rows
      .map((r) => ({
        title: String(r.title || "").trim() || "Sem título",
        url: String(r.url || "").trim(),
        content: String(r.content || "").trim().slice(0, 1200),
      }))
      .filter((r) => r.url.length > 0);
  } catch (e) {
    console.warn("[Tavily] fetch falhou:", e);
    return [];
  }
}

export function dedupeSnippetsByUrl(snippets: WebSearchSnippet[]): WebSearchSnippet[] {
  const seen = new Set<string>();
  const out: WebSearchSnippet[] = [];
  for (const s of snippets) {
    const u = s.url.toLowerCase();
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(s);
  }
  return out;
}
