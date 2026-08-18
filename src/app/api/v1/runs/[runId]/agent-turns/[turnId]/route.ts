import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string; turnId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId, turnId } = await context.params;
    const turn = await (await getStore()).getAgentTurn(user.id, runId, turnId);
    return NextResponse.json({ turn });
  } catch (error) { return errorResponse(error); }
}
