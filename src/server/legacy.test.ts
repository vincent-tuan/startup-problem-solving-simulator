import { describe, expect, it } from "vitest";
import { migrateLegacySave } from "./legacy";

const valid = () => ({
  version: "6.0.0", rng: 42, cash: 327,
  meta: { companyName: "Legacy\u0000 Orbit", vertical: "aiops", difficulty: "realistic", founder: "builder", runway: "standard", jurisdiction: "domestic", architecture: "concierge", strategy: "smb" },
  history: [], bootstrap: { personalCash: 900, livingCost: 750, energy: 70, health: 80, burnout: 31, problemEvidence: 22, research: { budgetEvidence: 11, buyerClarity: 13, evidenceQuality: 17, evidenceDiversity: 9, designHistory: ["cold_targeted:interview"] }, productSystem: { reworkBacklog: 8 } },
  product: { ux: 12, reliability: 18 }, calendar: { month: 1, year: 2026, elapsed: 31 },
  game: { status: "active" }, problemOps: { absoluteDay: 31, monthlyFixedSavings: 20, monthlyServiceRevenue: 100, problems: [], actions: [], evidence: [], decisions: [{ day: 30, text: "Closed month one", type: "month_close" }] },
});

describe("legacy v6 importer",()=>{
  it("sanitizes and preserves a valid v6 save",()=>{const result=migrateLegacySave(valid(),new Date("2026-02-01T00:00:00Z"));expect(result.state.meta.companyName).toBe("Legacy Orbit");expect(result.state.finance.companyCash).toBe(327);expect(result.state.rng.state).toBe(42);expect(result.state.legacy?.sourceVersion).toBe("6.0.0");expect(result.events.at(-1)?.type).toBe("legacy_imported")});
  it("rejects unsupported versions",()=>expect(()=>migrateLegacySave({...valid(),version:"5.0.0"},new Date())).toThrow("UNSUPPORTED_LEGACY_VERSION"));
  it("rejects non-finite values before migration",()=>expect(()=>migrateLegacySave({...valid(),cash:Number.NaN},new Date())).toThrow("LEGACY_SAVE_NON_FINITE_NUMBER"));
  it("rejects oversized nested arrays",()=>expect(()=>migrateLegacySave({...valid(),unexpected:Array.from({length:2001},()=>0)},new Date())).toThrow("LEGACY_SAVE_ARRAY_TOO_LARGE"));
});
