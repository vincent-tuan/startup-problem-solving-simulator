import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId } = await context.params; const store = await getStore();
    const run = await store.getRun(user.id, runId); if (!run) throw new Error("RUN_NOT_FOUND");
    return NextResponse.json({
      intelligence: run.state.features?.public["market-intelligence"] ?? null,
      competitors: run.state.features?.public.competitors ?? null,
      externalInputCount: (run.state.externalInputRefs ?? []).length,
    });
  } catch (error) { return errorResponse(error); }
}
