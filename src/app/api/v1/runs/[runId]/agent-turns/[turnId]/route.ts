import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string; turnId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId, turnId } = await context.params;
    const store=await getStore();const v10=await store.getV10Run(user.id,runId);
    const turn = v10?await store.getV10CompetitorTurn(user.id,runId,turnId):await store.getAgentTurn(user.id, runId, turnId);
    return NextResponse.json({ turn });
  } catch (error) { return errorResponse(error); }
}
