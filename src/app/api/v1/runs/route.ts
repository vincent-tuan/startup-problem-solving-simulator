import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getScenario } from "@/content/scenarios";
import { createRunSchema } from "@/server/api-schemas";
import { requireRequestUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { getStore } from "@/server/store";
import { projectRun, projectV10Run } from "@/server/store/projection";

export async function GET(request: NextRequest) {
  try { const user = await requireRequestUser(request); const store=await getStore();const legacy=(await store.listRuns(user.id)).map(projectRun);const v10=(await store.listV10Runs(user.id)).map(projectV10Run);return NextResponse.json({ runs: [...legacy,...v10].sort((a,b)=>b.lastPlayedAt.localeCompare(a.lastPlayedAt)) }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request); const user = await requireRequestUser(request); const body = createRunSchema.parse(await request.json());
    const scenario = getScenario(body.scenarioSlug,body.scenarioVersion);
    const draftAccess = process.env.NODE_ENV !== "production" || process.env.ALLOW_DRAFT_SCENARIOS === "1";
    if (!scenario || scenario.hidden || (scenario.status !== "published" && !(scenario.status === "draft" && draftAccess))) throw new Error("SCENARIO_NOT_FOUND");
    const seed = (randomBytes(4).readUInt32BE(0)&0x7fffffff) || 1;const store=await getStore();
    if(scenario.version.startsWith("3.")){const run=await store.createV10Run(user.id,scenario,body.setup,seed,new Date());return NextResponse.json({run:projectV10Run(run)},{status:201});}
    const run = await store.createRun(user.id, scenario, body.setup, seed, new Date());return NextResponse.json({ run: projectRun(run) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
