import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMarketDossier } from "./market-intelligence";

afterEach(() => { vi.unstubAllGlobals(); delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_MARKET_MODEL; });

describe("daily market dossier ingestion", () => {
  it("publishes only facts whose URLs came from web-search citations", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.OPENAI_MARKET_MODEL = "pinned-test-model";
    const cited = "https://zapier.com/pricing"; const unsupported = "https://example.invalid/private-claim";
    const structured = {
      sources: [{ url: cited, title: "Plans and pricing", publisher: "Zapier" }, { url: unsupported, title: "Unsupported", publisher: "Unknown" }],
      facts: [
        { subjectId: "zapier", kind: "pricing", statement: "Zapier publishes a public pricing page.", value: null, unit: null, observedAt: "2026-08-18T00:00:00Z", confidence: 95, sourceUrls: [cited] },
        { subjectId: "zapier", kind: "funding", statement: "Unsupported private claim.", value: null, unit: null, observedAt: "2026-08-18T00:00:00Z", confidence: 80, sourceUrls: [unsupported] },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      output: [
        { type: "web_search_call", action: { type: "search", sources: [{ type: "url", url: cited }] } },
        { type: "message", content: [{ type: "output_text", text: JSON.stringify(structured) }] },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const result = await generateMarketDossier("ai-workflow-automation", new Date("2026-08-18T00:00:00Z"));
    expect(result.dossier.sources).toHaveLength(1); expect(result.dossier.facts).toHaveLength(1);
    expect(result.dossier.facts[0].statement).toContain("public pricing");
    expect(result.dossier.facts[0].sourceIds[0]).toBe(result.dossier.sources[0].id);
  });
});
