import { NextRequest, NextResponse } from "next/server";
import { forkSchema } from "@/server/api-schemas";
import { requireRequestUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { getStore } from "@/server/store";
import { projectRun, projectV10Run } from "@/server/store/projection";

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try { assertSameOrigin(request); const user = await requireRequestUser(request); const { runId } = await context.params; const body = forkSchema.parse(await request.json());const store=await getStore();const v10=await store.getV10Run(user.id,runId);if(v10){const fork=await store.forkV10Run(user.id,runId,body.checkpointId,new Date());return NextResponse.json({run:projectV10Run(fork)},{status:201});} const run = await store.forkRun(user.id, runId, body.checkpointId, new Date()); return NextResponse.json({ run: projectRun(run) }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
