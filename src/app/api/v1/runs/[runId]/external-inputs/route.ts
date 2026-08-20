import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId } = await context.params;
    const store=await getStore();const v10=await store.getV10Run(user.id,runId);
    return NextResponse.json({ inputs: v10?await store.listV10ExternalInputs(user.id,runId):await store.listExternalInputs(user.id, runId) });
  } catch (error) { return errorResponse(error); }
}
