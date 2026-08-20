import { NextRequest, NextResponse } from "next/server";
import { checkpointSchema } from "@/server/api-schemas";
import { requireRequestUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try { const user = await requireRequestUser(request); const { runId } = await context.params;const store=await getStore();const v10=await store.getV10Run(user.id,runId);return NextResponse.json({ checkpoints:v10?await store.listV10Checkpoints(user.id,runId):await store.listCheckpoints(user.id, runId) }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try { assertSameOrigin(request); const user = await requireRequestUser(request); const { runId } = await context.params; const body = checkpointSchema.parse(await request.json());const store=await getStore();const v10=await store.getV10Run(user.id,runId); return NextResponse.json({ checkpoint:v10?await store.createV10Checkpoint(user.id,runId,body.name,new Date()):await store.createCheckpoint(user.id, runId, body.name, new Date()) }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
