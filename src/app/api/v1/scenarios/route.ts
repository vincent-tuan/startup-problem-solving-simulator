import { NextResponse } from "next/server";
import { getCatalogScenarios, scenarioContentHash, scenarioVersionId } from "@/content/scenarios";

export async function GET() {
  const includeDrafts = process.env.NODE_ENV !== "production" || process.env.ALLOW_DRAFT_SCENARIOS === "1";
  return NextResponse.json({ scenarios: getCatalogScenarios(includeDrafts).map((scenario) => ({
    ...scenario, versionId: scenarioVersionId(scenario), contentHash: scenarioContentHash(scenario),
  })) });
}
