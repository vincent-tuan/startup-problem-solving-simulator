import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getScenario } from "@/content/scenarios";
import { createRunSchema } from "@/server/api-schemas";
import { requireRequestUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { getStore } from "@/server/store";
import { projectRun } from "@/server/store/projection";

export async function GET(request: NextRequest) {
  try { const user = await requireRequestUser(request); return NextResponse.json({ runs: (await (await getStore()).listRuns(user.id)).map(projectRun) }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request); const user = await requireRequestUser(request); const body = createRunSchema.parse(await request.json());
    const scenario = getScenario(body.scenarioSlug); if (!scenario || scenario.hidden || scenario.status !== "published") throw new Error("SCENARIO_NOT_FOUND");
    const seed = randomBytes(4).readUInt32BE(0) || 1;
    const run = await (await getStore()).createRun(user.id, scenario, body.setup, seed, new Date());
    return NextResponse.json({ run: projectRun(run) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
