import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { refreshMarketDossierWorkflow } from "@/workflows/startup-world";

export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET; const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !supplied) return false;
  const expected = createHash("sha256").update(secret).digest(); const actual = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expected, actual);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const now = new Date(); const ids = ["ai-workflow-automation", "local-services-saas", "healthcare-operations"];
  const runs = await Promise.all(ids.map(async (scenarioId) => ({ scenarioId, runId: (await start(refreshMarketDossierWorkflow, [scenarioId, now.toISOString()])).runId })));
  return NextResponse.json({ capturedAt: now.toISOString(), status: "scheduled", workflows: runs }, { status: 202 });
}
