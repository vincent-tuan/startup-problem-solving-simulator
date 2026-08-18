import { NextResponse } from "next/server";
import { publicScenarios, scenarioContentHash, scenarioVersionId } from "@/content/scenarios";

export async function GET() {
  return NextResponse.json({ scenarios: publicScenarios.map((scenario) => ({
    ...scenario, versionId: scenarioVersionId(scenario), contentHash: scenarioContentHash(scenario),
  })) });
}
