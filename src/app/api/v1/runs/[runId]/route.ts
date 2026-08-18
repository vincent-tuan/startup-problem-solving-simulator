import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";
import { projectRun } from "@/server/store/projection";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId } = await context.params;
    const run = await (await getStore()).getRun(user.id, runId); if (!run) throw new Error("RUN_NOT_FOUND");
    return NextResponse.json({ run: projectRun(run) });
  } catch (error) { return errorResponse(error); }
}
